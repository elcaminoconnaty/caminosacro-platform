import "server-only";

import { enviarCorreoWebhook } from "@/lib/email/webhook";
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
): Promise<{ ok?: true; email?: string; adjuntos?: number; error?: string }> {
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
    // Sin aviso interno: lo dispara alguien del equipo desde el CRM.
    aviso: false,
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
  if (!envio.ok) return { error: envio.error ?? "No se pudo enviar el correo." };

  if (!esPrueba) {
    await supabase.from("quotes").update({ pilgrim_email_sent_at: new Date().toISOString() }).eq("id", quoteId);
  }
  return { ok: true, email: destino, adjuntos: attachments.length };
}
