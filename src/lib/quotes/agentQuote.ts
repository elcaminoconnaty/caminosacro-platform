import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { mensajeError } from "@/lib/errors";
import { firmarPdf } from "@/lib/quotes/pdfUrl";
import { sumarDias, tarifarRuta, type TipoAlojamiento } from "@/lib/quotes/tarifar";

/** Tope del CRM. El cotizador público topa en 12; por Telegram cotiza Nico, no un visitante. */
export const MAX_PERSONAS_AGENTE = 30;

/**
 * Cotización creada por BayMax desde Telegram.
 *
 * El cálculo —tarifa del año de salida, reparto de habitaciones, temporada— es el de
 * `@/lib/quotes/tarifar`, el mismo que usa el cotizador de la web. Lo que cambia acá:
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
      /** Camino en bici: hay que ofrecer la flota y nombrar la fianza. */
      ruta_en_bici: boolean;
    }
  | { ok: false; status: number; error: string; detalle?: string };

export async function crearCotizacionAgente(datos: SolicitudAgente): Promise<ResultadoAgente> {
  const supabase = createAdminClient("comercial");

  if (datos.people < 1 || datos.people > MAX_PERSONAS_AGENTE) {
    return { ok: false, status: 422, error: "personas_fuera_de_rango", detalle: `Entre 1 y ${MAX_PERSONAS_AGENTE}.` };
  }

  // 1. Ruta. A diferencia del cotizador web NO se filtra por `web`: desde el CRM se
  //    cotizan también las rutas que no están publicadas en el sitio.
  const { data: route } = await supabase
    .from("routes")
    .select("id,name,days,modality")
    .eq("slug", datos.route_slug)
    .eq("active", true)
    .maybeSingle();
  if (!route) return { ok: false, status: 404, error: "ruta_no_encontrada" };

  const tipo: TipoAlojamiento = datos.modalidad.startsWith("hotel") ? "hotel" : "pension";
  const todosIndividuales = datos.modalidad.endsWith("_single");

  // 2. Precio, habitaciones y temporada: el módulo compartido.
  const r = await tarifarRuta(supabase, {
    route: { id: route.id, name: route.name, days: route.days },
    tipo,
    todosIndividuales,
    personas: datos.people,
    startDate: datos.start_date,
  });
  if (!r.ok) return { ok: false, status: r.status, error: r.error, detalle: r.detalle };
  const t = r.tarifa;

  // 3. Cliente: dedup por teléfono, igual que el wizard interno. Sin consentimientos:
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
      end_date: t.endDate,
      valid_until: sumarDias(new Date().toISOString().slice(0, 10), 30),
      people: datos.people,
      modality: t.modalityLabel,
      base_eur: t.baseEur,
      season_supplement_eur: t.suplementoEur,
      season_kind: t.season.type,
      total_eur: t.totalEur,
      cost_base_eur: t.costBaseEur,
      season_supplement_cost_eur: t.suplementoCostEur,
      cost_eur: t.costEur,
      status: "enviada",
      source: "baymax",
      notes: nota,
      rooms_json: t.roomsJson,
      price_note: null,
    })
    .select("id,code")
    .single();
  if (quoteErr || !quote) {
    return { ok: false, status: 500, error: mensajeError(quoteErr, "sin_cotizacion") };
  }

  // 4. El MISMO PDF de la plataforma, en el bucket comercial-quotes y visible desde
  //    el CRM. A Telegram solo va la URL firmada.
  const pdf = await renderAndStoreQuotePdf(supabase, quote.id);
  if (!("ok" in pdf && pdf.ok)) {
    console.error("[agente-quote] PDF falló para", quote.code, "error" in pdf ? pdf.error : "");
  }
  const pdfUrl = await firmarPdf(supabase, quote.id);

  return {
    ok: true,
    id: quote.id,
    code: quote.code,
    pdf_url: pdfUrl,
    modalidad_label: t.modalityLabel,
    ruta_en_bici: String(route.modality || "").toLowerCase() === "bici",
    faltantes: [
      ...(email ? [] : ["correo_cliente"]),
      ...(pdfUrl ? [] : ["pdf"]),
    ],
    breakdown: {
      people: datos.people,
      rooms: { dobles: t.dobles, en_doble: t.enDoble, individuales: t.individuales },
      tarifa_doble: t.tarifaDoble,
      tarifa_indiv: t.tarifaSingle,
      base_eur: t.baseEur,
      season: {
        kind: t.season.type,
        label: t.season.label,
        per_person: t.season.surcharge_per_person_cs,
        total: t.suplementoEur,
      },
      total_eur: t.totalEur,
      cost_eur: t.costEur,
    },
  };
}
