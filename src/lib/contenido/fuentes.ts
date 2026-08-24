// Carga de tipografías para Satori (`ImageResponse` de next/og).
//
// Satori NO hereda las fuentes del navegador ni las de next/font: hay que pasarle los
// bytes del archivo en cada render. Si no se le pasan, cae en Geist (la que trae
// @vercel/og) y la pieza sale con una tipografía que no es de la marca — sin lanzar
// ningún error, que es lo traicionero.
//
// Se memoiza a nivel de módulo: leer cuatro TTF del disco en cada request es el grueso
// del costo evitable del endpoint de render.
//
// Ojo con el formato: Satori acepta ttf, otf y woff. **No acepta woff2.**

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TIPO } from "./marca";

export type FuenteSatori = {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

// `process.cwd()` es la raíz de la app tanto en `npm run dev` como en el build de
// Railway: no hay `output: "standalone"`, así que Railpack sirve el árbol completo y
// src/lib/fonts viaja con él. (Los TTF de Inter ya los usaba el PDF de cotizaciones.)
const DIR_FUENTES = join(process.cwd(), "src", "lib", "fonts");

const ARCHIVOS: Array<{ archivo: string; name: string; weight: 400 | 700 }> = [
  { archivo: "Caladea-Regular.ttf", name: TIPO.display, weight: 400 },
  { archivo: "Caladea-Bold.ttf", name: TIPO.display, weight: 700 },
  { archivo: "Inter-Regular.ttf", name: TIPO.cuerpo, weight: 400 },
  { archivo: "Inter-Bold.ttf", name: TIPO.cuerpo, weight: 700 },
];

let cache: FuenteSatori[] | null = null;

/** Las cuatro fuentes de marca, listas para el campo `fonts` de ImageResponse. */
export function fuentesDeMarca(): FuenteSatori[] {
  if (cache) return cache;
  cache = ARCHIVOS.map(({ archivo, name, weight }) => {
    const ruta = join(DIR_FUENTES, archivo);
    let data: Buffer;
    try {
      data = readFileSync(ruta);
    } catch {
      // Mejor un error explícito que una pieza silenciosamente fuera de marca.
      throw new Error(
        `No se encontró la tipografía ${archivo} en ${DIR_FUENTES}. ` +
          `Sin ella las piezas salen en la fuente de reemplazo de Satori, sin avisar.`,
      );
    }
    return { name, data, weight, style: "normal" as const };
  });
  return cache;
}
