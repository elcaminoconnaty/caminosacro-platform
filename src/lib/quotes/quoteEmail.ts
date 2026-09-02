import "server-only";

import type { ComercialClient } from "@/lib/quotes/pdf";
import { renderTemplate } from "@/lib/emailTemplate";
import { fechaCorta } from "@/lib/format";

/**
 * Arma el correo del cliente para una cotización: la plantilla
 * `cotizacion_enviada` del CRM (comercial.email_templates) renderizada con los
 * datos reales de la cotización. Es el MISMO mensaje que el equipo ve en la
 * tarjeta de correo del CRM: si se edita la plantilla allá, este correo cambia
 * solo.
 *
 * Variables: réplica de buildTemplateVars del detalle de seguimiento, sin TRM
 * (aquí no hay tasa de cambio; {{total_cop}} sale "—" y {{trm}} vacío, y la
 * plantilla vigente no usa ninguna de las dos).
 *
 * Devuelve null si algo falta (sin plantilla, sin cotización): el envío del
 * correo nunca debe tumbar la creación de la cotización.
 */
export async function armarCorreoCotizacion(
  supabase: ComercialClient,
  quoteId: string,
): Promise<{ subject: string; body: string } | null> {
  try {
    const [{ data: quote }, { data: tpl }] = await Promise.all([
      supabase
        .from("quotes")
        .select("code,client_name,route_name,route_id,modality,start_date,end_date,people,valid_until,total_eur")
        .eq("id", quoteId)
        .maybeSingle(),
      supabase
        .from("email_templates")
        .select("subject,body_md")
        .eq("slug", "cotizacion_enviada")
        .eq("active", true)
        .maybeSingle(),
    ]);
    if (!quote || !tpl?.subject || !tpl?.body_md) return null;

    let routeMeta: { days: number | null; nights: number | null; origin: string | null; destination: string | null } | null = null;
    // Por id y, si no hay, por nombre: `route_id` es null en la mayoría de las
    // cotizaciones internas y sin este respaldo {{dias_camino}} y {{duracion}} salían
    // vacías, dejando el hueco en la frase del correo del cliente. Es el mismo patrón
    // que ya usan pdf.ts, editQuote.ts y la tarjeta de correo del seguimiento.
    if (quote.route_id || quote.route_name) {
      const consulta = supabase.from("routes").select("days,nights,origin,destination");
      const { data: route } = quote.route_id
        ? await consulta.eq("id", quote.route_id).maybeSingle()
        : await consulta.eq("name", quote.route_name).maybeSingle();
      if (route) {
        routeMeta = {
          days: route.days ?? null,
          nights: route.nights ?? null,
          origin: route.origin ?? null,
          destination: route.destination ?? null,
        };
      }
    }

    const vars = armarVariables(quote, Number(quote.total_eur) || 0, routeMeta);
    return {
      subject: renderTemplate(tpl.subject, vars),
      body: renderTemplate(tpl.body_md, vars),
    };
  } catch (e) {
    console.error("[quote-email] no se pudo armar el correo:", e);
    return null;
  }
}

// Réplica de buildTemplateVars de seguimiento/[id]/page.tsx (sin TRM). Si se
// agrega una variable a las plantillas, hay que añadirla en ambos lados.
function armarVariables(
  quote: Record<string, unknown>,
  total: number,
  routeMeta: { days: number | null; nights: number | null; origin: string | null; destination: string | null } | null,
): Record<string, string | number | null | undefined> {
  const fmtEur = (n: number) =>
    new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n) + " €";
  const fechaLarga = (d: unknown) =>
    d
      ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(String(d)))
      : "";

  const fullName = String(quote.client_name || "").trim();
  const firstName = fullName.split(/\s+/)[0] || fullName;

  const fechasLargas =
    quote.start_date && quote.end_date
      ? `${fechaLarga(quote.start_date)} al ${fechaLarga(quote.end_date)}`
      : fechaLarga(quote.start_date) || fechaLarga(quote.end_date) || "";

  const days = routeMeta?.days ?? null;
  const nights = routeMeta?.nights ?? (days ? days - 1 : null);
  const duracion = days ? `${days} días${nights ? ` · ${nights} noches` : ""}` : "";

  const modality = String(quote.modality || "").toLowerCase();
  let alojamientoDesc = "";
  if (modality.includes("pensión doble") || modality.includes("pension doble")) {
    alojamientoDesc = "Pensión mayormente; en las localidades sin disponibilidad de pensión, alojamiento en hoteles · Habitación doble";
  } else if (modality.includes("pensión single") || modality.includes("pension single")) {
    alojamientoDesc = "Pensión mayormente; en las localidades sin disponibilidad de pensión, alojamiento en hoteles · Habitación individual";
  } else if (modality.includes("hotel doble")) {
    alojamientoDesc = "Hotel · Habitación doble";
  } else if (modality.includes("hotel single")) {
    alojamientoDesc = "Hotel · Habitación individual";
  } else if (modality) {
    alojamientoDesc = String(quote.modality);
  }

  const routeName = String(quote.route_name || "");
  const origin = routeMeta?.origin || "";
  const destination = routeMeta?.destination || "Santiago";
  const ruta = origin
    ? `Camino ${routeName.replace(/^Camino\s+/i, "")} — ${origin} → ${destination}`
    : routeName;
  const rutaDescripcion = origin
    ? `${routeName} desde ${origin} hasta ${destination}`
    : routeName;

  return {
    code: String(quote.code || ""),
    nombre: firstName,
    nombre_completo: fullName,
    ruta,
    ruta_descripcion: rutaDescripcion,
    dias_camino: days ? String(days - 1) : "", // días caminando = días - 1 (llegada)
    duracion,
    fechas_largas: fechasLargas,
    fechas: quote.start_date && quote.end_date ? `${fechaCorta(String(quote.start_date))} → ${fechaCorta(String(quote.end_date))}` : "",
    personas: String(quote.people || 1),
    alojamiento_descripcion: alojamientoDesc,
    precio_total: fmtEur(total),
    total_eur: fmtEur(total),
    total_cop: "—",
    trm: "",
    validez: fechaLarga(quote.valid_until),
  };
}
