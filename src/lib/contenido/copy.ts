import "server-only";

import { z } from "zod";
import { revisarVoz } from "./vozLint";
import { aJsonSchema, type Encargo } from "./encargo";
import { SYSTEM_PROMPT, TONO, HASHTAGS, MARCA, PILARES } from "./estrategia";
import type { Slide } from "./tipos";
import { plantillaNombre } from "./plantillas/nombres";

export const RespuestaCopy = z.object({
  caption: z.string(),
  hashtags: z.string(),
  pilar: z.string(),
});

/**
 * Arma el encargo para que Claude escriba el caption de una pieza.
 *
 * El prompt se arma con el SYSTEM_PROMPT y el bloque TONO de estrategia.ts, que es la
 * misma voz que usa el bot que publica a diario. Si se editaran por separado, el feed
 * automático y el estudio empezarían a hablar distinto.
 */
export function construirEncargoCopy(opciones: {
  slides: Slide[];
  formato: string;
  pilarSugerido?: string | null;
}): Encargo {
  const { slides, formato, pilarSugerido } = opciones;

  // Lo que la pieza dice, slide por slide. Es lo único que el modelo necesita saber del
  // diseño: no ve las imágenes, lee el contenido.
  const guion = slides
    .map((s, i) => {
      const textos = Object.entries(s.valores)
        // etapas_json y ruta son datos de máquina, no texto de la pieza.
        .filter(([k, v]) => v && !["etapas_json", "ruta"].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");
      return `Slide ${i + 1} (${plantillaNombre(s.plantilla)}): ${textos}`;
    })
    .join("\n");

  const pilares = PILARES.map((p) => `- ${p.id}: ${p.nombre}`).join("\n");

  const user = `Escribe el caption de Instagram para esta pieza gráfica.

FORMATO DE LA PIEZA: ${formato}${slides.length > 1 ? ` · carrusel de ${slides.length} slides` : ""}

LO QUE DICE LA PIEZA:
${guion}

${pilarSugerido ? `PILAR SUGERIDO: ${pilarSugerido}\n` : ""}PILARES DISPONIBLES:
${pilares}

REGLAS DE TONO QUE DEBES CUMPLIR:
${TONO}

HASHTAGS PERMITIDOS (elige entre 8 y 15, SOLO de esta lista, no inventes ninguno):
${HASHTAGS.join(" ")}

El caption debe desarrollar lo que la pieza ya muestra, no repetirlo palabra por palabra.
Cierra con UN CTA con motivo invitando a escribirle a ${MARCA.asistente} por WhatsApp ${MARCA.whatsapp}.
Devuelve el caption, los hashtags separados por espacio, y el id del pilar que usaste.`;

  return { system: SYSTEM_PROMPT, user, schema: aJsonSchema(RespuestaCopy) };
}

/**
 * Valida y revisa lo que devolvió el worker.
 *
 * El revisor de voz corre SIEMPRE sobre la respuesta del modelo. No es desconfianza
 * decorativa: la primera vez que se generó copy de verdad salió en voseo argentino, que la
 * estrategia prohíbe. Las reglas duras del tono son de forma, y comprobarlas con regex es
 * gratis, instantáneo y determinista.
 */
export function interpretarCopy(crudo: unknown) {
  const r = RespuestaCopy.safeParse(crudo);
  if (!r.success) return { error: "Claude respondió con campos que no encajan. Vuelve a intentarlo." };
  return {
    ok: true as const,
    caption: r.data.caption,
    hashtags: r.data.hashtags,
    pilar: r.data.pilar,
    hallazgos: revisarVoz(r.data.caption, r.data.hashtags),
  };
}
