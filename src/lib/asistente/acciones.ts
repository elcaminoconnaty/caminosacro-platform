import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient as Base } from "@supabase/supabase-js";
import { enviarNuevo, outlookConfigurado, responderEnHilo, OUTLOOK_MAX_ADJUNTO, type AdjuntoOutlook } from "@/lib/email/outlook";
import { registrarEnvio } from "@/lib/email/log";
import { ORIGEN_PLATAFORMA, P_MINI, esc, parrafos } from "@/lib/email/shell";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = Base<any, any, any>;

/**
 * Acciones del asistente: él PROPONE y la persona CONFIRMA. Hoy, una: enviar un correo desde
 * reservas@caminosacro.com, como respuesta dentro de un hilo o como correo nuevo.
 *
 * La propuesta no vive en el modelo ni en el navegador: queda guardada en el mensaje del
 * asistente (`asistente_mensajes.herramientas`, con el RLS de quien preguntó). Al confirmar,
 * el servidor relee ESA propuesta (solo puede confirmarla quien la pidió, vence a las 24 h) y
 * envía exactamente eso, con los retoques de texto que la persona haya hecho en la tarjeta.
 * Es la regla de la casa: muestro borrador, pido OK, ejecuto.
 */

export type PropuestaCorreo = {
  id: string;
  tipo: "correo";
  /** Responder dentro del hilo de `responderA.mensajeId`, o correo nuevo a `para`. */
  modo: "responder" | "nuevo";
  responderA: { mensajeId: string; asunto: string; de: string } | null;
  para: string;
  cc: string[];
  asunto: string;
  cuerpo: string;
  /** Rutas de Storage ("bucket/carpeta/archivo") que van adjuntas. */
  adjuntos: string[];
  quoteId: string | null;
  code: string | null;
  creada: string;
  estado: "propuesta" | "enviada" | "fallida" | "cancelada";
  resultado?: string | null;
  decididaEn?: string | null;
};

const VENCE_MS = 24 * 60 * 60 * 1000;
const CORREO = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const BUCKETS = new Set(["comercial-quotes", "comercial-contracts", "comercial-receipts", "comercial-docs", "comercial-passports", "comercial-welcome", "comercial-catalogs"]);

type Dir = { emailAddress?: { address?: string; name?: string } };

const NUESTRO = "reservas@caminosacro.com";

async function graphGet<T>(path: string): Promise<T | null> {
  const url = process.env.OUTLOOK_WEBHOOK_URL;
  const secreto = process.env.OUTLOOK_WEBHOOK_SECRET;
  if (!url || !secreto) return null;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": secreto },
    body: JSON.stringify({ method: "GET", path }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { ok?: boolean; data?: T } | null;
  return j?.ok && j.data ? j.data : null;
}

type MsgHilo = { id: string; subject?: string; from?: Dir; conversationId?: string; receivedDateTime?: string };
const dirDe = (m: MsgHilo) => {
  const f = m.from?.emailAddress;
  return f ? `${f.name ?? ""} <${f.address ?? ""}>`.trim() : "";
};

/**
 * El mensaje al que de verdad hay que responder. Si el indicado es NUESTRO (el último del hilo
 * lo mandó reservas@), responderle sería escribirnos a nosotros mismos: se responde al último
 * que llegó de afuera en ese mismo hilo, igual que hace la tarjeta de Pilgrim.
 */
async function mensajeAResponder(id: string): Promise<{ id: string; asunto: string; de: string } | { error: string }> {
  const m = await graphGet<MsgHilo>(`/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,conversationId`);
  if (!m) return { error: "No encontré ese correo en reservas@. Búscalo de nuevo con buscar_correos_reservas y usa su id." };
  if ((m.from?.emailAddress?.address ?? "").toLowerCase() !== NUESTRO) return { id: m.id, asunto: m.subject ?? "", de: dirDe(m) };
  const filtro = encodeURIComponent(`conversationId eq '${m.conversationId}'`);
  const hilo = await graphGet<{ value: MsgHilo[] }>(`/me/messages?$filter=${filtro}&$top=50&$select=id,subject,from,receivedDateTime`);
  const entrante = (hilo?.value ?? [])
    .filter((x) => (x.from?.emailAddress?.address ?? "").toLowerCase() !== NUESTRO)
    .sort((a, b) => (b.receivedDateTime ?? "").localeCompare(a.receivedDateTime ?? ""))[0];
  if (!entrante) return { error: "En ese hilo solo hay correos nuestros: no hay a quién responder. Propón un correo nuevo con `para` y `asunto`." };
  return { id: entrante.id, asunto: entrante.subject ?? m.subject ?? "", de: dirDe(entrante) };
}

/** Valida y arma la propuesta. No envía nada. */
export async function prepararCorreo(
  supabase: SupabaseClient,
  e: {
    responder_a_mensaje_id?: string | null;
    para?: string | null;
    cc?: string[] | null;
    asunto?: string | null;
    cuerpo: string;
    adjuntos?: string[] | null;
    codigo_cotizacion?: string | null;
  },
): Promise<{ propuesta: PropuestaCorreo } | { error: string }> {
  if (!outlookConfigurado()) return { error: "El buzón reservas@ no está conectado a la plataforma." };
  const cuerpo = (e.cuerpo ?? "").trim();
  if (cuerpo.length < 5) return { error: "Falta el texto del correo." };
  const cc = [...new Set((e.cc ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean))];
  const malo = cc.find((c) => !CORREO.test(c));
  if (malo) return { error: `La dirección en copia «${malo}» no es válida.` };

  let modo: PropuestaCorreo["modo"];
  let responderA: PropuestaCorreo["responderA"] = null;
  let para = (e.para ?? "").trim().toLowerCase();
  let asunto = (e.asunto ?? "").trim();
  if (e.responder_a_mensaje_id) {
    const m = await mensajeAResponder(e.responder_a_mensaje_id);
    if ("error" in m) return m;
    modo = "responder";
    responderA = { mensajeId: m.id, asunto: m.asunto, de: m.de };
    // En un hilo, Outlook pone el destinatario y el "RE:" del mensaje original: lo que diga el
    // modelo no cuenta, para que lo que se ve en la tarjeta sea lo que de verdad pasa.
    para = /<([^>]+)>/.exec(m.de)?.[1]?.toLowerCase() ?? para;
    asunto = /^re:/i.test(m.asunto) ? m.asunto : `RE: ${m.asunto}`;
  } else {
    modo = "nuevo";
    if (!CORREO.test(para)) return { error: "Para un correo nuevo hace falta un destinatario válido en `para`." };
    if (!asunto) return { error: "Para un correo nuevo hace falta un asunto." };
  }

  const adjuntos: string[] = [];
  for (const ruta of e.adjuntos ?? []) {
    const limpia = ruta.trim().replace(/^\/+/, "");
    const [bucket, ...resto] = limpia.split("/");
    if (!BUCKETS.has(bucket) || !resto.length || limpia.includes("..")) return { error: `El adjunto «${ruta}» no es una ruta válida de documentos.` };
    const carpeta = resto.slice(0, -1).join("/");
    const nombre = resto[resto.length - 1];
    const { data } = await supabase.storage.from(bucket).list(carpeta, { search: nombre, limit: 5 });
    const it = (data ?? []).find((x) => x.name === nombre);
    if (!it) return { error: `No encontré el documento «${limpia}».` };
    const peso = (it.metadata as { size?: number } | null)?.size ?? 0;
    if (peso > OUTLOOK_MAX_ADJUNTO) return { error: `«${nombre}» pesa más de 3 MB y Outlook no lo acepta por esta vía.` };
    adjuntos.push(limpia);
  }

  let quoteId: string | null = null;
  let code: string | null = null;
  if (e.codigo_cotizacion) {
    const { data } = await supabase.from("quotes").select("id, code").eq("code", e.codigo_cotizacion.trim().toUpperCase()).maybeSingle();
    if (data) ({ id: quoteId, code } = data as { id: string; code: string });
  }

  return {
    propuesta: {
      id: randomUUID(),
      tipo: "correo",
      modo,
      responderA,
      para,
      cc,
      asunto,
      cuerpo,
      adjuntos,
      quoteId,
      code,
      creada: new Date().toISOString(),
      estado: "propuesta",
    },
  };
}

export function htmlDelCorreo(cuerpo: string): string {
  return `<div>${parrafos(cuerpo)}<p style="${P_MINI}">${esc(ORIGEN_PLATAFORMA)}</p></div>`;
}

const TIPO: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

/** Envía una propuesta ya confirmada. Devuelve el texto del resultado. */
export async function enviarCorreo(supabase: SupabaseClient, p: PropuestaCorreo): Promise<{ ok: boolean; resultado: string }> {
  const archivos: AdjuntoOutlook[] = [];
  for (const ruta of p.adjuntos) {
    const [bucket, ...resto] = ruta.split("/");
    const { data, error } = await supabase.storage.from(bucket).download(resto.join("/"));
    if (error || !data) return { ok: false, resultado: `No pude leer el adjunto ${resto.at(-1)}. No se envió nada.` };
    const nombre = resto[resto.length - 1];
    archivos.push({ nombre, tipo: TIPO[(nombre.split(".").pop() || "").toLowerCase()] || "application/octet-stream", contenido: Buffer.from(await data.arrayBuffer()) });
  }
  const html = htmlDelCorreo(p.cuerpo);
  const r =
    p.modo === "responder" && p.responderA
      ? await responderEnHilo({ mensajeId: p.responderA.mensajeId, html, adjuntos: archivos, cc: p.cc })
      : await enviarNuevo({ para: p.para, cc: p.cc, asunto: p.asunto, html, adjuntos: archivos });

  await registrarEnvio(supabase, {
    quoteId: p.quoteId,
    code: p.code,
    tipo: "asistente",
    destinatario: [p.para, ...p.cc].join(", "),
    asunto: p.asunto,
    adjuntos: archivos.length,
    messageId: r.ok ? `outlook:${"threadId" in r ? (r.threadId ?? "hilo") : "nuevo"}` : null,
    error: r.ok ? null : r.error,
    html,
  });
  if (!r.ok) return { ok: false, resultado: r.error };
  return {
    ok: true,
    resultado: p.modo === "responder" ? `Enviado dentro del hilo «${p.asunto}» desde reservas@.` : `Enviado a ${p.para} desde reservas@.`,
  };
}

export function vencida(p: PropuestaCorreo): boolean {
  return Date.now() - new Date(p.creada).getTime() > VENCE_MS;
}
