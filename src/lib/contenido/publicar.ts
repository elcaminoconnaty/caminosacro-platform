import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { FORMATOS, esFormatoId } from "@/lib/contenido/formatos";
import { leerSlides } from "@/lib/contenido/tipos";
import { hashPieza } from "@/lib/contenido/hashSlide";
import { fechaLocal } from "@/lib/contenido/fechas";
import {
  crearContenedorCarrusel, crearContenedorImagen, esperarContenedorListo,
  obtenerPermalink, publicarContenedor, type CredencialesIg,
} from "@/lib/contenido/instagram";

/**
 * Publica en Instagram una pieza que YA está en estado `publicando` (la tomó el cron con
 * `contenido_tomar_publicaciones`, o "Publicar ahora" con la misma actualización atómica).
 *
 * Nunca lanza: deja la pieza en `publicado` con su permalink, o la devuelve a la cola
 * (`programado`, hasta 3 intentos) o a `listo` con el motivo en `publicacion_error`.
 * Los errores que no se arreglan reintentando —pieza sin exportar, cambió después de
 * exportar, formato reel— van directo a `listo` sin gastar intentos.
 *
 * Escribe en `public.posts_log` (origen 'estudio') para que el cron de métricas del bot,
 * si algún día se enciende, recoja estos posts sin tocar nada.
 */

export const MAX_INTENTOS = 3;
const CAPTION_MAX = 2200;

export type PiezaTomada = {
  id: string;
  titulo: string;
  formato: string;
  slides: unknown;
  caption: string | null;
  hashtags: string | null;
  pilar: string | null;
  export_paths: unknown;
  export_hash: string | null;
  publicacion_intentos: number | null;
};

export type ResultadoPublicacion =
  | { ok: true; mediaId: string; permalink: string | null }
  | { ok: false; error: string; definitivo: boolean };

/** Lo que impide publicar sin siquiera hablar con Instagram. `null` si todo cuadra. */
export function motivoNoPublicable(p: Pick<PiezaTomada, "formato" | "slides" | "export_paths" | "export_hash">): string | null {
  if (!esFormatoId(p.formato)) return "El formato de la pieza no existe.";
  if (p.formato === "reel") {
    return "La portada de reel no se publica por API: es la carátula de un video. Expórtala y súbela a mano con el reel.";
  }
  const { slides, error } = leerSlides(p.slides);
  if (error) return `Los slides no se pueden leer: ${error}`;
  if (slides.length === 0) return "La pieza no tiene slides.";
  const rutas = Array.isArray(p.export_paths) ? (p.export_paths as string[]) : [];
  if (rutas.length === 0) return "La pieza no está exportada: no hay imágenes que publicar.";
  if (rutas.length !== slides.length) {
    return `Hay ${slides.length} slides pero ${rutas.length} imágenes exportadas. Vuelve a exportar.`;
  }
  if (!p.export_hash || p.export_hash !== hashPieza(slides, p.formato)) {
    return "La pieza cambió después de exportarla. Ábrela y vuelve a programarla para exportar la versión actual.";
  }
  if (p.formato !== "9x16" && slides.length > 10) return "Un carrusel lleva como máximo 10 imágenes.";
  return null;
}

export function armarCaption(caption: string | null, hashtags: string | null): string {
  const texto = `${(caption ?? "").trim()}\n\n${(hashtags ?? "").trim()}`.trim();
  return texto.length > CAPTION_MAX ? texto.slice(0, CAPTION_MAX) : texto;
}

function urlPublica(rutaConBucket: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${rutaConBucket}`;
}

async function credenciales(): Promise<CredencialesIg> {
  const admin = createAdminClient("public");
  const { data, error } = await admin.from("ig_tokens").select("ig_user_id,access_token").eq("id", 1).maybeSingle();
  if (error || !data?.access_token || !data.ig_user_id) {
    throw new Error("No hay token de Instagram en ig_tokens (id=1).");
  }
  return { igUserId: String(data.ig_user_id), token: String(data.access_token) };
}

/** Publica en la cuenta: feed (una imagen o carrusel) o historias (una por slide). */
async function publicarEnInstagram(p: PiezaTomada): Promise<{ mediaId: string; permalink: string | null; mediaIds: string[] }> {
  const c = await credenciales();
  const rutas = p.export_paths as string[];
  const urls = rutas.map(urlPublica);
  const caption = armarCaption(p.caption, p.hashtags);

  if (p.formato === "9x16") {
    // Cada slide es una historia aparte, en orden. Las historias no llevan caption.
    const ids: string[] = [];
    for (const url of urls) {
      const cont = await crearContenedorImagen(c, { imageUrl: url, esHistoria: true });
      await esperarContenedorListo(c, cont);
      ids.push(await publicarContenedor(c, cont));
    }
    return { mediaId: ids[0], permalink: await obtenerPermalink(c, ids[0]), mediaIds: ids };
  }

  if (urls.length === 1) {
    const cont = await crearContenedorImagen(c, { imageUrl: urls[0], caption });
    await esperarContenedorListo(c, cont);
    const mediaId = await publicarContenedor(c, cont);
    return { mediaId, permalink: await obtenerPermalink(c, mediaId), mediaIds: [mediaId] };
  }

  // Carrusel: un contenedor por imagen, luego el padre con los hijos ya listos.
  const hijos: string[] = [];
  for (const url of urls) {
    const cont = await crearContenedorImagen(c, { imageUrl: url, esItemCarrusel: true });
    await esperarContenedorListo(c, cont);
    hijos.push(cont);
  }
  const padre = await crearContenedorCarrusel(c, { hijos, caption });
  await esperarContenedorListo(c, padre);
  const mediaId = await publicarContenedor(c, padre);
  return { mediaId, permalink: await obtenerPermalink(c, mediaId), mediaIds: [mediaId] };
}

export async function publicarPiezaTomada(p: PiezaTomada): Promise<ResultadoPublicacion> {
  const admin = createAdminClient("public");
  const intentos = p.publicacion_intentos ?? 1;

  const motivo = motivoNoPublicable(p);
  if (motivo) return await fallar(p, motivo, true);

  try {
    const r = await publicarEnInstagram(p);
    const caption = armarCaption(p.caption, p.hashtags);
    const ahora = new Date().toISOString();

    const { error: errPieza } = await admin
      .from("contenido_piezas")
      .update({
        estado: "publicado", publicado_at: ahora, permalink: r.permalink, ig_media_id: r.mediaId,
        publicacion_error: null, publicando_desde: null,
      })
      .eq("id", p.id);
    if (errPieza) console.error(`[publicar] pieza ${p.id} publicada pero no se pudo marcar: ${errPieza.message}`);

    // Una fila por media publicado (una historia por slide da varias).
    const filas = r.mediaIds.map((mediaId, i) => ({
      origen: "estudio", pieza_id: p.id, pilar: p.pilar, caption,
      fecha_local: fechaLocal(ahora), status: "published",
      ig_media_id: mediaId, permalink: i === 0 ? r.permalink : null,
      caption_len: caption.length, n_hashtags: (p.hashtags?.match(/#[^\s#]+/g) ?? []).length,
    }));
    const { error: errLog } = await admin.from("posts_log").insert(filas);
    if (errLog) console.error(`[publicar] no se pudo escribir posts_log de ${p.id}: ${errLog.message}`);

    await avisar(`✅ Camino Sacro publicó «${p.titulo}» desde el estudio.\n${r.permalink ?? ""}`.trim());
    return { ok: true, mediaId: r.mediaId, permalink: r.permalink };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return await fallar(p, msg, intentos >= MAX_INTENTOS);
  }
}

/**
 * Registra el fallo. Si queda cuota de intentos vuelve a `programado` (la fecha ya pasó,
 * así que el siguiente tick del cron la vuelve a tomar); si no, a `listo` con el motivo,
 * para que se vea en la bandeja y en el calendario y alguien la vuelva a programar.
 */
async function fallar(p: PiezaTomada, motivo: string, definitivo: boolean): Promise<ResultadoPublicacion> {
  const admin = createAdminClient("public");
  const intentos = p.publicacion_intentos ?? 1;
  const texto = definitivo ? motivo : `${motivo} (intento ${intentos} de ${MAX_INTENTOS}; se reintenta solo)`;
  const { error } = await admin
    .from("contenido_piezas")
    .update({
      estado: definitivo ? "listo" : "programado",
      publicacion_error: texto,
      publicando_desde: null,
      ...(definitivo ? { programada_para: null } : {}),
    })
    .eq("id", p.id);
  if (error) console.error(`[publicar] no se pudo registrar el fallo de ${p.id}: ${error.message}`);

  if (definitivo) {
    await admin.from("posts_log").insert({
      origen: "estudio", pieza_id: p.id, fecha_local: fechaLocal(), status: "error", error_msg: motivo,
    });
    await avisar(`❌ Camino Sacro no pudo publicar «${p.titulo}».\n${motivo}`);
  }
  console.error(`[publicar] pieza ${p.id} falló${definitivo ? " (definitivo)" : ""}: ${motivo}`);
  return { ok: false, error: texto, definitivo };
}

/**
 * Aviso por Telegram, opcional: solo si TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID están en el
 * entorno (Railway). Sin ellos no pasa nada: el resultado siempre se ve en la bandeja y en
 * el calendario. Nunca lanza.
 */
async function avisar(texto: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* una notificación caída no cambia el resultado */ }
}

/** Ocupa el formato para el mensaje de la interfaz: "carrusel de 5", "historia (3)", "imagen". */
export function describirPublicacion(formato: string, nSlides: number): string {
  if (!esFormatoId(formato)) return "pieza";
  if (formato === "9x16") return nSlides === 1 ? "historia" : `${nSlides} historias`;
  if (nSlides === 1) return `imagen ${FORMATOS[formato].etiqueta}`;
  return `carrusel de ${nSlides}`;
}
