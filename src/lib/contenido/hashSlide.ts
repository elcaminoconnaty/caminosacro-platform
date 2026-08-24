// Huella de un slide, para invalidar la caché del preview.
//
// El endpoint de render responde con `Cache-Control: immutable`, así que navegar entre
// slides ya vistos no cuesta un solo byte. Para que el preview SÍ cambie al editar, la
// URL lleva `?v=<hash>`: cambia el contenido, cambia el hash, cambia la URL.

import { createHash } from "node:crypto";
import type { Slide } from "./tipos";

export function hashSlide(slide: Slide | null, formato: string, escala: number): string {
  const json = JSON.stringify({ slide, formato, escala });
  return createHash("sha1").update(json).digest("hex").slice(0, 12);
}
