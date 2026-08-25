/*
 * Sin `import "server-only"` a propósito: este módulo cuelga de `render.tsx`, y `render.tsx`
 * lo importan las herramientas de verificación que corren en Node pelado
 * (`contenido_smoke.tsx`, `contenido_verifica_pieza.tsx`). Marcarlo como server-only las
 * rompe sin ganar nada: acá solo hay `fetch` y `Buffer`, y al módulo únicamente se llega
 * desde el servidor.
 */

/**
 * Caché de fotos en memoria del proceso.
 *
 * POR QUÉ EXISTE, medido: Satori **vuelve a descargar la foto en cada render**. No la
 * cachea. Con una foto del banco (320 KB) eso son 250-320 ms regalados en cada tecla que
 * escribe el usuario, y es la causa número uno de que el editor se sintiera lento.
 *
 * La alternativa obvia —pedirle a Supabase una versión pequeña con `/render/image/`—
 * **está cerrada**: devuelve 403 porque las transformaciones de imagen son de plan pago.
 * Comprobado. Así que se resuelve acá.
 *
 * Se guarda como data URI porque es lo que Satori acepta sin volver a salir a la red.
 */

type Entrada = { dataUri: string; bytes: number; usada: number };

const cache = new Map<string, Entrada>();

// Una foto del banco ronda los 320 KB, que en base64 son ~430 KB. Con 24 caben las que
// alguien toca en una sesión de trabajo sin que el proceso se hinche.
const MAX_ENTRADAS = 24;
const MAX_BYTES_FOTO = 12 * 1024 * 1024; // una foto de cámara sin optimizar no entra

function desalojarSiHaceFalta() {
  if (cache.size <= MAX_ENTRADAS) return;
  // Saca la menos usada recientemente. No hace falta una LRU de verdad para 24 entradas.
  let masVieja: string | null = null;
  let cuando = Infinity;
  for (const [k, v] of cache) {
    if (v.usada < cuando) {
      cuando = v.usada;
      masVieja = k;
    }
  }
  if (masVieja) cache.delete(masVieja);
}

/**
 * Devuelve la foto como data URI, descargándola solo la primera vez.
 * Si algo falla devuelve la URL original: mejor un render lento que un render roto.
 */
export async function comoDataUri(url: string): Promise<string> {
  // Ya es un data URI (viene de una subida reciente): no hay nada que hacer.
  if (url.startsWith("data:")) return url;

  const guardada = cache.get(url);
  if (guardada) {
    guardada.usada = Date.now();
    return guardada.dataUri;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return url;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES_FOTO) return url;

    const tipo = res.headers.get("content-type") ?? "image/jpeg";
    const dataUri = `data:${tipo};base64,${buf.toString("base64")}`;

    cache.set(url, { dataUri, bytes: buf.byteLength, usada: Date.now() });
    desalojarSiHaceFalta();
    return dataUri;
  } catch {
    return url;
  }
}

/** Para diagnóstico: cuántas fotos y cuánta memoria lleva la caché. */
export function estadoCache() {
  let bytes = 0;
  for (const v of cache.values()) bytes += v.bytes;
  return { fotos: cache.size, mb: Math.round((bytes / 1024 / 1024) * 10) / 10 };
}
