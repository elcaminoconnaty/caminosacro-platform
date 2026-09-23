import "server-only";

import { enviarCorreoWebhook } from "@/lib/email/webhook";
import { registrarEnvio, adjuntosNoSoportados } from "@/lib/email/log";
import { armarCorreoPilgrim, getPilgrimSettings } from "@/lib/quotes/pilgrimEmail";
import { correoPilgrimHtml } from "@/lib/quotes/pilgrimHtml";
import { EMAIL_PDF_TTL } from "@/lib/quotes/clientEmail";
import type { ComercialClient } from "@/lib/quotes/pdf";
import { outlookConfigurado, responderEnHilo, type AdjuntoOutlook } from "@/lib/email/outlook";

const TIPO_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", heic: "image/heic", heif: "image/heif",
};

/**
 * Le envía a Pilgrim el detalle de la reserva a sus precios, con los pasaportes de
 * los viajeros adjuntos, y le pide el link de pago.
 *
 * `pruebaEmail` desvía el correo a esa dirección: sirve para ensayar el envío (con 1,
 * 2, 3 o 20 viajeros) sin escribirle a Pilgrim. En prueba NO se marca
 * `pilgrim_email_sent_at`, así se puede repetir sin ensuciar el expediente.
 *
 * Igual que `enviarCorreoCliente`, vive en librería porque lo disparan la tarjeta
 * del seguimiento y el endpoint del agente.
 */
export async function enviarCorreoAPilgrim(
  supabase: ComercialClient,
  quoteId: string,
  mensaje: { subject: string; body: string; pruebaEmail?: string | null },
): Promise<{ ok?: true; email?: string; adjuntos?: number; confirmado?: boolean; enHilo?: boolean; error?: string }> {
  const subject = mensaje.subject.trim();
  const body = mensaje.body.trim();
  if (!subject) return { error: "El asunto no puede estar vacío." };
  if (!body) return { error: "El cuerpo del correo no puede estar vacío." };

  const { data: quote } = await supabase
    .from("quotes")
    .select("id,code,client_name,client_phone,route_name,start_date,people,modality,cost_eur,pilgrim_thread_message_id,pilgrim_thread_subject")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { error: "No encontré la cotización." };

  const esPrueba = !!mensaje.pruebaEmail?.trim();
  const ajustes = await getPilgrimSettings(supabase);
  const destino = (mensaje.pruebaEmail?.trim() || ajustes.email).trim();
  if (!destino) {
    return { error: "Falta el correo de Pilgrim. Configúralo en Configuración → Proveedor Pilgrim." };
  }

  // Los adjuntos se recalculan en el servidor: el cuerpo es editable, la lista de
  // pasaportes no debe serlo.
  const armado = await armarCorreoPilgrim(supabase, quoteId);
  if (!armado.ok) return { error: armado.error };

  // ---- Con hilo enlazado: respuesta DENTRO del hilo, desde el buzón de reservas@ ----
  // La prueba NO va por aquí: una prueba en el hilo le llegaría a Pilgrim. Sigue por Brevo.
  if (quote.pilgrim_thread_message_id && !esPrueba && outlookConfigurado()) {
    return enviarEnHiloPilgrim(supabase, {
      quote: {
        id: quote.id as string,
        code: quote.code as string,
        route_name: (quote.route_name as string | null) ?? null,
        mensajeId: quote.pilgrim_thread_message_id as string,
        asuntoHilo: (quote.pilgrim_thread_subject as string | null) ?? null,
      },
      destino,
      body,
      adjuntos: armado.correo.adjuntos,
    });
  }

  const attachments: { url: string; name: string }[] = [];
  for (const a of armado.correo.adjuntos) {
    const [bucket, ...rest] = a.path.split("/");
    const { data: signed } = await supabase.storage
      .from(bucket)
      .createSignedUrl(rest.join("/"), EMAIL_PDF_TTL);
    if (signed?.signedUrl) attachments.push({ url: signed.signedUrl, name: a.nombre });
  }

  // Brevo rechaza heic, heif y webp — y cuando rechaza un adjunto devuelve 400 y se
  // pierde el correo ENTERO, no solo el archivo. La firma del contrato sí los acepta
  // (son las fotos que mandan los iPhone y algunos Android), así que el choque llega
  // hasta acá. Mejor frenar con un mensaje claro que mandar una reserva sin pasaporte
  // o perder el correo en silencio.
  const rechazados = adjuntosNoSoportados(attachments.map((a) => a.name));
  if (rechazados.length) {
    return {
      error:
        `El servicio de correo no admite estos adjuntos: ${rechazados.join(", ")}. ` +
        `Conviértelos a JPG o PDF y vuelve a subirlos en el contrato del viajero.`,
    };
  }

  const prefijo = esPrueba ? "[PRUEBA] " : "";
  // El cuerpo final, el que de verdad se manda: el HTML se interpreta DESDE ÉL, nunca se
  // arma aparte. El cuerpo es editable antes de enviar, así que armarlo por separado
  // dejaría a Pilgrim leyendo algo distinto de lo que se revisó en pantalla.
  const cuerpo = esPrueba
    ? `(Correo de PRUEBA. El destinatario real sería ${ajustes.email || "—"}.)\n\n${body}`
    : body;
  const html = correoPilgrimHtml({
    cuerpo,
    code: quote.code,
    ruta: quote.route_name ?? null,
    adjuntos: attachments.length,
    esPrueba,
  });
  const envio = await enviarCorreoWebhook({
    code: quote.code,
    nombre: ajustes.contacto || ajustes.nombre || "Pilgrim",
    email: destino,
    telefono: null,
    ruta: quote.route_name ?? null,
    fecha_inicio: quote.start_date ?? null,
    personas: Number(quote.people) || 1,
    alojamiento: quote.modality ?? null,
    total_eur: quote.cost_eur != null ? Number(quote.cost_eur) : null,
    // Compatibilidad: mientras el workflow no lea `attachments`, al menos va el
    // primer pasaporte por la vía de siempre.
    pdf_url: attachments[0]?.url ?? null,
    attachment_name: attachments[0]?.name,
    attachments,
    subject: `${prefijo}${subject}`,
    body: cuerpo,
    html,
    // Este SÍ avisa a reservas@, al revés que los demás correos del CRM. La razón:
    // es el único que no deja copia en ningún buzón (lo manda Brevo, no el correo
    // de Nico) y es el de más plata en juego. En agosto de 2026 se dieron por
    // enviadas tres solicitudes a Pilgrim que nunca llegaron y no había dónde
    // mirar. El aviso es ese "dónde mirar".
    aviso: true,
    aviso_subject: `${prefijo}Reserva enviada a Pilgrim - ${quote.code}${quote.route_name ? ` - ${quote.route_name}` : ""}`,
    aviso_body: [
      esPrueba ? `PRUEBA: se envió a ${destino} en vez de a Pilgrim.` : `Se le envió la reserva a Pilgrim pidiendo el link de pago.`,
      ``,
      `Cotización: ${quote.code}`,
      `Cliente: ${quote.client_name || "-"}`,
      `Ruta: ${quote.route_name || "-"}`,
      `Salida: ${quote.start_date || "-"}`,
      `Personas: ${quote.people ?? "-"}`,
      ``,
      `Total a pagarle a Pilgrim: ${quote.cost_eur != null ? `${quote.cost_eur} EUR` : "-"}`,
      `Pasaportes adjuntos: ${attachments.length}`,
      ...(armado.correo.pendientes.length
        ? [`Sin pasaporte todavía: ${armado.correo.pendientes.join(", ")}`]
        : []),
    ].join("\n"),
  });
  await registrarEnvio(supabase, {
    quoteId,
    code: quote.code,
    tipo: "pilgrim",
    destinatario: destino,
    asunto: `${prefijo}${subject}`,
    adjuntos: attachments.length,
    messageId: envio.messageId ?? null,
    error: envio.ok ? null : (envio.error ?? "No se pudo enviar el correo."),
    prueba: esPrueba,
    html,
  });
  if (!envio.ok) return { error: envio.error ?? "No se pudo enviar el correo." };

  if (!esPrueba) {
    await supabase.from("quotes").update({ pilgrim_email_sent_at: new Date().toISOString() }).eq("id", quoteId);
  }
  return { ok: true, email: destino, adjuntos: attachments.length, confirmado: !!envio.messageId };
}

/**
 * El correo de reserva como respuesta en el hilo de la cotización con Pilgrim.
 *
 * Los pasaportes se bajan del almacenamiento y viajan dentro del correo (Outlook no toma
 * adjuntos por URL). El asunto es el del hilo ("RE: …"): cambiarlo lo sacaría del hilo en
 * algunos clientes de correo. La referencia de Pilgrim va igual en los datos del cuerpo.
 *
 * Sin aviso interno a reservas@: el correo sale DESDE reservas@, así que la copia ya está
 * en sus Enviados y en el hilo. El aviso existía justo porque Brevo no dejaba copia.
 */
async function enviarEnHiloPilgrim(
  supabase: ComercialClient,
  o: {
    quote: { id: string; code: string; route_name: string | null; mensajeId: string; asuntoHilo: string | null };
    destino: string;
    body: string;
    adjuntos: { path: string; nombre: string }[];
  },
): Promise<{ ok?: true; email?: string; adjuntos?: number; confirmado?: boolean; enHilo?: boolean; error?: string }> {
  const archivos: AdjuntoOutlook[] = [];
  for (const a of o.adjuntos) {
    const [bucket, ...rest] = a.path.split("/");
    const { data, error } = await supabase.storage.from(bucket).download(rest.join("/"));
    if (error || !data) return { error: `No pude leer el pasaporte ${a.nombre} para adjuntarlo. Revísalo en el contrato del viajero.` };
    const ext = (a.nombre.split(".").pop() || "").toLowerCase();
    archivos.push({ nombre: a.nombre, tipo: TIPO_POR_EXTENSION[ext] || "application/octet-stream", contenido: Buffer.from(await data.arrayBuffer()) });
  }

  const html = correoPilgrimHtml({
    cuerpo: o.body,
    code: o.quote.code,
    ruta: o.quote.route_name,
    adjuntos: archivos.length,
    esPrueba: false,
  });
  const r = await responderEnHilo({ mensajeId: o.quote.mensajeId, html, adjuntos: archivos });
  const asunto = o.quote.asuntoHilo ? `RE: ${o.quote.asuntoHilo.replace(/^(re|rv|fw|fwd):\s*/i, "")}` : `Reserva ${o.quote.code}`;

  await registrarEnvio(supabase, {
    quoteId: o.quote.id,
    code: o.quote.code,
    tipo: "pilgrim",
    destinatario: o.destino,
    asunto,
    adjuntos: archivos.length,
    // Outlook no devuelve id al enviar; la prueba del envío es que está en Enviados.
    messageId: r.ok ? `outlook:${r.threadId ?? "hilo"}` : null,
    error: r.ok ? null : r.error,
    prueba: false,
    html,
  });
  if (!r.ok) return { error: r.error };

  await supabase.from("quotes").update({ pilgrim_email_sent_at: new Date().toISOString() }).eq("id", o.quote.id);
  return { ok: true, email: o.destino, adjuntos: archivos.length, confirmado: true, enHilo: true };
}
