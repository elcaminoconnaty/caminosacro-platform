import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { detectSeason, DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { mensajeError } from "@/lib/errors";
import { quoteYear, ratesForYear } from "@/lib/pricing/year";

const PDF_URL_TTL = 60 * 60 * 24 * 7; // 7 días, igual que el resto de la plataforma.

/** Tope del CRM. El cotizador público topa en 12; por Telegram cotiza Nico, no un visitante. */
export const MAX_PERSONAS_AGENTE = 30;

/**
 * Cotización creada por BayMax desde Telegram.
 *
 * Se parece a crearCotizacionWordPress (webQuote.ts) —mismo orden de pasos y las
 * mismas reglas de precio— pero se diferencia en cuatro cosas, y por eso no se
 * reusa aquélla:
 *
 *  1. Tope de 30 personas (el del CRM), no 12.
 *  2. `source = 'baymax'`, para que en Seguimiento se vea quién la creó.
 *  3. Acepta las cuatro modalidades del CRM, no solo el reparto de la web.
 *  4. **No manda el correo al cliente.** Se corta después del PDF: el envío es un
 *     paso aparte que Nico aprueba por Telegram (docs/CONVENCIONES.md §5).
 *
 * Tampoco escribe consentimientos: `marketing_optin` y `terms_accepted_at` los
 * captura un checkbox que la persona marca de verdad en el cotizador web. Aquí no
 * hay checkbox, y darlos por firmados sería inventar un consentimiento.
 */

export type ModalidadAgente = "pension_doble" | "pension_single" | "hotel_doble" | "hotel_single";

export type SolicitudAgente = {
  route_slug: string;
  modalidad: ModalidadAgente;
  start_date: string; // YYYY-MM-DD
  people: number;
  full_name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
};

export type DesgloseAgente = {
  people: number;
  rooms: { dobles: number; en_doble: number; individuales: number };
  tarifa_doble: number;
  tarifa_indiv: number;
  base_eur: number;
  season: { kind: "regular" | "high_season" | "easter"; label: string; per_person: number; total: number };
  total_eur: number;
  /** Lo que se le paga a Pilgrim. Interno: nunca sale al cliente. */
  cost_eur: number;
};

export type ResultadoAgente =
  | {
      ok: true;
      id: string;
      code: string;
      pdf_url: string | null;
      modalidad_label: string;
      breakdown: DesgloseAgente;
      faltantes: string[];
    }
  | { ok: false; status: number; error: string; detalle?: string };

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function crearCotizacionAgente(datos: SolicitudAgente): Promise<ResultadoAgente> {
  const supabase = createAdminClient("comercial");

  if (datos.people < 1 || datos.people > MAX_PERSONAS_AGENTE) {
    return { ok: false, status: 422, error: "personas_fuera_de_rango", detalle: `Entre 1 y ${MAX_PERSONAS_AGENTE}.` };
  }

  // 1. Ruta. A diferencia del cotizador web NO se filtra por `web`: desde el CRM se
  //    cotizan también las rutas que no están publicadas en el sitio.
  const { data: route } = await supabase
    .from("routes")
    .select("id,name,days")
    .eq("slug", datos.route_slug)
    .eq("active", true)
    .maybeSingle();
  if (!route) return { ok: false, status: 404, error: "ruta_no_encontrada" };

  const tipo = datos.modalidad.startsWith("hotel") ? "hotel" : "pension";
  const todosIndividuales = datos.modalidad.endsWith("_single");
  const modDoble = `${tipo}_doble`;
  const modSingle = `${tipo}_single`;

  const [{ data: precios }, { data: seasonSetting }] = await Promise.all([
    supabase
      .from("pricing")
      .select("modality,year,price_cs,price_pilgrim")
      .eq("route_id", route.id)
      .eq("season", "regular")
      .in("modality", [modDoble, modSingle]),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
  ]);

  // La tarifa es la del año de SALIDA, con coincidencia exacta y sin caer al año
  // anterior: cotizar 2027 con la tarifa de 2026 es cobrar de menos en silencio.
  const salidaYear = quoteYear(datos.start_date);
  const todas = (precios || []) as Array<{ modality: string; year: number | null; price_cs: number | string | null; price_pilgrim: number | string | null }>;
  const rows = ratesForYear(todas, salidaYear);

  const fila = (m: string) => rows.find((p) => p.modality === m);
  const tarifaDoble = Number(fila(modDoble)?.price_cs) || 0;
  const tarifaSingle = Number(fila(modSingle)?.price_cs) || 0;
  // Con todos en individual basta la tarifa single; con reparto automático hacen
  // falta las dos, porque un grupo impar deja a alguien en individual.
  const faltaTarifa = todosIndividuales ? tarifaSingle <= 0 : tarifaDoble <= 0 || tarifaSingle <= 0;
  if (faltaTarifa) {
    const enOtroAno = todas.some((p) => (Number(p.price_cs) || 0) > 0);
    return enOtroAno
      ? { ok: false, status: 409, error: "sin_tarifas_ano", detalle: `La ruta no tiene tarifa ${tipo} cargada para ${salidaYear}.` }
      : { ok: false, status: 404, error: "ruta_sin_precio", detalle: `La ruta no tiene tarifa ${tipo} en ningún año.` };
  }

  // 2. Reparto de habitaciones: pares en doble y el impar en individual, salvo que
  //    se pida todo el grupo en individual.
  const dobles = todosIndividuales ? 0 : Math.floor(datos.people / 2);
  const enDoble = dobles * 2;
  const individuales = datos.people - enDoble;

  // 3. Temporada sobre el viaje completo (salida → último día).
  const seasonConfig = (seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS;
  const endDate = route.days ? sumarDias(datos.start_date, route.days - 1) : datos.start_date;
  const season = detectSeason(datos.start_date, endDate, seasonConfig);

  const baseEur = enDoble * tarifaDoble + individuales * tarifaSingle;
  const suplementoEur = season.surcharge_per_person_cs * datos.people;
  const totalEur = baseEur + suplementoEur;

  const pilgrimDoble = Number(fila(modDoble)?.price_pilgrim) || 0;
  const pilgrimSingle = Number(fila(modSingle)?.price_pilgrim) || 0;
  const costBaseEur = enDoble * pilgrimDoble + individuales * pilgrimSingle;
  const suplementoCostEur = season.surcharge_per_person_pilgrim * datos.people;
  const costEur = costBaseEur + suplementoCostEur;

  // 4. Cliente: dedup por teléfono, igual que el wizard interno. Sin consentimientos:
  //    ver la nota de arriba.
  const email = datos.email?.trim() || null;
  let clientId: string | null = null;
  const { data: existente } = await supabase.from("clients").select("id").eq("phone", datos.phone).maybeSingle();
  if (existente) {
    clientId = existente.id;
    const cambios: Record<string, string> = { full_name: datos.full_name };
    if (email) cambios.email = email; // no borra el correo que ya hubiera
    await supabase.from("clients").update(cambios).eq("id", existente.id);
  } else {
    const { data: creado } = await supabase
      .from("clients")
      .insert({ full_name: datos.full_name, phone: datos.phone, email })
      .select("id")
      .single();
    clientId = creado?.id ?? null;
  }

  // 5. Cotización. La etiqueta refleja el reparto real de habitaciones.
  const tipoNombre = tipo === "hotel" ? "Hotel" : "Pensión";
  const modalityLabel =
    individuales === 0
      ? `${tipoNombre}, habitación doble`
      : dobles === 0
        ? `${tipoNombre}, habitación individual`
        : `${tipoNombre} · ${dobles} ${dobles === 1 ? "doble" : "dobles"} + ${individuales} individual${individuales === 1 ? "" : "es"}`;

  const { data: code, error: codeErr } = await supabase.rpc("next_quote_code");
  if (codeErr) return { ok: false, status: 500, error: mensajeError(codeErr, "sin_codigo") };

  const nota = [datos.notes?.trim(), "Creada por BayMax desde Telegram."].filter(Boolean).join("\n");

  const { data: quote, error: quoteErr } = await supabase
    .from("quotes")
    .insert({
      code,
      client_id: clientId,
      client_name: datos.full_name,
      client_phone: datos.phone,
      client_email: email,
      route_id: route.id,
      route_name: route.name,
      start_date: datos.start_date,
      end_date: endDate,
      valid_until: sumarDias(new Date().toISOString().slice(0, 10), 30),
      people: datos.people,
      modality: modalityLabel,
      base_eur: baseEur,
      season_supplement_eur: suplementoEur,
      season_kind: season.type,
      total_eur: totalEur,
      cost_base_eur: costBaseEur,
      season_supplement_cost_eur: suplementoCostEur,
      cost_eur: costEur,
      status: "enviada",
      source: "baymax",
      notes: nota,
      rooms_json: { tipo, dobles, individuales, tarifa_doble: tarifaDoble, tarifa_single: tarifaSingle },
      price_note: null,
    })
    .select("id,code")
    .single();
  if (quoteErr || !quote) {
    return { ok: false, status: 500, error: mensajeError(quoteErr, "sin_cotizacion") };
  }

  // 6. El MISMO PDF de la plataforma, en el bucket comercial-quotes y visible desde
  //    el CRM. A Telegram solo va la URL firmada.
  let pdfUrl: string | null = null;
  const pdf = await renderAndStoreQuotePdf(supabase, quote.id);
  if ("ok" in pdf && pdf.ok) {
    const { data: fresh } = await supabase.from("quotes").select("pdf_path").eq("id", quote.id).maybeSingle();
    const filePath = (fresh?.pdf_path ?? "").replace(/^comercial-quotes\//, "");
    if (filePath) {
      const { data: signed } = await supabase.storage.from("comercial-quotes").createSignedUrl(filePath, PDF_URL_TTL);
      pdfUrl = signed?.signedUrl ?? null;
    }
  } else {
    console.error("[agente-quote] PDF falló para", quote.code, "error" in pdf ? pdf.error : "");
  }

  return {
    ok: true,
    id: quote.id,
    code: quote.code,
    pdf_url: pdfUrl,
    modalidad_label: modalityLabel,
    faltantes: [
      ...(email ? [] : ["correo_cliente"]),
      ...(pdfUrl ? [] : ["pdf"]),
    ],
    breakdown: {
      people: datos.people,
      rooms: { dobles, en_doble: enDoble, individuales },
      tarifa_doble: tarifaDoble,
      tarifa_indiv: tarifaSingle,
      base_eur: baseEur,
      season: {
        kind: season.type,
        label: season.label,
        per_person: season.surcharge_per_person_cs,
        total: suplementoEur,
      },
      total_eur: totalEur,
      cost_eur: costEur,
    },
  };
}
