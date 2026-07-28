import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
    .select("id,code,route_id,route_name,modality,start_date,end_date,people,season_kind,cost_base_eur,season_supplement_cost_eur,cost_eur,rooms_json")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { ok: false, error: "No encontré la cotización." };

  const [{ data: route }, { data: travelers }, { data: lines }, { data: contracts }] = await Promise.all([
    quote.route_name
      ? supabase.from("routes").select("origin,destination,days,nights").eq("name", quote.route_name).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("quote_travelers")
      .select("id,position,full_name,document_number")
      .eq("quote_id", quoteId)
      .order("position"),
    supabase
      .from("quote_lines")
      .select("description,quantity,cost_unit,type")
      .eq("quote_id", quoteId)
      .in("type", ["optional", "custom", "discount"]),
    supabase.from("contracts").select("traveler_id,status,passport_path").eq("quote_id", quoteId),
  ]);

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
  if (rooms && (rooms.dobles || rooms.individuales)) {
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
  const porViajero = new Map<string, { status: string; passport_path: string | null }>();
  for (const c of contracts || []) {
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
    const tienePasaporte = !!c?.passport_path;
    if (tienePasaporte) {
      adjuntos.push({
        path: c!.passport_path!,
        nombre: `Pasaporte-${quote.code}-${t.position}.${(c!.passport_path!.split(".").pop() || "jpg").toLowerCase()}`,
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

  const subject =
    `Reserva ${quote.code} — ${quote.route_name || "Camino de Santiago"} — ` +
    `salida ${fechaCorta(quote.start_date)} — ${personas} peregrino${personas === 1 ? "" : "s"}`;

  const body = [
    `Hola Pilgrim,`,
    ``,
    `Confirmamos la siguiente reserva y quedamos atentos al link de pago.`,
    ``,
    `DATOS DEL VIAJE`,
    ...datos,
    ``,
    `VIAJEROS`,
    ...filasViajeros,
    ``,
    `SERVICIOS Y TARIFAS (precios Pilgrim)`,
    ...tarifas,
    ` ${"-".repeat(64)}`,
    linea("TOTAL A PAGAR", eur(total)),
    ``,
    adjuntos.length > 0
      ? `Adjuntamos ${adjuntos.length === 1 ? "el pasaporte del viajero" : `los ${adjuntos.length} pasaportes de los viajeros`}.`
      : `Los pasaportes se los enviamos en cuanto los tengamos.`,
    ...(pendientes.length > 0
      ? [`Pendientes de pasaporte: ${pendientes.join(", ")}.`]
      : []),
    `Por favor envíennos el link de pago para realizar la transferencia.`,
    ``,
    `Gracias,`,
    `Nicolás Villa Posada`,
    `Camino Sacro — reservas@caminosacro.com`,
  ].join("\n");

  return { ok: true, correo: { subject, body, adjuntos, pendientes, total } };
}
