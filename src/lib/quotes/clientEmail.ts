import "server-only";

import { enviarCorreoWebhook } from "@/lib/email/webhook";
import { registrarEnvio } from "@/lib/email/log";
import { mensajeError } from "@/lib/errors";
import { renderAndStoreQuotePdf, type ComercialClient } from "@/lib/quotes/pdf";
import { correoCotizacionHtml } from "@/lib/quotes/emailHtml";
import { nuevoTokenCorreo, urlVersionWeb } from "@/lib/email/versionWeb";
import { getTravelDocTexts } from "@/lib/travelDocs/texts";

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
  mensaje: { subject: string; body: string; pruebaEmail?: string },
): Promise<{ ok?: true; email?: string; error?: string }> {
  const subjectOriginal = mensaje.subject.trim();
  const body = mensaje.body.trim();
  if (!subjectOriginal) return { error: "El asunto no puede estar vacío." };
  if (!body) return { error: "El cuerpo del correo no puede estar vacío." };

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id,code,client_name,client_email,client_phone,route_name,start_date,people,modality,total_eur,pdf_path,valid_until")
    .eq("id", quoteId)
    .maybeSingle();
  if (qErr) return { error: mensajeError(qErr) };
  if (!quote) return { error: "No encontré la cotización." };

  // `pruebaEmail` desvía el correo a otra dirección sin tocar al destinatario real: es
  // para ver cómo queda antes de mandárselo al cliente. En prueba NO se marca
  // `email_sent_at`, así se puede repetir las veces que haga falta sin ensuciar el
  // expediente ni hacer creer al equipo que la cotización ya salió.
  const esPrueba = !!mensaje.pruebaEmail?.trim();
  const email = esPrueba
    ? String(mensaje.pruebaEmail).trim()
    : String(quote.client_email || "").trim();
  if (!email) {
    return esPrueba
      ? { error: "Escribe la dirección a la que quieres mandar la prueba." }
      : { error: "La cotización no tiene correo del cliente. Agrégalo y vuelve a intentar." };
  }

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

  // La prueba llega marcada en el asunto: sin esto, una prueba y un envío real se ven
  // idénticos en la bandeja y es cuestión de tiempo confundirlos.
  const subject = esPrueba ? `[PRUEBA] ${subjectOriginal}` : subjectOriginal;

  const nombre = String(quote.client_name || "").trim();
  const adjuntoNombre = `Cotizacion-${quote.code}.pdf`;

  // El token se saca antes de armar el HTML porque el enlace de la versión web va DENTRO
  // de ese HTML, y luego se guarda tal cual para que la página sirva lo mismo que llegó.
  const token = nuevoTokenCorreo();
  // Los datos de contacto salen de settings, no del código: son los mismos que usan la
  // documentación de viaje y su correo, y tenerlos en dos sitios es cómo terminan
  // diciendo cosas distintas. Aquí va el WhatsApp, no el fijo español: el cliente todavía
  // está en su casa decidiendo si compra.
  const contacto = (await getTravelDocTexts(supabase)).contacto;
  const html = correoCotizacionHtml({
    code: quote.code,
    // El cuerpo lo escribe Nico en la tarjeta del expediente: aquí solo se envuelve en la
    // papelería de la marca. Se mete tal cual, en párrafos.
    cuerpo: body,
    ruta: quote.route_name ?? null,
    fechaInicio: quote.start_date ?? null,
    personas: Number(quote.people) || 1,
    alojamiento: quote.modality ?? null,
    totalEur: quote.total_eur != null ? Number(quote.total_eur) : null,
    validaHasta: (quote.valid_until as string | null) ?? null,
    adjunto: adjuntoNombre,
    telefono: contacto.whatsapp || contacto.telefono || "",
    email: contacto.email || "reservas@caminosacro.com",
    web: contacto.web || "www.caminosacro.com",
    urlVersionWeb: urlVersionWeb(token),
  });

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
    // `body` sigue viajando como versión en texto plano: es lo que ve quien tenga el HTML
    // desactivado, y ayuda a que el correo no puntúe como spam.
    body,
    html,
    attachment_name: adjuntoNombre,
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
  await registrarEnvio(supabase, {
    quoteId,
    code: quote.code,
    tipo: "cliente",
    destinatario: email,
    asunto: subject,
    adjuntos: 1,
    messageId: envio.messageId ?? null,
    error: envio.ok ? null : (envio.error ?? "No se pudo enviar el correo."),
    prueba: esPrueba,
    token,
    html,
  });
  if (!envio.ok) return { error: envio.error ?? "No se pudo enviar el correo." };

  if (!esPrueba) {
    await supabase.from("quotes").update({ email_sent_at: new Date().toISOString() }).eq("id", quoteId);
  }
  return { ok: true, email };
}
