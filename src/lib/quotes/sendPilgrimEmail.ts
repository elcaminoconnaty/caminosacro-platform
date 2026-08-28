import "server-only";

import { enviarCorreoWebhook } from "@/lib/email/webhook";
import { registrarEnvio, adjuntosNoSoportados } from "@/lib/email/log";
import { armarCorreoPilgrim, getPilgrimSettings } from "@/lib/quotes/pilgrimEmail";
import { EMAIL_PDF_TTL } from "@/lib/quotes/clientEmail";
import type { ComercialClient } from "@/lib/quotes/pdf";

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
): Promise<{ ok?: true; email?: string; adjuntos?: number; confirmado?: boolean; error?: string }> {
  const subject = mensaje.subject.trim();
  const body = mensaje.body.trim();
  if (!subject) return { error: "El asunto no puede estar vacío." };
  if (!body) return { error: "El cuerpo del correo no puede estar vacío." };

  const { data: quote } = await supabase
    .from("quotes")
    .select("id,code,client_name,client_phone,route_name,start_date,people,modality,cost_eur")
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
    body: esPrueba
      ? `(Correo de PRUEBA. El destinatario real sería ${ajustes.email || "—"}.)\n\n${body}`
      : body,
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
  });
  if (!envio.ok) return { error: envio.error ?? "No se pudo enviar el correo." };

  if (!esPrueba) {
    await supabase.from("quotes").update({ pilgrim_email_sent_at: new Date().toISOString() }).eq("id", quoteId);
  }
  return { ok: true, email: destino, adjuntos: attachments.length, confirmado: !!envio.messageId };
}
