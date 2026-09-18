"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { getPilgrimSettings } from "@/lib/quotes/pilgrimEmail";
import { enviarCorreoWebhook } from "@/lib/email/webhook";
import { registrarEnvio } from "@/lib/email/log";
import { fugaDeContacto } from "@/lib/leads/solicitudPrecio";

/**
 * Cierra (o reabre) un lead de la web desde el panel de Seguimiento.
 *
 * Recibe varios ids porque en pantalla un doble envío se ve como una sola línea: cerrar
 * "Hugo · Inglés desde Ferrol" tiene que cerrar las dos filas que lo componen, o la
 * siguiente carga lo devuelve a la bandeja.
 *
 * No borra nada nunca: `atendido_at` a null lo devuelve a pendientes. Las filas son el
 * registro de cuánta demanda entra sin tarifas cargadas y esa cuenta no se toca desde acá.
 */
export async function marcarLeadAtendido(ids: string[], atendido: boolean, nota?: string) {
  if (!ids.length) return { error: "No llegó ningún lead que marcar." };

  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("web_leads")
    .update({
      atendido_at: atendido ? new Date().toISOString() : null,
      // Al reabrir se limpia la nota: dejaría colgada la explicación de un cierre que
      // ya no existe.
      atendido_nota: atendido ? (nota?.trim() || null) : null,
    })
    .in("id", ids);

  if (error) return { error: mensajeError(error, "No se pudo marcar el lead.") };
  revalidatePath("/seguimiento");
  return { ok: true as const };
}

/**
 * Le pide a Pilgrim el precio de la salida de un lead que se quedó sin tarifa.
 *
 * Provisional: existe porque 2027 todavía no está cargado y los leads de publicidad que
 * piden 2027 llegan sin cifra. El borrador lo arma el servidor al pintar la pantalla
 * (`armarSolicitudPrecio`) y Nico lo puede retocar antes de mandarlo, igual que el correo
 * de reserva a Pilgrim.
 *
 * Tres cosas NO las decide el cliente, por más que edite el cuerpo:
 *  - **El destinatario.** Sale de Configuración → Proveedor Pilgrim. Lo que llega del
 *    navegador es solo el texto.
 *  - **Que no se filtre el contacto del peregrino.** El cuerpo es editable, así que la
 *    regla se comprueba acá, sobre el texto que de verdad va a salir.
 *  - **La marca de enviado.** Se escribe con lo que respondió el webhook, no con lo que
 *    la pantalla crea.
 */
export async function enviarSolicitudPrecioPilgrim(
  leadId: string,
  mensaje: { subject: string; body: string; pruebaEmail?: string | null },
): Promise<{ ok?: true; email?: string; confirmado?: boolean; error?: string }> {
  const subject = mensaje.subject.trim();
  const body = mensaje.body.trim();
  if (!subject) return { error: "El asunto no puede estar vacío." };
  if (!body) return { error: "El cuerpo del correo no puede estar vacío." };

  const supabase = await createCommercialClient();
  const { data: lead, error: leadErr } = await supabase
    .from("web_leads")
    .select("id,code,full_name,email,phone,route_name,route_slug,tipo,start_date,people")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return { error: mensajeError(leadErr, "No pude leer el lead.") };
  if (!lead) return { error: "No encontré el lead." };

  // El peregrino es NUESTRO. Pilgrim necesita saber a quién aloja, no cómo escribirle.
  const fuga = fugaDeContacto(`${subject}\n${body}`, { email: lead.email, phone: lead.phone });
  if (fuga) {
    return {
      error:
        `El correo lleva ${fuga} y a Pilgrim no se le manda el contacto del peregrino. ` +
        `Quítalo del texto y vuelve a intentarlo.`,
    };
  }

  const esPrueba = !!mensaje.pruebaEmail?.trim();
  const ajustes = await getPilgrimSettings(supabase);
  const destino = (mensaje.pruebaEmail?.trim() || ajustes.email).trim();
  if (!destino) {
    return { error: "Falta el correo de Pilgrim. Configúralo en Configuración → Proveedor Pilgrim." };
  }

  const prefijo = esPrueba ? "[PRUEBA] " : "";
  const envio = await enviarCorreoWebhook({
    code: lead.code || "",
    nombre: ajustes.contacto || ajustes.nombre || "Pilgrim",
    email: destino,
    telefono: null,
    ruta: lead.route_name ?? lead.route_slug,
    fecha_inicio: lead.start_date,
    personas: Number(lead.people) || 1,
    alojamiento: lead.tipo,
    total_eur: null,
    pdf_url: null,
    subject: `${prefijo}${subject}`,
    body: esPrueba
      ? `(Correo de PRUEBA. El destinatario real sería ${ajustes.email || "—"}.)\n\n${body}`
      : body,
    // Avisa a reservas@, igual que la reserva a Pilgrim y al revés que el resto de lo que
    // se dispara desde el CRM. Mismo motivo que allá: lo manda Brevo, no el correo de
    // Nico, así que no deja copia en ningún buzón. En agosto de 2026 tres solicitudes a
    // Pilgrim se dieron por enviadas y nunca llegaron; el aviso es el "dónde mirar".
    // Aquí además el aviso ES el recordatorio de que hay un peregrino esperando precio.
    aviso: true,
    aviso_subject: `${prefijo}Precio pedido a Pilgrim - ${lead.code || lead.full_name} - ${lead.route_name || lead.route_slug}`,
    aviso_body: [
      esPrueba ? `PRUEBA: se envió a ${destino} en vez de a Pilgrim.` : `Se le pidió a Pilgrim el precio de esta salida.`,
      ``,
      `Referencia: ${lead.code || "-"}`,
      `Peregrino:  ${lead.full_name}`,
      `Ruta:       ${lead.route_name || lead.route_slug}`,
      `Salida:     ${lead.start_date}`,
      `Personas:   ${lead.people ?? "-"}`,
      ``,
      `El contacto del peregrino NO va en el correo a Pilgrim: está en el panel de`,
      `Seguimiento, en el lead.`,
      ``,
      `Cuando Pilgrim responda con el precio, cárgalo en el catálogo o arma la`,
      `cotización a mano, y marca el lead como atendido.`,
    ].join("\n"),
  });

  await registrarEnvio(supabase, {
    code: lead.code || null,
    tipo: "precio_pilgrim",
    destinatario: destino,
    asunto: `${prefijo}${subject}`,
    adjuntos: 0,
    messageId: envio.messageId ?? null,
    error: envio.ok ? null : (envio.error ?? "No se pudo enviar el correo."),
    prueba: esPrueba,
  });

  if (!envio.ok) return { error: envio.error ?? "No se pudo enviar el correo." };

  // En prueba no se marca: así se puede ensayar sin que el lead figure como ya pedido.
  if (!esPrueba) {
    const { error } = await supabase
      .from("web_leads")
      .update({ precio_solicitado_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) console.warn("[lead-precio] no pude marcar la solicitud:", error);
  }

  revalidatePath("/seguimiento");
  return { ok: true, email: destino, confirmado: !!envio.messageId };
}
