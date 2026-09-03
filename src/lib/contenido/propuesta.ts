// Lo que hay que hacerle a un carrusel PROPUESTO POR CLAUDE antes de creérselo.
//
// Vive aparte porque ahora hay dos motores que producen slides —el de sugerencias por
// datos (`ideas.ts`) y el de pedidos escritos (`pedido.ts`)— y los dos necesitan
// exactamente las mismas garantías: que la plantilla exista de verdad en el registry, que
// los campos sean los que esa plantilla declara, y que nunca salga un array vacío. Estaba
// escrito dentro de ideas.ts; se movió tal cual en vez de duplicarse.
//
// La regla de oro: estas funciones NO FALLAN NUNCA. Un modelo se equivoca de vez en cuando
// y esto tiene que salir bien siempre, así que lo que no encaja se descarta y lo que falta
// se rellena con los valores por defecto de la plantilla.

import { z } from "zod";
import { plantilla as buscarPlantilla, valoresPorDefecto, PLANTILLAS_LISTA } from "./plantillas/registry";

/** Un slide propuesto: misma forma que contenido_piezas.slides, sin la foto. */
export const SlidePropuesto = z.object({
  plantilla: z.string(),
  valores: z.record(z.string(), z.string()),
});

export type SlideLimpio = { plantilla: string; valores: Record<string, string> };

export const MIN_SLIDES = 4;
export const MAX_SLIDES = 6;

/** Descarta plantillas inventadas y campos que la plantilla no declara. */
export function limpiarSlides(slides: SlideLimpio[]): SlideLimpio[] {
  return slides.flatMap((s) => {
    const p = buscarPlantilla(s.plantilla);
    if (!p) return [];
    const idsCampos = new Set(p.definicion.campos.map((c) => c.id));
    const valores: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.valores)) {
      if (idsCampos.has(k) && v?.trim()) valores[k] = v;
    }
    // Un slide sin un solo campo con texto no aporta nada: fuera.
    return Object.keys(valores).length ? [{ plantilla: s.plantilla, valores }] : [];
  });
}

/**
 * Garantiza un carrusel de entre 4 y 6 slides, siempre, y con estructura sensata.
 *
 * Nico lo pidió tal cual: "mínimo 4 slides, máximo 6, nunca menos de 4". Antes esto podía
 * devolver un array vacío cuando la validación tumbaba slides, y entonces aceptar la idea
 * abría una pieza de relleno — justo lo que hacía sentir que la idea "no venía bien
 * entregada".
 *
 * Reglas que se imponen aquí y no se dejan al modelo, porque el modelo falla de vez en
 * cuando y esto tiene que salir bien SIEMPRE:
 *   - el primero es una portada,
 *   - el último es el cierre con CTA,
 *   - por el medio, cuerpo; si faltan, se completan con plantillas de cuerpo.
 */
export function completarCarrusel(slides: SlideLimpio[]): SlideLimpio[] {
  const limpios = limpiarSlides(slides);

  const rolDe = (id: string) => buscarPlantilla(id)?.definicion.rol;
  const portada = limpios.find((s) => rolDe(s.plantilla) === "portada");
  const cierre = limpios.find((s) => rolDe(s.plantilla) === "cierre");
  const cuerpo = limpios.filter((s) => rolDe(s.plantilla) === "cuerpo");

  // Plantillas de cuerpo con las que rellenar si Claude se quedó corto. Se rotan para no
  // repetir siempre la misma.
  const rellenos = ["tip-numerado", "dato-grande", "mito-realidad"].filter((id) => buscarPlantilla(id));

  const salida: SlideLimpio[] = [];
  salida.push(portada ?? { plantilla: "portada-ruta", valores: valoresPorDefecto("portada-ruta") });

  // Cuántos de cuerpo caben: entre 2 y 4, para acabar con 4-6 contando portada y cierre.
  const cuantosCuerpo = Math.min(Math.max(cuerpo.length, MIN_SLIDES - 2), MAX_SLIDES - 2);
  for (let i = 0; i < cuantosCuerpo; i++) {
    const propio = cuerpo[i];
    if (propio) {
      salida.push(propio);
    } else {
      const id = rellenos[i % rellenos.length] ?? "tip-numerado";
      salida.push({ plantilla: id, valores: valoresPorDefecto(id) });
    }
  }

  salida.push(cierre ?? { plantilla: "cierre-cta", valores: valoresPorDefecto("cierre-cta") });
  return salida;
}

/**
 * Un post de UNA SOLA IMAGEN: exactamente un slide, siempre.
 *
 * Existe porque `completarCarrusel` no sirve aquí: cuando alguien pide "3 posts de una
 * sola imagen sobre el Año Jacobeo", inflar cada uno a 4 slides con portada y cierre es
 * darle lo contrario de lo que pidió. La regla de 4-6 es del carrusel, no del módulo.
 *
 * Se prefiere el primer slide que NO sea el cierre-cta: un post de una imagen que solo
 * dice "escríbele a Clara" no comunica nada. Si el único válido es un cierre, se usa
 * igual antes que devolver vacío.
 */
export function completarUnico(slides: SlideLimpio[]): SlideLimpio[] {
  const limpios = limpiarSlides(slides);
  const rolDe = (id: string) => buscarPlantilla(id)?.definicion.rol;

  const elegido =
    limpios.find((s) => rolDe(s.plantilla) !== "cierre") ??
    limpios[0] ??
    { plantilla: "dato-grande", valores: valoresPorDefecto("dato-grande") };

  return [elegido];
}

/**
 * Recorta o completa hasta caer dentro del rango de slides que se pidió.
 *
 * Es el punto único por el que pasan los dos casos: un rango [1,1] va por `completarUnico`
 * y cualquier otro por `completarCarrusel`, que ya garantiza 4-6. Para rangos intermedios
 * (una historia de 1 a 3 slides) se limpia y se recorta, rellenando con cuerpo si hace
 * falta llegar al mínimo.
 */
export function completarSegunRango(slides: SlideLimpio[], min: number, max: number): SlideLimpio[] {
  if (max <= 1) return completarUnico(slides);
  if (min >= MIN_SLIDES) return completarCarrusel(slides);

  const limpios = limpiarSlides(slides);
  const rellenos = ["tip-numerado", "dato-grande", "mito-realidad"].filter((id) => buscarPlantilla(id));

  const salida = limpios.slice(0, max);
  let i = 0;
  while (salida.length < min) {
    const id = rellenos[i++ % rellenos.length] ?? "tip-numerado";
    salida.push({ plantilla: id, valores: valoresPorDefecto(id) });
  }
  return salida.length ? salida : completarUnico(slides);
}

/**
 * El catálogo de plantillas tal como se le enseña a Claude: ids, campos y CUÁNTO ESCRIBIR
 * en cada uno.
 *
 * ⚠️ LO IMPORTANTE ES EL SUELO, NO EL TECHO. Antes esto decía solo "máx N car." y el
 * modelo se quedaba cómodamente por debajo: en los consejos generados escribía entre 149
 * y 222 caracteres sobre un máximo de 260 (un 68% de media). Renderizado, eso deja el
 * slide medio vacío —el bloque de texto flotando en el centro con aire muerto arriba y
 * abajo—, que fue justo lo que Nico señaló: "en los tips hay que extenderse un poco más
 * en la explicación de cada tip".
 *
 * Un máximo es un permiso, no un objetivo. A los campos de explicación se les da un rango
 * con mínimo; a los titulares y etiquetas se les deja el techo de siempre, porque ahí
 * corto está bien.
 *
 * Lo usan los dos motores (sugerencias por datos y pedidos escritos) para que no se
 * separen: si solo se arregla en uno, el mismo consejo sale largo o corto según de dónde
 * haya nacido.
 */
export function catalogoDeSlides(): string {
  return PLANTILLAS_LISTA.map((p) => {
    const campos = p.definicion.campos
      .map((c) => {
        if (!c.maxLargo) return `${c.id} (sin límite)`;
        if (c.tipo === "textarea" && c.maxLargo >= 100) {
          return `${c.id} (DESARRÓLLALO: entre ${Math.round(c.maxLargo * 0.75)} y ${c.maxLargo} car.)`;
        }
        return `${c.id} (máx ${c.maxLargo} car.)`;
      })
      .join(", ");
    return `- ${p.definicion.id} [rol: ${p.definicion.rol}]: campos → ${campos || "sin campos"}`;
  }).join("\n");
}

/** La regla de largo, en prosa, para pegarla al prompt junto al catálogo. */
export const REGLA_DE_LARGO = `LARGO DE LOS TEXTOS — no te quedes corto. Donde el catálogo diga
"DESARRÓLLALO", ese campo es el contenido del slide, no un pie de foto: llega al rango que
indica. Un consejo de 150 caracteres deja la pieza medio vacía y no enseña nada que no
estuviera ya en el titular. Desarrolla: el dato concreto, el porqué, el error típico, el
matiz que solo sabe quien ya caminó muchas veces. Los titulares y las etiquetas, en cambio,
van cortos.`;
