import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_STATUS } from "@/lib/quoteStatus";
import { etiquetaModalidad, type TipoAlojamiento } from "@/lib/quotes/tarifar";
import { repartoHabitaciones } from "@/lib/leads/solicitudPrecio";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/**
 * La cotización que nace de un lead que la web no pudo cotizar.
 *
 * Por qué existe: hasta ahora una solicitud sin precio se guardaba en `comercial.web_leads`
 * y no creaba cotización —el precio es justo lo que no se puede calcular—, así que esas
 * personas no aparecían en el listado de cotizaciones, que es donde se mira. Vivían en un
 * panel aparte, y eso ya se cobró un susto: un lead cerrado desapareció de la vista.
 *
 * Ahora sí se crea, **vacía de precio** y en `sin_enviar`. No es una cotización a medias
 * por descuido: es el expediente abierto de alguien a quien hay que cotizarle en cuanto
 * Pilgrim conteste. Los números se rellenan entonces.
 *
 * Lo que NO hace, a propósito:
 *  - No genera PDF. No hay qué imprimir.
 *  - No manda ningún correo. El acuse al visitante y el aviso a reservas@ los manda el
 *    endpoint del lead, que es quien sabe qué decirle a cada uno.
 *  - No pone `valid_until`. Un precio que no existe no caduca, y la franja «Hoy» del
 *    seguimiento cuenta por esa fecha: rellenarla metería estos expedientes en el cubo de
 *    «vencidas» sin que hubiera nada vencido.
 */
export type LeadSinPrecio = {
  motivo: string;
  route_slug: string;
  route_name: string | null;
  tipo: string;
  start_date: string;
  people: number;
  full_name: string;
  email: string;
  phone: string;
  marketing_optin: boolean;
  /** La referencia que la web le enseñó al visitante (CS-WEB-…), si la hubo. */
  code_web: string | null;
};

const MOTIVO_TEXTO: Record<string, string> = {
  sin_tarifas_ano: "el año de salida no tiene tarifas cargadas para esa ruta y alojamiento",
  a_medida: "la ruta no tiene tarifa publicada y se arma a medida",
};

export async function crearCotizacionSinPrecio(
  supabase: AnyClient,
  lead: LeadSinPrecio,
): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
  // La ruta puede no estar en el catálogo (una `a_medida` que aún no se ha dado de alta).
  // No es motivo para no abrir el expediente: se guarda el nombre que mandó la web.
  const { data: route } = await supabase
    .from("routes")
    .select("id,name")
    .eq("slug", lead.route_slug)
    .maybeSingle();

  // Cliente: mismo dedup por teléfono que el cotizador con precio y que el wizard interno,
  // para que la misma persona no acabe con tres fichas según por dónde entró.
  const ahora = new Date().toISOString();
  const consentimientos = {
    marketing_optin: lead.marketing_optin,
    marketing_optin_at: ahora,
    terms_accepted_at: ahora,
  };
  let clientId: string | null = null;
  const { data: existente } = await supabase
    .from("clients")
    .select("id")
    .eq("phone", lead.phone)
    .maybeSingle();
  if (existente) {
    clientId = existente.id;
    await supabase
      .from("clients")
      .update({ full_name: lead.full_name, email: lead.email, ...consentimientos })
      .eq("id", existente.id);
  } else {
    const { data: creado } = await supabase
      .from("clients")
      .insert({ full_name: lead.full_name, phone: lead.phone, email: lead.email, ...consentimientos })
      .select("id")
      .single();
    clientId = creado?.id ?? null;
  }

  const { data: code, error: codeErr } = await supabase.rpc("next_quote_code");
  if (codeErr || !code) return { ok: false, error: "sin_codigo" };

  // La modalidad se calcula con la MISMA regla que usa el cotizador web (parejas en doble,
  // el impar en individual). Así el expediente dice desde el primer día qué habitaciones
  // hay que reservar, y coincide con lo que se le pidió a Pilgrim.
  const { dobles, individuales } = repartoHabitaciones(lead.people);
  const tipo = (lead.tipo === "hotel" ? "hotel" : "pension") as TipoAlojamiento;

  const motivo = MOTIVO_TEXTO[lead.motivo] ?? lead.motivo;
  const notas = [
    `Solicitud del cotizador de caminosacro.com que quedó SIN PRECIO: ${motivo}.`,
    lead.code_web ? `Referencia que vio el visitante: ${lead.code_web}.` : null,
    `El visitante NO vio ninguna cifra. Falta el precio de Pilgrim: cuando llegue, se cargan las tarifas o se teclean los importes aquí.`,
  ]
    .filter(Boolean)
    .join(" ");

  const { data: quote, error: quoteErr } = await supabase
    .from("quotes")
    .insert({
      code,
      client_id: clientId,
      client_name: lead.full_name,
      client_phone: lead.phone,
      client_email: lead.email,
      route_id: route?.id ?? null,
      route_name: route?.name ?? lead.route_name ?? lead.route_slug,
      start_date: lead.start_date,
      people: lead.people,
      modality: etiquetaModalidad(tipo, dobles, individuales),
      status: DEFAULT_STATUS,
      source: "wordpress",
      notes: notas,
      // Sin importes y sin `valid_until`: no hay precio que poner ni que caducar.
    })
    .select("id,code")
    .single();
  if (quoteErr || !quote) return { ok: false, error: "sin_cotizacion" };

  return { ok: true, id: quote.id, code: quote.code };
}
