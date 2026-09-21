import "server-only";

/**
 * El HTML del correo de cotización, para los tres caminos por los que sale una.
 *
 * Los tres mandan el mismo correo al mismo tipo de persona —alguien que acaba de pedir
 * precio— y solo cambia quién lo dispara: la tarjeta del CRM, el cotizador público de
 * /cotizar y el cotizador de caminosacro.com. Hasta ahora solo el del CRM iba maquetado y
 * los otros dos salían en texto plano, así que el mismo cliente veía una cosa u otra según
 * por dónde hubiera entrado.
 *
 * El cuerpo no se toca: viene de la plantilla `cotizacion_enviada` (y en el CRM, de lo que
 * Nico escriba encima). Acá solo se envuelve.
 */
import { correoCotizacionHtml } from "@/lib/quotes/emailHtml";
import { nuevoTokenCorreo, urlVersionWeb } from "@/lib/email/versionWeb";
import { getTravelDocTexts } from "@/lib/travelDocs/texts";
import type { ComercialClient } from "@/lib/quotes/pdf";

export type CorreoCotizacionArmado = {
  html: string;
  /** Token de la versión web; se guarda en `email_log` junto al HTML que se envió. */
  token: string;
};

/**
 * Arma el HTML a partir de la cotización guardada. Devuelve `null` si la cotización no
 * existe: el correo sale igual en texto plano, que es como salía antes.
 */
export async function armarHtmlCotizacion(
  supabase: ComercialClient,
  quoteId: string,
  opciones: { cuerpo: string; adjunto: string | null },
): Promise<CorreoCotizacionArmado | null> {
  const { data: q } = await supabase
    .from("quotes")
    .select("code,route_name,start_date,people,modality,total_eur,valid_until")
    .eq("id", quoteId)
    .maybeSingle();
  if (!q) return null;

  // El token se saca antes de armar el HTML porque el enlace de la versión web va DENTRO
  // de ese HTML, y luego se guarda tal cual para que la página sirva lo mismo que llegó.
  const token = nuevoTokenCorreo();
  // Contacto desde settings, no del código: es el mismo que usan la documentación de
  // viaje y su correo, y tenerlo en dos sitios es cómo terminan diciendo cosas distintas.
  const contacto = (await getTravelDocTexts(supabase)).contacto;

  const html = correoCotizacionHtml({
    code: String(q.code),
    cuerpo: opciones.cuerpo,
    ruta: (q.route_name as string | null) ?? null,
    fechaInicio: (q.start_date as string | null) ?? null,
    personas: Number(q.people) || 1,
    alojamiento: (q.modality as string | null) ?? null,
    totalEur: q.total_eur != null ? Number(q.total_eur) : null,
    validaHasta: (q.valid_until as string | null) ?? null,
    adjunto: opciones.adjunto,
    telefono: contacto.whatsapp || contacto.telefono || "",
    email: contacto.email || "reservas@caminosacro.com",
    web: contacto.web || "www.caminosacro.com",
    urlVersionWeb: urlVersionWeb(token),
  });

  return { html, token };
}
