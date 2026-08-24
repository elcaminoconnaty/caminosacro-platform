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
