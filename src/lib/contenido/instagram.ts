import "server-only";

/**
 * Graph API de Instagram: lo justo para publicar foto única, carrusel e historia.
 *
 * Copiado y ampliado de `_shared/instagram.ts` del bot viejo (caminosacro-ig-auto), que
 * solo sabía de foto única. Misma versión de API (v21.0): es la que lleva un año
 * publicando con este token y no hay motivo para cambiarla a ciegas.
 *
 * Flujo de dos pasos, siempre: crear contenedor(es) → esperar `status_code = FINISHED` →
 * `media_publish`. Instagram descarga la imagen por URL de forma asíncrona; publicar antes
 * da el error 9007/2207027 ("media no está lista"). Los contenedores caducan a las 24 h.
 *
 * Límites que Meta documenta y que aquí se dan por sentados: JPEG, ≤ 8 MB, ancho entre
 * 320 y 1440 px, proporción entre 4:5 y 1.91:1 en el feed; carrusel de 2 a 10 elementos,
 * todos recortados a la proporción del primero; 100 publicaciones por API cada 24 h.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type CredencialesIg = { igUserId: string; token: string };

type Json = Record<string, unknown>;

async function llamar(path: string, params: Record<string, string>, method: "GET" | "POST"): Promise<Json> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method, cache: "no-store" });
  let data: Json = {};
  try { data = (await res.json()) as Json; } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const err = data.error as { message?: string; code?: number; error_subcode?: number } | undefined;
    throw new Error(
      `Instagram respondió ${res.status}${err?.code ? ` (código ${err.code}${err.error_subcode ? `/${err.error_subcode}` : ""})` : ""}: ${err?.message ?? JSON.stringify(data)}`,
    );
  }
  return data;
}

/** Contenedor de una imagen: para el feed, como elemento de carrusel o como historia. */
export async function crearContenedorImagen(
  c: CredencialesIg,
  opts: { imageUrl: string; caption?: string; esItemCarrusel?: boolean; esHistoria?: boolean },
): Promise<string> {
  const params: Record<string, string> = { image_url: opts.imageUrl, access_token: c.token };
  if (opts.esItemCarrusel) params.is_carousel_item = "true";
  else if (opts.esHistoria) params.media_type = "STORIES";
  if (opts.caption && !opts.esItemCarrusel && !opts.esHistoria) params.caption = opts.caption;
  const data = await llamar(`${c.igUserId}/media`, params, "POST");
  if (typeof data.id !== "string") throw new Error(`crear contenedor: respuesta sin id (${JSON.stringify(data)})`);
  return data.id;
}

/** Contenedor padre del carrusel: los hijos ya creados con `is_carousel_item`. */
export async function crearContenedorCarrusel(
  c: CredencialesIg,
  opts: { hijos: string[]; caption: string },
): Promise<string> {
  if (opts.hijos.length < 2 || opts.hijos.length > 10) {
    throw new Error(`un carrusel lleva entre 2 y 10 imágenes; esta pieza tiene ${opts.hijos.length}.`);
  }
  const data = await llamar(
    `${c.igUserId}/media`,
    { media_type: "CAROUSEL", children: opts.hijos.join(","), caption: opts.caption, access_token: c.token },
    "POST",
  );
  if (typeof data.id !== "string") throw new Error(`crear carrusel: respuesta sin id (${JSON.stringify(data)})`);
  return data.id;
}

/**
 * Espera a que Instagram termine de procesar el contenedor. Sondea `status_code` cada
 * 3 s hasta 20 veces (un minuto): más que suficiente para JPEG de 250 KB; Meta sugiere
 * no pasar de 5 minutos.
 */
export async function esperarContenedorListo(c: CredencialesIg, creationId: string, intentos = 20, esperaMs = 3000): Promise<void> {
  for (let i = 0; i < intentos; i++) {
    const data = await llamar(creationId, { fields: "status_code,status", access_token: c.token }, "GET");
    const code = data.status_code as string | undefined;
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`el contenedor quedó en ${code}: ${String(data.status ?? "")}`);
    }
    await new Promise((r) => setTimeout(r, esperaMs));
  }
  throw new Error(`el contenedor no quedó listo en ${(intentos * esperaMs) / 1000} s`);
}

/** Publica el contenedor ya listo. Devuelve el id del media publicado. */
export async function publicarContenedor(c: CredencialesIg, creationId: string): Promise<string> {
  const data = await llamar(`${c.igUserId}/media_publish`, { creation_id: creationId, access_token: c.token }, "POST");
  if (typeof data.id !== "string") throw new Error(`media_publish: respuesta sin id (${JSON.stringify(data)})`);
  return data.id;
}

/** URL pública del post. Nunca lanza: sin permalink el post igual existe. */
export async function obtenerPermalink(c: CredencialesIg, mediaId: string): Promise<string | null> {
  try {
    const data = await llamar(mediaId, { fields: "permalink", access_token: c.token }, "GET");
    return typeof data.permalink === "string" ? data.permalink : null;
  } catch {
    return null;
  }
}

/** Cuántas publicaciones por API van en las últimas 24 h y cuál es el tope (100). */
export async function limitePublicacion(c: CredencialesIg): Promise<{ usado: number; tope: number }> {
  const data = await llamar(`${c.igUserId}/content_publishing_limit`, { fields: "quota_usage,config", access_token: c.token }, "GET");
  const fila = (data.data as Array<{ quota_usage?: number; config?: { quota_total?: number } }> | undefined)?.[0];
  return { usado: fila?.quota_usage ?? 0, tope: fila?.config?.quota_total ?? 100 };
}

/** Nombre de usuario de la cuenta: sirve para comprobar que el token vive. */
export async function nombreDeCuenta(c: CredencialesIg): Promise<string> {
  const data = await llamar(c.igUserId, { fields: "username", access_token: c.token }, "GET");
  return String(data.username ?? "");
}
