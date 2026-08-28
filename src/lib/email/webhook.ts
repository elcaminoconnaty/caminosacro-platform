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
  // `false` apaga el aviso interno: se manda UN solo correo, el del destinatario.
  // Ver AVISO_POR_DEFECTO para el criterio.
  aviso?: boolean;
};

// Cada envío dispara las dos ramas del workflow: el correo al destinatario y el
// aviso interno a reservas@. De ahí salían dos correos por acción.
//
// El criterio para conservar el aviso es si el equipo se entera de otra forma:
//  - Lo que dispara alguien desde el CRM (mandar la cotización, mandar el contrato,
//    escribirle a Pilgrim) NO avisa: quien lo hizo ya lo sabe, y el aviso llegaba
//    como un segundo correo casi idéntico.
//  - Lo que pasa solo, sin nadie mirando, SÍ avisa: el cliente firma, el cron manda
//    el último recordatorio, entra un lead del cotizador web.
//
// El prefijo del asunto va acá, en el emisor único, para que ningún flujo nuevo
// pueda volver a chocar con el asunto del correo del cliente. Sirve además para
// filtrarlos en Gmail con `subject:[CRM]`.
const AVISO_PREFIJO = "[CRM]";
const AVISO_POR_DEFECTO = true;

/**
 * Envía el correo por el webhook. Nunca lanza: devuelve `{ ok: false, error }`
 * con un motivo legible para poder mostrarlo en pantalla (el envío jamás debe
 * tumbar la operación que lo dispara).
 *
 * OJO CON `ok`: `ok: true` significa que el workflow terminó sin error. Lo que
 * prueba que el correo salió es `messageId`. Si el envío falla (secreto inválido,
 * payload sin correo, 400 de Brevo), el workflow revienta y el webhook responde
 * 500 — verificado el 28-ago-2026 contra producción.
 *
 * `messageId` es la única prueba real de envío: es el id que devuelve Brevo.
 * Llega desde el 28-ago-2026, cuando el webhook pasó a `responseMode: responseNode`
 * con un nodo Respond colgado de "Enviar por Brevo". Si algún día vuelve a llegar
 * `undefined`, quien llame debe registrarlo como NO confirmado en vez de dar el
 * envío por hecho. Ver scripts/n8n_confirmacion_envio.md.
 */
export async function enviarCorreoWebhook(
  payload: CorreoPayload,
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const url = process.env.QUOTE_EMAIL_WEBHOOK_URL;
  if (!url) {
    console.warn("[correo] QUOTE_EMAIL_WEBHOOK_URL sin configurar: no se envió el correo.");
    return { ok: false, error: "El envío de correos no está configurado (falta QUOTE_EMAIL_WEBHOOK_URL)." };
  }
  if (!payload.email) {
    return { ok: false, error: "No hay correo del destinatario." };
  }
  const aviso = payload.aviso ?? AVISO_POR_DEFECTO;
  const conPrefijo: CorreoPayload = {
    ...payload,
    aviso,
    aviso_subject: aviso && payload.aviso_subject && !payload.aviso_subject.startsWith(AVISO_PREFIJO)
      ? `${AVISO_PREFIJO} ${payload.aviso_subject}`
      : payload.aviso_subject,
  };
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
      // 45 s, no 10. Desde el 28-ago-2026 el webhook responde DESPUES de llamar a
      // Brevo (responseMode: responseNode), y Brevo se descarga los adjuntos de
      // Supabase antes de enviar — el correo a Pilgrim puede llevar 20 pasaportes.
      // Con 10 s, un envio lento abortaba aca y la app lo reportaba como fallido
      // aunque el correo hubiera salido: el peor error posible, porque invita a
      // reenviarlo. El nodo HTTP de n8n corta a los 30 s, asi que 45 lo cubre.
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) {
      console.error("[correo] el webhook respondió", r.status);
      return { ok: false, error: `El servicio de correo respondió ${r.status}.` };
    }
    return { ok: true, messageId: extraerMessageId(await r.text()) };
  } catch (e) {
    console.error("[correo] no se pudo enviar:", e);
    const msg = e instanceof Error && e.name === "TimeoutError"
      ? "El servicio de correo no respondió a tiempo."
      : "No se pudo contactar el servicio de correo.";
    return { ok: false, error: msg };
  }
}

/**
 * Saca el messageId de Brevo de la respuesta del webhook, si viene.
 *
 * Tolerante a propósito: n8n puede responder un objeto, un arreglo de items o el
 * "Workflow got started" de siempre. Nada de esto debe romper un envío.
 */
function extraerMessageId(cuerpo: string): string | undefined {
  try {
    const datos = JSON.parse(cuerpo);
    const primero = Array.isArray(datos) ? datos[0] : datos;
    const id = primero?.messageId ?? primero?.json?.messageId;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}
