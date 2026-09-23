import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { leerFilasHabitacion, personasDeFila, roomRowLabel } from "@/lib/quotes/rooms";
import { renderTemplate } from "@/lib/emailTemplate";
import { textosDe } from "@/lib/mensajes/plantillas";
import { getMensajes } from "@/lib/mensajes/settings";
import { getFirmantes } from "@/lib/contracts/render";
import { nombrePropio } from "@/lib/nombres";
import { aplicarReferenciaPilgrim } from "@/lib/quotes/pilgrimRef";

/**
 * Correo a Pilgrim: el detalle completo de la reserva a SUS precios, los viajeros con
 * su pasaporte, y la petición del link de pago.
 *
 * El TOTAL A PAGAR es exactamente `quotes.cost_eur`, el mismo número que el KPI
 * "Costo Pilgrim" del seguimiento. Salen de la misma fuente a propósito: si el correo
 * y la pantalla pudieran calcularlo por separado, tarde o temprano discreparían.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type PilgrimAdjunto = { path: string; nombre: string; viajero: string };

export type CorreoPilgrim = {
  subject: string;
  body: string;
  adjuntos: PilgrimAdjunto[];
  /** Viajeros que aún no han firmado y por tanto no tienen pasaporte. */
  pendientes: string[];
  total: number;
};

export type PilgrimSettings = { email: string; nombre: string; contacto: string };

export async function getPilgrimSettings(supabase: AnyClient): Promise<PilgrimSettings> {
  const { data } = await supabase.from("settings").select("value").eq("key", "pilgrim").maybeSingle();
  const v = (data?.value ?? {}) as Partial<PilgrimSettings>;
  return {
    email: String(v.email || ""),
    nombre: String(v.nombre || "Pilgrim"),
    contacto: String(v.contacto || ""),
  };
}

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";

/**
 * `new Date("2026-09-24")` se interpreta como medianoche UTC y, al formatear en
 * hora de Bogotá (UTC-5), retrocede al día 23. En un correo de confirmación de
 * reserva eso es una fecha de entrada equivocada, así que las fechas sin hora se
 * anclan a medianoche LOCAL.
 */
function aFechaLocal(d: unknown): Date | null {
  if (!d) return null;
  const s = String(d);
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const date = new Date(soloFecha ? `${s}T00:00:00` : s);
  return Number.isNaN(date.getTime()) ? null : date;
}

const fechaLarga = (d: unknown) => {
  const date = aFechaLocal(d);
  return date
    ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(date)
    : "—";
};

const fechaCorta = (d: unknown) => {
  const date = aFechaLocal(d);
  return date
    ? new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
    : "—";
};

/** Alinea "concepto ....... valor" a un ancho fijo para que la tabla se lea en texto plano. */
function linea(concepto: string, valor: string, ancho = 52): string {
  const c = concepto.length > ancho - 2 ? concepto.slice(0, ancho - 3) + "…" : concepto;
  return `${c} ${".".repeat(Math.max(2, ancho - c.length))} ${valor.padStart(11)}`;
}

const SEASON_LABEL: Record<string, string> = {
  high_season: "Suplemento temporada alta",
  easter: "Suplemento Semana Santa",
};

export async function armarCorreoPilgrim(
  supabase: AnyClient,
  quoteId: string,
): Promise<{ ok: true; correo: CorreoPilgrim } | { ok: false; error: string }> {
  const { data: quote } = await supabase
    .from("quotes")
    // Una sola cadena literal: partirla con `+` rompe la inferencia de tipos de Supabase.
    .select("id,code,route_id,route_name,modality,start_date,end_date,people,season_kind,cost_base_eur,season_supplement_cost_eur,cost_eur,rooms_json,pilgrim_ref")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { ok: false, error: "No encontré la cotización." };

  // Las frases del correo (saludo, primera línea, avisos de pasaportes, despedida) salen
  // de Configuración → Mensajes; los bloques de datos los sigue armando este archivo.
  // El firmante y la persona de contacto también son configurables y ya viven en settings.
  const [{ data: route }, { data: travelers }, { data: lines }, { data: contracts }, mensajes, pilgrim, firmantes] = await Promise.all([
    quote.route_name
      ? supabase.from("routes").select("origin,destination,days,nights").eq("name", quote.route_name).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("quote_travelers")
      .select("id,position,full_name,document_number,passport_path")
      .eq("quote_id", quoteId)
      .order("position"),
    supabase
      .from("quote_lines")
      .select("description,quantity,cost_unit,type")
      .eq("quote_id", quoteId)
      .in("type", ["optional", "custom", "discount"]),
    // Respaldo para los contratos anteriores a la migración 0036, por si algún
    // `passport_path` no alcanzó a copiarse a la ficha del viajero.
    supabase.from("contracts").select("traveler_id,status,passport_path").eq("quote_id", quoteId),
    getMensajes(supabase),
    getPilgrimSettings(supabase),
    getFirmantes(supabase),
  ]);
  const t = textosDe("pilgrim_reserva", mensajes);

  const personas = Number(quote.people) || 1;
  const costBase = Number(quote.cost_base_eur) || 0;
  const costSupp = Number(quote.season_supplement_cost_eur) || 0;
  const total = Number(quote.cost_eur) || 0;

  // ---- Datos del viaje ----
  const origen = route?.origin || "";
  const destino = route?.destination || "Santiago de Compostela";
  const dias = route?.days ?? null;
  const noches = route?.nights ?? (dias ? dias - 1 : null);

  const rooms = quote.rooms_json as { dobles?: number; individuales?: number } | null;
  let habitaciones = "";
  // El reparto a medida (dobles + triples + cuádruples) es justo lo que Pilgrim tiene que
  // reservar: si no va acá, el correo dice "7 personas" y ellos reparten como quieran.
  const filas = leerFilasHabitacion(quote.rooms_json);
  if (filas.length > 0) {
    habitaciones = filas
      .map((f) => `${f.habitaciones} ${roomRowLabel(f).toLowerCase()} (${personasDeFila(f)} pax)`)
      .join(" + ");
  } else if (rooms && (rooms.dobles || rooms.individuales)) {
    const partes: string[] = [];
    if (rooms.dobles) partes.push(`${rooms.dobles} doble${rooms.dobles === 1 ? "" : "s"}`);
    if (rooms.individuales) partes.push(`${rooms.individuales} individual${rooms.individuales === 1 ? "" : "es"}`);
    habitaciones = partes.join(" + ");
  }

  const datos = [
    `Referencia Camino Sacro:  ${quote.code}`,
    `Ruta:                     ${quote.route_name || "—"}${origen ? ` (${origen} → ${destino})` : ""}`,
    `Fecha de inicio:          ${fechaLarga(quote.start_date)}`,
    `Fecha de fin:             ${fechaLarga(quote.end_date)}`,
    ...(dias ? [`Duración:                 ${dias} días · ${noches} noches`] : []),
    `Personas:                 ${personas}`,
    `Alojamiento:              ${quote.modality || "—"}`,
    ...(habitaciones ? [`Habitaciones:             ${habitaciones}`] : []),
  ];

  // ---- Viajeros y sus pasaportes ----
  // El pasaporte se lee de la ficha del VIAJERO, no del contrato: con contrato de empresa
  // nadie firma individualmente y los pasaportes los carga el equipo desde el CRM. El
  // contrato queda solo como respaldo de lo anterior a la migración 0036.
  const porViajero = new Map<string, { status: string; passport_path: string | null }>();
  for (const c of contracts || []) {
    if (!c.traveler_id) continue;
    porViajero.set(c.traveler_id as string, {
      status: String(c.status),
      passport_path: (c.passport_path as string | null) ?? null,
    });
  }

  const adjuntos: PilgrimAdjunto[] = [];
  const pendientes: string[] = [];
  const filasViajeros: string[] = [];

  for (const t of travelers || []) {
    const c = porViajero.get(t.id as string);
    const doc = (t.document_number as string | null) || null;
    const pasaporte = (t.passport_path as string | null) || c?.passport_path || null;
    const tienePasaporte = !!pasaporte;
    if (tienePasaporte) {
      adjuntos.push({
        path: pasaporte!,
        nombre: `Pasaporte-${quote.code}-${t.position}.${(pasaporte!.split(".").pop() || "jpg").toLowerCase()}`,
        viajero: String(t.full_name),
      });
    } else {
      pendientes.push(String(t.full_name));
    }
    filasViajeros.push(
      `${t.position}. ${t.full_name} — ${doc ? `Pasaporte ${doc}` : "pasaporte pendiente"}` +
        (tienePasaporte ? "   (pasaporte adjunto)" : ""),
    );
  }
  if (filasViajeros.length === 0) filasViajeros.push("(sin viajeros cargados)");

  // ---- Tarifas a precio Pilgrim ----
  const tarifas: string[] = [];
  if (costBase > 0) {
    tarifas.push(linea(`Ruta — ${quote.modality || "alojamiento"} × ${personas}`, eur(costBase)));
  }
  if (costSupp > 0) {
    const etiqueta = SEASON_LABEL[String(quote.season_kind)] || "Suplemento de temporada";
    tarifas.push(linea(`${etiqueta} × ${personas}`, eur(costSupp)));
  }
  for (const l of lines || []) {
    const cantidad = Number(l.quantity) || 0;
    const unitario = Number(l.cost_unit) || 0;
    const subtotal = cantidad * unitario * (l.type === "discount" ? -1 : 1);
    if (subtotal === 0) continue;
    tarifas.push(linea(`${l.description} × ${cantidad}`, eur(subtotal)));
  }
  if (tarifas.length === 0) tarifas.push(linea("Sin conceptos cargados", eur(0)));

  const refPilgrim = String(quote.pilgrim_ref ?? "").trim();
  const subject = renderTemplate(t.asunto, {
    referencia_pilgrim: refPilgrim,
    codigo: quote.code,
    ruta: quote.route_name || "Camino de Santiago",
    fecha: fechaCorta(quote.start_date),
    personas,
    peregrinos: personas === 1 ? "peregrino" : "peregrinos",
  });

  const contacto = pilgrim.contacto.trim();
  const saludo = contacto
    ? renderTemplate(t.saludo, { contacto })
    : renderTemplate(t.saludo_sin_contacto, { proveedor: pilgrim.nombre || "Pilgrim" });

  const avisoPasaportes =
    adjuntos.length === 0
      ? t.adjuntos_ninguno
      : adjuntos.length === 1
        ? t.adjuntos_uno
        : renderTemplate(t.adjuntos_varios, { cuantos: adjuntos.length });

  const body = [
    saludo,
    ``,
    t.intro,
    ``,
    t.titulo_datos,
    ...datos,
    ``,
    t.titulo_viajeros,
    ...filasViajeros,
    ``,
    t.titulo_tarifas,
    ...tarifas,
    ` ${"-".repeat(64)}`,
    linea("TOTAL A PAGAR", eur(total)),
    ``,
    avisoPasaportes,
    ...(pendientes.length > 0
      ? [renderTemplate(t.pendientes, { lista: pendientes.join(", ") })]
      : []),
    t.cierre,
    ``,
    // El firmante viene de settings en mayúsculas sostenidas (así va en el contrato);
    // en un correo eso es gritar.
    renderTemplate(t.firma, { firmante: nombrePropio(firmantes[0]?.nombre) || "Nicolás Villa Posada" }),
  ].join("\n");

  // La referencia de Pilgrim, si ya la hay: en el asunto y en los datos del viaje. Si la
  // plantilla del asunto ya la trae con {{referencia_pilgrim}}, no se repite.
  const conRef = aplicarReferenciaPilgrim(subject, body, refPilgrim);
  const yaEnAsunto = !!refPilgrim && subject.includes(refPilgrim);

  return {
    ok: true,
    correo: { subject: yaEnAsunto ? subject : conRef.subject, body: conRef.body, adjuntos, pendientes, total },
  };
}
