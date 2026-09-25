import "server-only";

/**
 * El buzón reservas@caminosacro.com (Microsoft 365), a través del workflow de n8n
 * "Plataforma → Outlook (Camino Sacro)".
 *
 * n8n guarda la autorización de Microsoft y hace de puente hacia Microsoft Graph, pero solo
 * deja pasar llamadas de correo del propio buzón (/me/messages y /me/mailFolders, con GET,
 * POST o PATCH) y con el secreto. Toda la lógica —buscar los hilos, responder dentro de
 * uno, adjuntar— vive aquí, donde se puede leer y probar.
 *
 * Por qué Outlook y no Brevo para Pilgrim: respondiendo desde el buzón, el correo queda en
 * el hilo de la cotización para los dos lados y en los Enviados de reservas@. Y sale de un
 * servidor autorizado para caminosacro.com (el SPF solo incluye a GoDaddy/Microsoft), así
 * que no tiene el riesgo de spam que tiene un correo de reservas@ enviado por Brevo.
 */

type RespuestaGraph<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

export function outlookConfigurado(): boolean {
  return !!process.env.OUTLOOK_WEBHOOK_URL && !!process.env.OUTLOOK_WEBHOOK_SECRET;
}

async function graph<T = unknown>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<RespuestaGraph<T>> {
  const url = process.env.OUTLOOK_WEBHOOK_URL;
  const secreto = process.env.OUTLOOK_WEBHOOK_SECRET;
  if (!url || !secreto) {
    return { ok: false, status: 0, error: "La conexión con Outlook no está configurada (faltan OUTLOOK_WEBHOOK_URL/SECRET)." };
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": secreto },
      body: JSON.stringify({ method, path, ...(body !== undefined ? { body } : {}) }),
      signal: AbortSignal.timeout(90_000),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; status?: number; data?: unknown; error?: string } | null;
    if (!j) return { ok: false, status: r.status, error: `El puente de Outlook respondió ${r.status} sin datos.` };
    if (!j.ok) {
      const d = j.data as { error?: { message?: string } } | null;
      return { ok: false, status: j.status ?? r.status, error: d?.error?.message || j.error || `Outlook respondió ${j.status ?? r.status}.` };
    }
    return { ok: true, status: j.status ?? r.status, data: j.data as T };
  } catch (e) {
    return { ok: false, status: 0, error: `No se pudo hablar con Outlook: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Hilos
// ---------------------------------------------------------------------------

type MensajeGraph = {
  id: string;
  conversationId: string;
  subject: string | null;
  receivedDateTime: string;
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
};

export type HiloOutlook = {
  threadId: string;
  subject: string;
  /** Fecha del último mensaje del hilo. */
  date: string;
  messageCount: number;
  /** El último mensaje que mandó el proveedor: al que se responde. */
  lastIncomingMessageId: string | null;
  lastMessageId: string;
  fromName: string;
  snippet: string;
  /** El asunto nombra el código de la cotización: casi seguro es este. */
  coincide: boolean;
};

const normal = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Los hilos del buzón con el proveedor (por su correo), agrupados por conversación y
 * ordenados: primero los que nombran el código de la cotización o al cliente, luego por
 * fecha. Pilgrim responde con "RE: Ruta — Cliente | CS-…", así que casi siempre el primero
 * es el correcto.
 */
export async function buscarHilos(opts: {
  email: string;
  codigo?: string | null;
  cliente?: string | null;
  limite?: number;
}): Promise<{ ok: true; hilos: HiloOutlook[] } | { ok: false; error: string }> {
  const email = opts.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "Falta el correo del proveedor." };
  const top = Math.min(opts.limite ?? 50, 100);
  // $search sin prefijos: Graph no acepta OR entre from/to, pero la dirección suelta
  // encuentra los correos de ellos y los nuestros hacia ellos.
  const q = encodeURIComponent(`"${email}"`);
  const r = await graph<{ value?: MensajeGraph[] }>(
    "GET",
    `/me/messages?$search=${q}&$top=${top}&$select=id,conversationId,subject,receivedDateTime,bodyPreview,from`,
  );
  if (!r.ok) return { ok: false, error: r.error };

  const porHilo = new Map<string, HiloOutlook & { _f: number; _fi: number }>();
  for (const m of r.data.value ?? []) {
    if (!m.conversationId) continue;
    const f = new Date(m.receivedDateTime).getTime() || 0;
    const desde = (m.from?.emailAddress?.address ?? "").toLowerCase();
    let h = porHilo.get(m.conversationId);
    if (!h) {
      h = {
        threadId: m.conversationId, subject: m.subject || "(sin asunto)", date: m.receivedDateTime,
        messageCount: 0, lastIncomingMessageId: null, lastMessageId: m.id, fromName: "", snippet: "",
        coincide: false, _f: -1, _fi: -1,
      };
      porHilo.set(m.conversationId, h);
    }
    h.messageCount++;
    if (f >= h._f) {
      h._f = f;
      h.date = m.receivedDateTime;
      h.lastMessageId = m.id;
      h.subject = m.subject || h.subject;
      h.snippet = (m.bodyPreview ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    }
    if (desde === email && f >= h._fi) {
      h._fi = f;
      h.lastIncomingMessageId = m.id;
      h.fromName = m.from?.emailAddress?.name || desde;
    }
  }

  const codigo = normal(opts.codigo ?? "");
  const palabrasCliente = normal(opts.cliente ?? "").split(/\s+/).filter((p) => p.length >= 4);
  const hilos = [...porHilo.values()].map(({ _f, _fi, ...h }) => {
    void _fi;
    const asunto = normal(h.subject);
    const conCodigo = !!codigo && asunto.includes(codigo);
    const conCliente = palabrasCliente.length > 0 && palabrasCliente.filter((p) => asunto.includes(p)).length >= Math.min(2, palabrasCliente.length);
    return { ...h, coincide: conCodigo || conCliente, _peso: (conCodigo ? 2 : 0) + (conCliente ? 1 : 0), _f };
  });
  hilos.sort((a, b) => b._peso - a._peso || b._f - a._f);
  return { ok: true, hilos: hilos.map(({ _peso, _f, ...h }) => { void _peso; void _f; return h; }) };
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

export type AdjuntoOutlook = { nombre: string; tipo: string; contenido: Buffer };

/** Graph admite hasta 3 MB por adjunto en una sola llamada; más grande pide sesión de carga. */
export const OUTLOOK_MAX_ADJUNTO = 3 * 1024 * 1024;

type Borrador = { id: string; conversationId?: string; body?: { content?: string } };

/**
 * Categoría de Outlook con la que queda marcado en reservas@ todo lo que manda la
 * plataforma: en Enviados y en el hilo se distingue de un vistazo de lo escrito a mano.
 * Si la categoría no existe en el buzón, Outlook la muestra igual (sin color); para darle
 * color basta crearla una vez con este mismo nombre.
 */
const CATEGORIA_PLATAFORMA = "Plataforma";

async function adjuntar(borradorId: string, adjuntos: AdjuntoOutlook[]): Promise<string | null> {
  for (const a of adjuntos) {
    if (a.contenido.length > OUTLOOK_MAX_ADJUNTO) {
      return `El adjunto ${a.nombre} pesa más de 3 MB y Outlook no lo acepta por esta vía. Reemplázalo por una versión más liviana.`;
    }
    const r = await graph("POST", `/me/messages/${encodeURIComponent(borradorId)}/attachments`, {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.nombre,
      contentType: a.tipo,
      contentBytes: a.contenido.toString("base64"),
    });
    if (!r.ok) return `No se pudo adjuntar ${a.nombre}: ${r.error}`;
  }
  return null;
}

/**
 * Responde DENTRO del hilo: crea la respuesta al mensaje indicado (Outlook pone el "RE:",
 * el destinatario y el historial citado), le suma los adjuntos, antepone nuestro cuerpo y
 * la envía. Queda en los Enviados de reservas@ y en el hilo de los dos lados.
 *
 * Si algo falla a mitad de camino, lo que queda es un borrador en la carpeta Borradores de
 * reservas@, nunca un correo a medias en manos de Pilgrim: el envío es el último paso.
 */
export async function responderEnHilo(opts: {
  mensajeId: string;
  html: string;
  adjuntos: AdjuntoOutlook[];
  cc?: string[];
}): Promise<{ ok: true; threadId: string | null } | { ok: false; error: string }> {
  const borrador = await graph<Borrador>("POST", `/me/messages/${encodeURIComponent(opts.mensajeId)}/createReply`, {});
  if (!borrador.ok) {
    return {
      ok: false,
      error:
        borrador.status === 404
          ? "El correo del hilo enlazado ya no está en el buzón (¿se borró?). Vuelve a enlazar el hilo."
          : `No se pudo preparar la respuesta en el hilo: ${borrador.error}`,
    };
  }
  const id = borrador.data.id;

  const errAdj = await adjuntar(id, opts.adjuntos);
  if (errAdj) return { ok: false, error: `${errAdj} (Quedó un borrador sin enviar en Borradores de reservas@.)` };

  const citado = borrador.data.body?.content ?? "";
  const parche = await graph("PATCH", `/me/messages/${encodeURIComponent(id)}`, {
    body: { contentType: "HTML", content: `${opts.html}<br>${citado}` },
    categories: [CATEGORIA_PLATAFORMA],
    ...(opts.cc?.length ? { ccRecipients: opts.cc.map((address) => ({ emailAddress: { address } })) } : {}),
  });
  if (!parche.ok) return { ok: false, error: `No se pudo escribir la respuesta: ${parche.error} (Quedó un borrador en Borradores.)` };

  const envio = await graph("POST", `/me/messages/${encodeURIComponent(id)}/send`);
  if (!envio.ok) return { ok: false, error: `Outlook no envió la respuesta: ${envio.error} (Quedó un borrador en Borradores.)` };

  return { ok: true, threadId: borrador.data.conversationId ?? null };
}

/**
 * Un correo NUEVO desde reservas@ (fuera de cualquier hilo). Lo usa la prueba del correo a
 * Pilgrim: sale del mismo buzón y con la misma pinta que el real, pero a la dirección de
 * prueba y sin tocar el hilo, para que a Pilgrim no le llegue nada.
 */
export async function enviarNuevo(opts: {
  para: string;
  asunto: string;
  html: string;
  adjuntos: AdjuntoOutlook[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const borrador = await graph<Borrador>("POST", "/me/messages", {
    subject: opts.asunto,
    body: { contentType: "HTML", content: opts.html },
    toRecipients: [{ emailAddress: { address: opts.para } }],
    categories: [CATEGORIA_PLATAFORMA],
  });
  if (!borrador.ok) return { ok: false, error: `No se pudo preparar el correo: ${borrador.error}` };
  const id = borrador.data.id;
  const errAdj = await adjuntar(id, opts.adjuntos);
  if (errAdj) return { ok: false, error: `${errAdj} (Quedó un borrador en Borradores de reservas@.)` };
  const envio = await graph("POST", `/me/messages/${encodeURIComponent(id)}/send`);
  if (!envio.ok) return { ok: false, error: `Outlook no envió el correo: ${envio.error} (Quedó un borrador en Borradores.)` };
  return { ok: true };
}
