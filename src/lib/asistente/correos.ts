import "server-only";
import { htmlATexto, leerArchivo, type Contenido } from "@/lib/asistente/pdf";

/**
 * Lectura de correos para el asistente. SOLO LECTURA en los dos buzones:
 *
 *  - reservas@caminosacro.com (Microsoft 365) por el puente de n8n que ya usa la tarjeta de
 *    Pilgrim ("Plataforma → Outlook (Camino Sacro)"). Ese puente también acepta POST/PATCH
 *    para responder correos; aquí solo se manda GET, a propósito.
 *  - elcaminoconnaty@gmail.com directo a la API de Gmail, con la misma autorización que usa
 *    BayMax (su cliente OAuth de Google y el refresh token de la cuenta `elcamino`). Ese token
 *    también podría enviar o mandar a la papelera: aquí solo se hacen GET, y `gmail()` se
 *    niega a cualquier ruta que no sea leer mensajes o hilos.
 *
 * Nada de esto envía, marca como leído ni mueve correos.
 */

const MAX_CUERPO = 25_000;
const MAX_ADJUNTO = 15_000_000;

type Resp<T> = { ok: true; data: T } | { ok: false; error: string };

async function puente<T>(url: string | undefined, secreto: string | undefined, nombre: string, body: unknown): Promise<Resp<T>> {
  if (!url || !secreto) return { ok: false, error: `El buzón ${nombre} no está conectado a la plataforma.` };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": secreto },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; status?: number; data?: unknown; error?: string } | null;
    if (!j) return { ok: false, error: `El puente de ${nombre} respondió ${r.status} sin datos.` };
    if (!j.ok) {
      const d = j.data as { error?: { message?: string } } | null;
      return { ok: false, error: `${nombre}: ${d?.error?.message || j.error || `respondió ${j.status ?? r.status}`}` };
    }
    return { ok: true, data: j.data as T };
  } catch (e) {
    return { ok: false, error: `No pude hablar con ${nombre}: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// reservas@caminosacro.com (Outlook / Microsoft Graph)
// ---------------------------------------------------------------------------

function outlook<T>(path: string, headers?: Record<string, string>) {
  return puente<T>(process.env.OUTLOOK_WEBHOOK_URL, process.env.OUTLOOK_WEBHOOK_SECRET, "reservas@", {
    method: "GET",
    path,
    ...(headers ? { headers } : {}),
  });
}

type Direccion = { emailAddress?: { address?: string; name?: string } };
type MensajeGraph = {
  id: string;
  conversationId: string;
  subject: string | null;
  receivedDateTime: string;
  bodyPreview?: string;
  hasAttachments?: boolean;
  from?: Direccion;
  toRecipients?: Direccion[];
  ccRecipients?: Direccion[];
  body?: { contentType: string; content: string };
};

const dir = (d?: Direccion) => (d?.emailAddress ? `${d.emailAddress.name ?? ""} <${d.emailAddress.address ?? ""}>`.trim() : "");
const enc = encodeURIComponent;

export async function buscarReservas(texto: string, max = 15): Promise<string> {
  const top = Math.min(Math.max(max, 1), 25);
  const sel = "$select=id,conversationId,subject,receivedDateTime,from,toRecipients,bodyPreview,hasAttachments";
  // $search no se puede combinar con $orderby; sin texto, los más recientes.
  const path = texto.trim()
    ? `/me/messages?$search=${enc(`"${texto.replace(/"/g, "")}"`)}&$top=${top}&${sel}`
    : `/me/messages?$orderby=${enc("receivedDateTime desc")}&$top=${top}&${sel}`;
  const r = await outlook<{ value: MensajeGraph[] }>(path);
  if (!r.ok) return r.error;
  const filas = r.data.value ?? [];
  if (!filas.length) return "Sin resultados en reservas@ para esa búsqueda.";
  filas.sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime));
  return filas
    .map(
      (m) =>
        `- id: ${m.id}\n  hilo: ${m.conversationId}\n  fecha: ${m.receivedDateTime}\n  de: ${dir(m.from)}\n  para: ${(m.toRecipients ?? []).map(dir).join(", ")}\n  asunto: ${m.subject ?? "(sin asunto)"}${m.hasAttachments ? "\n  📎 tiene adjuntos" : ""}\n  vista previa: ${(m.bodyPreview ?? "").slice(0, 240).replace(/\s+/g, " ")}`
    )
    .join("\n");
}

async function adjuntosReservas(id: string): Promise<string> {
  const r = await outlook<{ value: { id: string; name: string; contentType: string; size: number; isInline: boolean }[] }>(
    `/me/messages/${enc(id)}/attachments?$select=id,name,contentType,size,isInline`
  );
  if (!r.ok) return `(no pude listar los adjuntos: ${r.error})`;
  const lista = (r.data.value ?? []).filter((a) => !a.isInline || a.contentType === "application/pdf");
  if (!lista.length) return "";
  return `Adjuntos:\n${lista.map((a) => `- ${a.name} (${a.contentType}, ${Math.round(a.size / 1024)} KB) → adjunto_id: ${a.id}`).join("\n")}`;
}

function cuerpoGraph(m: MensajeGraph): string {
  const c = m.body?.content ?? "";
  const t = m.body?.contentType === "html" ? htmlATexto(c) : c;
  return t.length > MAX_CUERPO ? t.slice(0, MAX_CUERPO) + "\n… [recortado]" : t;
}

export async function leerReservas(id: string, hiloCompleto: boolean): Promise<string> {
  const sel = "$select=id,conversationId,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments";
  const texto = { Prefer: 'outlook.body-content-type="text"' };
  const r = await outlook<MensajeGraph>(`/me/messages/${enc(id)}?${sel}`, texto);
  if (!r.ok) return r.error;
  let mensajes = [r.data];
  if (hiloCompleto) {
    const h = await outlook<{ value: MensajeGraph[] }>(
      `/me/messages?$filter=${enc(`conversationId eq '${r.data.conversationId}'`)}&$top=30&${sel}`,
      texto
    );
    if (h.ok && h.data.value?.length) mensajes = h.data.value.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));
  }
  const partes: string[] = [];
  for (const m of mensajes) {
    const adj = m.hasAttachments ? await adjuntosReservas(m.id) : "";
    partes.push(
      `=== ${m.receivedDateTime} · id: ${m.id}\nDe: ${dir(m.from)}\nPara: ${(m.toRecipients ?? []).map(dir).join(", ")}${m.ccRecipients?.length ? `\nCC: ${m.ccRecipients.map(dir).join(", ")}` : ""}\nAsunto: ${m.subject ?? ""}\n\n${cuerpoGraph(m)}${adj ? `\n\n${adj}` : ""}`
    );
  }
  return partes.join("\n\n");
}

export async function adjuntoReservas(mensajeId: string, adjuntoId: string): Promise<Contenido[]> {
  const r = await outlook<{ name: string; contentType: string; size: number; contentBytes?: string }>(
    `/me/messages/${enc(mensajeId)}/attachments/${enc(adjuntoId)}`
  );
  if (!r.ok) return [{ type: "text", text: r.error }];
  if (!r.data.contentBytes) return [{ type: "text", text: `«${r.data.name}» no es un archivo (puede ser un correo o un elemento adjunto de Outlook).` }];
  if (r.data.size > MAX_ADJUNTO) return [{ type: "text", text: `«${r.data.name}» pesa demasiado para leerlo aquí.` }];
  return leerArchivo(Buffer.from(r.data.contentBytes, "base64"), r.data.name, r.data.contentType);
}

// ---------------------------------------------------------------------------
// elcaminoconnaty@gmail.com (Gmail API)
// ---------------------------------------------------------------------------

let accesoGmail: { token: string; vence: number } | null = null;

/** Access token de Google a partir del refresh token (dura ~1 h; se renueva 5 min antes). */
async function tokenGmail(): Promise<string | { error: string }> {
  if (accesoGmail && accesoGmail.vence > Date.now()) return accesoGmail.token;
  const id = process.env.GMAIL_ECN_CLIENT_ID;
  const secreto = process.env.GMAIL_ECN_CLIENT_SECRET;
  const refresh = process.env.GMAIL_ECN_REFRESH_TOKEN;
  if (!id || !secreto || !refresh) return { error: "El Gmail de El Camino con Naty no está conectado a la plataforma." };
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secreto, refresh_token: refresh, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await r.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string; error_description?: string } | null;
    if (!r.ok || !j?.access_token) {
      return { error: `Google no renovó el acceso al Gmail de El Camino con Naty (${j?.error_description || j?.error || r.status}). Hay que reconectar la cuenta en BayMax (npm run correo -- elcamino) y copiar el token nuevo.` };
    }
    accesoGmail = { token: j.access_token, vence: Date.now() + ((j.expires_in ?? 3600) - 300) * 1000 };
    return j.access_token;
  } catch (e) {
    return { error: `No pude hablar con Google: ${(e as Error).message}` };
  }
}

async function gmail<T>(path: string): Promise<Resp<T>> {
  // Solo lectura: mensajes, hilos y adjuntos. Nada de enviar, modificar ni borrar.
  if (!/^\/gmail\/v1\/users\/me\/(messages|threads)(\/|\?|$)/.test(path) || path.includes("..")) {
    return { ok: false, error: "Ruta de Gmail no permitida." };
  }
  const token = await tokenGmail();
  if (typeof token !== "string") return { ok: false, error: token.error };
  try {
    const r = await fetch(`https://gmail.googleapis.com${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    });
    const j = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!r.ok) {
      if (r.status === 401) accesoGmail = null;
      return { ok: false, error: `el Gmail de El Camino con Naty: ${j?.error?.message || `respondió ${r.status}`}` };
    }
    return { ok: true, data: j as T };
  } catch (e) {
    return { ok: false, error: `No pude hablar con el Gmail de El Camino con Naty: ${(e as Error).message}` };
  }
}

type Cabecera = { name: string; value: string };
type Parte = { partId?: string; mimeType: string; filename?: string; headers?: Cabecera[]; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Parte[] };
type MensajeGmail = { id: string; threadId: string; snippet?: string; internalDate?: string; labelIds?: string[]; payload?: Parte };

const cab = (p: Parte | undefined, n: string) => p?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export async function buscarGmail(consulta: string, max = 15): Promise<string> {
  const n = Math.min(Math.max(max, 1), 20);
  const r = await gmail<{ messages?: { id: string; threadId: string }[] }>(
    `/gmail/v1/users/me/messages?maxResults=${n}${consulta.trim() ? `&q=${enc(consulta)}` : ""}`
  );
  if (!r.ok) return r.error;
  const ids = r.data.messages ?? [];
  if (!ids.length) return "Sin resultados en el Gmail de El Camino con Naty para esa búsqueda.";
  const meta = await Promise.all(
    ids.map((m) =>
      gmail<MensajeGmail>(
        `/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`
      )
    )
  );
  return meta
    .map((x, i) => {
      if (!x.ok) return `- id: ${ids[i].id} (no pude leer el encabezado)`;
      const m = x.data;
      return `- id: ${m.id}\n  hilo: ${m.threadId}\n  fecha: ${cab(m.payload, "Date")}\n  de: ${cab(m.payload, "From")}\n  para: ${cab(m.payload, "To")}\n  asunto: ${cab(m.payload, "Subject") || "(sin asunto)"}\n  vista previa: ${(m.snippet ?? "").slice(0, 240)}`;
    })
    .join("\n");
}

function recorrer(p: Parte | undefined, f: (p: Parte) => void) {
  if (!p) return;
  f(p);
  p.parts?.forEach((h) => recorrer(h, f));
}

function textoGmail(m: MensajeGmail): { cuerpo: string; adjuntos: string[] } {
  let plano = "";
  let html = "";
  const adjuntos: string[] = [];
  recorrer(m.payload, (p) => {
    if (p.filename && p.body?.attachmentId) {
      adjuntos.push(`- ${p.filename} (${p.mimeType}, ${Math.round((p.body.size ?? 0) / 1024)} KB) → adjunto_id: ${p.partId}`);
    } else if (p.mimeType === "text/plain" && p.body?.data && !plano) plano = b64url(p.body.data).toString("utf8");
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = b64url(p.body.data).toString("utf8");
  });
  let cuerpo = plano || htmlATexto(html) || m.snippet || "";
  if (cuerpo.length > MAX_CUERPO) cuerpo = cuerpo.slice(0, MAX_CUERPO) + "\n… [recortado]";
  return { cuerpo, adjuntos };
}

function formatoGmail(m: MensajeGmail): string {
  const { cuerpo, adjuntos } = textoGmail(m);
  return `=== ${cab(m.payload, "Date")} · id: ${m.id}\nDe: ${cab(m.payload, "From")}\nPara: ${cab(m.payload, "To")}${cab(m.payload, "Cc") ? `\nCC: ${cab(m.payload, "Cc")}` : ""}\nAsunto: ${cab(m.payload, "Subject")}\n\n${cuerpo}${adjuntos.length ? `\n\nAdjuntos (usa el id de ESTE mensaje):\n${adjuntos.join("\n")}` : ""}`;
}

export async function leerGmail(id: string, hiloCompleto: boolean): Promise<string> {
  const r = await gmail<MensajeGmail>(`/gmail/v1/users/me/messages/${enc(id)}?format=full`);
  if (!r.ok) return r.error;
  if (!hiloCompleto) return formatoGmail(r.data);
  const h = await gmail<{ messages?: MensajeGmail[] }>(`/gmail/v1/users/me/threads/${enc(r.data.threadId)}?format=full`);
  if (!h.ok || !h.data.messages?.length) return formatoGmail(r.data);
  return h.data.messages.slice(-25).map(formatoGmail).join("\n\n");
}

export async function adjuntoGmail(mensajeId: string, parteId: string): Promise<Contenido[]> {
  // Gmail cambia el attachmentId en cada lectura del mensaje: al modelo se le da el número de
  // parte (estable) y aquí se busca el attachmentId vigente.
  const m = await gmail<MensajeGmail>(`/gmail/v1/users/me/messages/${enc(mensajeId)}?format=full`);
  if (!m.ok) return [{ type: "text", text: m.error }];
  let parte: Parte | null = null;
  recorrer(m.data.payload, (p) => {
    if (p.partId === parteId && p.body?.attachmentId) parte = p;
  });
  const info = parte as Parte | null;
  if (!info) return [{ type: "text", text: "Ese adjunto no está en ese mensaje. Revisa el id del mensaje y del adjunto." }];
  if ((info.body?.size ?? 0) > MAX_ADJUNTO) return [{ type: "text", text: `«${info.filename}» pesa demasiado para leerlo aquí.` }];
  const a = await gmail<{ data?: string }>(`/gmail/v1/users/me/messages/${enc(mensajeId)}/attachments/${enc(info.body!.attachmentId!)}`);
  if (!a.ok) return [{ type: "text", text: a.error }];
  if (!a.data.data) return [{ type: "text", text: "El adjunto vino vacío." }];
  return leerArchivo(b64url(a.data.data), info.filename || "adjunto", info.mimeType);
}
