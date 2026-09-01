import "server-only";

import type { ComercialClient } from "@/lib/quotes/pdf";
import { mensajeError } from "@/lib/errors";
import { enviarCorreoWebhook } from "@/lib/email/webhook";
import { registrarEnvio } from "@/lib/email/log";
import { rutaAsistencia } from "@/lib/storage/paths";
import { getTravelDocTexts } from "@/lib/travelDocs/texts";
import { renderAndStoreTravelDoc } from "@/lib/travelDocs/render";
import {
  correoDocumentacionHtml,
  correoDocumentacionTexto,
  type DocumentoEnlace,
} from "@/lib/travelDocs/html";

/**
 * Envío de la documentación de viaje al cliente.
 *
 * Los botones del correo NO apuntan a Storage: apuntan a /documentacion/[token], que
 * firma la URL en el momento de cada descarga. Una URL firmada de Supabase caduca —siete
 * días como mucho—, y el cliente abre esta documentación durante el viaje y meses
 * después. Con el token, el enlace del correo vive lo que viva el expediente.
 *
 * El correo no lleva adjuntos: solo los botones. Ver el comentario del payload más abajo.
 */

export async function enviarCorreoDocumentacionViaje(
  supabase: ComercialClient,
  quoteId: string,
  mensaje: { subject: string; intro: string; pruebaEmail?: string },
): Promise<{ ok?: true; email?: string; error?: string }> {
  const subject = mensaje.subject.trim();
  if (!subject) return { error: "El asunto no puede estar vacío." };
  const intro = mensaje.intro.trim();
  if (!intro) return { error: "El cuerpo del correo no puede estar vacío." };

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id,code,client_name,client_email,client_phone,route_name,start_date,people,modality,total_eur")
    .eq("id", quoteId)
    .maybeSingle();
  if (qErr) return { error: mensajeError(qErr) };
  if (!quote) return { error: "No encontré la cotización." };

  const destinatario = (mensaje.pruebaEmail || "").trim() || String(quote.client_email || "").trim();
  if (!destinatario) {
    return { error: "La cotización no tiene correo del cliente. Agrégalo y vuelve a intentar." };
  }
  const esPrueba = !!mensaje.pruebaEmail?.trim();

  // Sin Documento de Viaje no hay nada que enviar: se genera antes en vez de fallar.
  let { data: doc } = await supabase
    .from("travel_docs")
    .select("token,doc_pdf_path,insurance_pdf_path,luggage_tag_pdf_path,revoked_at")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (!doc?.doc_pdf_path) {
    const gen = await renderAndStoreTravelDoc(supabase, quoteId);
    if (gen.error) return { error: `No se pudo generar el Documento de Viaje: ${gen.error}` };
    const { data: fresco } = await supabase
      .from("travel_docs")
      .select("token,doc_pdf_path,insurance_pdf_path,luggage_tag_pdf_path,revoked_at")
      .eq("quote_id", quoteId)
      .maybeSingle();
    doc = fresco;
  }
  if (!doc?.doc_pdf_path) return { error: "No hay Documento de Viaje y no se pudo generar." };
  if (doc.revoked_at) {
    return { error: "El enlace público está anulado. Reactívalo antes de enviar el correo." };
  }

  const base = baseUrl();
  const urlExpediente = `${base}/documentacion/${doc.token}`;
  const descarga = (clave: string) => `${urlExpediente}/descargar/${clave}`;

  // La asistencia es genérica y puede no estar generada todavía. Sin esta comprobación el
  // correo saldría con un botón que lleva a un 404, que es peor que no ofrecerla.
  const asistenciaRuta = rutaAsistencia();
  const { data: listadoAsistencia } = await supabase.storage
    .from(asistenciaRuta.split("/")[0])
    .list("generico", { search: asistenciaRuta.split("/").pop() });
  const hayAsistencia = (listadoAsistencia || []).length > 0;

  const documentos: DocumentoEnlace[] = [
    {
      clave: "documento",
      nombre: `DOCUMENTO_VIAJE_${quote.code}.PDF`,
      url: descarga("documento"),
      detalle: "Alojamientos noche a noche, servicios incluidos y condiciones.",
    },
  ];
  if (hayAsistencia) {
    documentos.push({
      clave: "asistencia",
      nombre: "ASISTENCIA_EN_VIAJE_CAMINO_SACRO.PDF",
      url: descarga("asistencia"),
      detalle: "A quién llamar y qué hacer ante cualquier incidencia durante el viaje.",
    });
  }
  if (doc.insurance_pdf_path) {
    documentos.push({
      clave: "seguro",
      nombre: `SEGURO_DE_VIAJE_${quote.code}.PDF`,
      url: descarga("seguro"),
      detalle: "Póliza completa con las coberturas detalladas.",
    });
  }
  if (doc.luggage_tag_pdf_path) {
    documentos.push({
      clave: "etiqueta",
      nombre: `ETIQUETA_TRANSPORTE_DE_EQUIPAJE_${quote.code}.PDF`,
      url: descarga("etiqueta"),
      detalle: "Imprímela y pégala en tu mochila antes de la primera etapa.",
    });
  }

  const texts = await getTravelDocTexts(supabase);
  const datos = {
    nombre: String(quote.client_name || "").trim() || "peregrino",
    code: quote.code as string,
    ruta: (quote.route_name as string | null) ?? null,
    documentos,
    urlExpediente,
    // El correo llega ANTES del viaje, cuando el cliente todavía está en Colombia: ahí el
    // número útil es el WhatsApp, no el fijo español de la última página del documento.
    telefono: texts.contacto.whatsapp || texts.contacto.telefono || "",
    telefonoViaje: texts.contacto.telefono || "",
    email: texts.contacto.email || "reservas@caminosacro.com",
    web: texts.contacto.web || "www.caminosacro.com",
    intro,
  };

  // Sin adjuntos: el correo lleva solo los botones de descarga.
  //
  // Es deliberado. Adjuntar los cuatro PDF son ~7 MB que llegan a la bandeja de todo el
  // mundo, y Brevo responde 400 pasado su límite llevándose el correo ENTERO por delante,
  // no solo el adjunto que sobra. Además un adjunto es una foto del momento del envío: si
  // luego se corrige un teléfono del hotel o se regenera el documento, el que el cliente
  // tiene guardado sigue diciendo lo viejo. Los botones apuntan a /documentacion/<token>,
  // que sirve SIEMPRE la versión vigente y no caduca.

  const envio = await enviarCorreoWebhook({
    code: quote.code,
    nombre: datos.nombre,
    email: destinatario,
    telefono: quote.client_phone ?? null,
    ruta: quote.route_name ?? null,
    fecha_inicio: quote.start_date ?? null,
    personas: Number(quote.people) || 1,
    alojamiento: quote.modality ?? null,
    total_eur: quote.total_eur != null ? Number(quote.total_eur) : null,
    // Sin adjuntos, ni en `attachments` ni en el `pdf_url` de siempre: el nodo de n8n
    // solo arma `brevoBody.attachment` si le llega alguno de los dos.
    pdf_url: null,
    subject,
    body: correoDocumentacionTexto(datos),
    html: correoDocumentacionHtml(datos),
    // Sin aviso interno: lo mandó alguien del equipo desde el CRM, así que ya lo sabe.
    aviso: false,
    aviso_subject: `${datos.nombre} - Documentación de viaje enviada - ${quote.code}`,
    aviso_body: `Se envió la documentación de viaje al cliente desde el CRM.\n\nCotización: ${quote.code}\nCliente: ${datos.nombre}\nCorreo: ${destinatario}\nEnlace: ${urlExpediente}`,
  });

  await registrarEnvio(supabase, {
    quoteId,
    code: quote.code,
    tipo: "documentacion",
    destinatario,
    asunto: subject,
    adjuntos: 0,
    messageId: envio.messageId ?? null,
    error: envio.ok ? null : (envio.error ?? "No se pudo enviar el correo."),
    prueba: esPrueba,
  });
  if (!envio.ok) return { error: envio.error ?? "No se pudo enviar el correo." };

  // En modo prueba no se marca el expediente: el cliente real no ha recibido nada.
  if (!esPrueba) {
    await supabase.from("travel_docs").update({ sent_at: new Date().toISOString() }).eq("quote_id", quoteId);
  }
  return { ok: true, email: destinatario };
}

/**
 * Base pública de la app. APP_BASE_URL manda: es la misma decisión que toma el enlace de
 * firma del contrato, y por la misma razón — en local, sin ella, el correo mandaría al
 * cliente a un `localhost` que no existe fuera de esta máquina.
 */
function baseUrl(): string {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  return "https://caminosacro-platform-production.up.railway.app";
}
