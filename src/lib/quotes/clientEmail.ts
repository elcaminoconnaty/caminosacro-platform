import "server-only";

import { enviarCorreoWebhook } from "@/lib/email/webhook";
import { mensajeError } from "@/lib/errors";
import { renderAndStoreQuotePdf, type ComercialClient } from "@/lib/quotes/pdf";

/**
 * Envío del correo de cotización al cliente, con su PDF adjunto.
 *
 * Vive acá y no dentro de la server action porque lo disparan dos caminos: la
 * tarjeta de correo del seguimiento (sesión del CRM) y el endpoint del agente
 * (BayMax, con el cliente admin). Un solo lugar donde se decide qué se manda:
 * si estuviera duplicado, tarde o temprano los dos correos discreparían.
 */

export const EMAIL_PDF_TTL = 60 * 60 * 24 * 7; // 7 días

export async function enviarCorreoCliente(
  supabase: ComercialClient,
  quoteId: string,
  mensaje: { subject: string; body: string },
): Promise<{ ok?: true; email?: string; error?: string }> {
  const subject = mensaje.subject.trim();
  const body = mensaje.body.trim();
  if (!subject) return { error: "El asunto no puede estar vacío." };
  if (!body) return { error: "El cuerpo del correo no puede estar vacío." };

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id,code,client_name,client_email,client_phone,route_name,start_date,people,modality,total_eur,pdf_path")
    .eq("id", quoteId)
    .maybeSingle();
  if (qErr) return { error: mensajeError(qErr) };
  if (!quote) return { error: "No encontré la cotización." };

  const email = String(quote.client_email || "").trim();
  if (!email) return { error: "La cotización no tiene correo del cliente. Agrégalo y vuelve a intentar." };

  // Sin PDF no hay adjunto: lo generamos antes de enviar.
  let pdfPath = quote.pdf_path as string | null;
  if (!pdfPath) {
    const gen = await renderAndStoreQuotePdf(supabase, quoteId);
    if (gen.error) return { error: `No se pudo generar el PDF: ${gen.error}` };
    const { data: fresh } = await supabase.from("quotes").select("pdf_path").eq("id", quoteId).maybeSingle();
    pdfPath = (fresh?.pdf_path as string | null) ?? null;
  }
  if (!pdfPath) return { error: "La cotización no tiene PDF y no se pudo generar." };

  const [bucket, ...rest] = pdfPath.split("/");
  const { data: signed, error: urlErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(rest.join("/"), EMAIL_PDF_TTL);
  if (urlErr || !signed?.signedUrl) {
    return { error: `No se pudo preparar el PDF adjunto: ${mensajeError(urlErr)}` };
  }

  const nombre = String(quote.client_name || "").trim();
  const envio = await enviarCorreoWebhook({
    code: quote.code,
    nombre,
    email,
    telefono: quote.client_phone ?? null,
    ruta: quote.route_name ?? null,
    fecha_inicio: quote.start_date ?? null,
    personas: Number(quote.people) || 1,
    alojamiento: quote.modality ?? null,
    total_eur: quote.total_eur != null ? Number(quote.total_eur) : null,
    pdf_url: signed.signedUrl,
    subject,
    body,
    attachment_name: `Cotizacion-${quote.code}.pdf`,
    // Sin aviso interno: lo mandó alguien del equipo desde el CRM, así que ya lo
    // sabe y el aviso solo duplicaba el correo en reservas@. El asunto/cuerpo se
    // dejan puestos porque, si algún día se vuelve a encender, el aviso por
    // defecto del workflow ("Nuevo lead del cotizador web") aquí sería falso.
    aviso: false,
    aviso_subject: `${nombre || "Cliente"} - Cotización enviada - ${quote.code}${quote.route_name ? ` - ${quote.route_name}` : ""}`,
    aviso_body: [
      `Se envió una cotización al cliente desde el CRM.`,
      ``,
      `Cotización: ${quote.code}`,
      `Cliente: ${nombre || "-"}`,
      `Correo: ${email}`,
      `WhatsApp: ${quote.client_phone || "-"}`,
      ``,
      `Ruta: ${quote.route_name || "-"}`,
      `Salida: ${quote.start_date || "-"}`,
      `Personas: ${quote.people ?? "-"}`,
      `Alojamiento: ${quote.modality || "-"}`,
      `Total: ${quote.total_eur != null ? `${quote.total_eur} EUR` : "-"}`,
      ``,
      `Respondiendo a este mensaje le escribes directo al cliente.`,
    ].join("\n"),
  });
  if (!envio.ok) return { error: envio.error ?? "No se pudo enviar el correo." };

  await supabase.from("quotes").update({ email_sent_at: new Date().toISOString() }).eq("id", quoteId);
  return { ok: true, email };
}
