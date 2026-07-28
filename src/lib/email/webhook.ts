import "server-only";

// Único emisor de correos de la plataforma: POST al webhook de n8n
// ("Correo Cotización — Camino Sacro"), que envía por Brevo desde
// reservas@caminosacro.com y adjunta el PDF descargándolo de `pdf_url`.
// Lo usan el cotizador público, el CRM (cotizaciones) y el flujo de contratos.

export type CorreoPayload = {
  code: string;
  nombre: string;
  email: string;
  telefono: string | null;
  ruta: string | null;
  fecha_inicio: string | null;
  personas: number;
  alojamiento: string | null;
  total_eur: number | null;
  pdf_url: string | null;
  // Si van en null, el workflow arma su propio asunto/cuerpo por defecto.
  subject: string | null;
  body: string | null;
  // Nombre del archivo adjunto (para que diga "Contrato-..." y no "Cotizacion-...").
  attachment_name?: string;
  // Varios adjuntos (el correo a Pilgrim lleva un pasaporte por viajero). Si viene,
  // el workflow lo usa en vez del par pdf_url + attachment_name.
  attachments?: { url: string; name: string }[];
  // Asunto/cuerpo del aviso interno a reservas@ (si no se envían, el workflow usa
  // su aviso de lead por defecto, que dice "Nuevo lead del cotizador web").
  // El asunto sale prefijado con AVISO_PREFIJO; no hay que escribirlo a mano.
  aviso_subject?: string;
  aviso_body?: string;
};

// Cada envío produce DOS correos: el del destinatario y el aviso interno a
// reservas@ (son las dos ramas del workflow). Si los dos llevan el mismo asunto,
// en la bandeja se ven como un correo duplicado y Gmail los mete en el mismo hilo
// — que es justo lo que pasaba con el aviso de "Contrato firmado". El prefijo va
// acá, en el emisor único, para que ningún flujo nuevo pueda volver a chocar.
const AVISO_PREFIJO = "[CRM]";

/**
 * Envía el correo por el webhook. Nunca lanza: devuelve `{ ok: false, error }`
 * con un motivo legible para poder mostrarlo en pantalla (el envío jamás debe
 * tumbar la operación que lo dispara).
 */
export async function enviarCorreoWebhook(
  payload: CorreoPayload,
): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.QUOTE_EMAIL_WEBHOOK_URL;
  if (!url) {
    console.warn("[correo] QUOTE_EMAIL_WEBHOOK_URL sin configurar: no se envió el correo.");
    return { ok: false, error: "El envío de correos no está configurado (falta QUOTE_EMAIL_WEBHOOK_URL)." };
  }
  if (!payload.email) {
    return { ok: false, error: "No hay correo del destinatario." };
  }
  const conPrefijo: CorreoPayload = payload.aviso_subject
    && !payload.aviso_subject.startsWith(AVISO_PREFIJO)
    ? { ...payload, aviso_subject: `${AVISO_PREFIJO} ${payload.aviso_subject}` }
    : payload;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.QUOTE_EMAIL_WEBHOOK_SECRET
          ? { "x-webhook-secret": process.env.QUOTE_EMAIL_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(conPrefijo),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      console.error("[correo] el webhook respondió", r.status);
      return { ok: false, error: `El servicio de correo respondió ${r.status}.` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[correo] no se pudo enviar:", e);
    const msg = e instanceof Error && e.name === "TimeoutError"
      ? "El servicio de correo no respondió a tiempo."
      : "No se pudo contactar el servicio de correo.";
    return { ok: false, error: msg };
  }
}
