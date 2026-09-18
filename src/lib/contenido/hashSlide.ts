// Huella de un slide, para invalidar la caché del preview.
//
// El endpoint de render responde con `Cache-Control: immutable`, así que navegar entre
// slides ya vistos no cuesta un solo byte. Para que el preview SÍ cambie al editar, la
// URL lleva `?v=<hash>`: cambia el contenido, cambia el hash, cambia la URL.
//
// Es un djb2 a mano y no `node:crypto` a propósito: esto lo llama el editor, que corre
// en el navegador. No es criptografía, es un cache-buster.

import type { Slide } from "./tipos";

function djb2(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function hashSlide(slide: Slide | null | undefined, formato: string): string {
  return djb2(JSON.stringify({ slide: slide ?? null, formato }));
}

/**
 * Huella de la pieza entera (todos los slides + formato). Se guarda como `export_hash` al
 * exportar y se compara al publicar: si no coincide, los JPG del bucket no son lo que se
 * ve en pantalla y NO se publica. Mismo djb2, mismas dos puntas (navegador y servidor).
 */
export function hashPieza(slides: Slide[], formato: string): string {
  return djb2(canonico({ slides, formato }));
}

/**
 * JSON con las claves ordenadas, a todos los niveles. Postgres guarda el jsonb con sus
 * claves en OTRO orden (por largo y luego alfabético) y zod devuelve el del esquema: el
 * mismo slide daba dos textos distintos según de dónde viniera, y la huella no cuadraba.
 */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
