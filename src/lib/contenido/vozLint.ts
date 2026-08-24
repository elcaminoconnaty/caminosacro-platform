// Revisor de voz determinista.
//
// Las reglas duras del bloque TONO de estrategia.ts son reglas de forma —sin markdown,
// sin ciertas frases, máximo un emoji, hashtags de la lista curada— y para comprobarlas
// no hace falta un modelo: son expresiones regulares. Que las verifique código y no una
// segunda llamada a Claude las hace instantáneas, gratis y, sobre todo, deterministas:
// no pueden "pasar" un día y fallar al siguiente.
//
// Esto NO juzga si el texto es bueno. Solo caza lo que la marca tiene prohibido.

import { HASHTAGS } from "./estrategia";

export type Hallazgo = {
  regla: string;
  detalle: string;
  gravedad: "error" | "aviso";
};

// Las frases que estrategia.ts prohíbe literalmente. Se comparan sin tildes ni mayúsculas.
const FRASES_PROHIBIDAS = [
  "si puedes",
  "el camino si es para ti",
  "suenas con",
  "te lo mereces",
  "el camino que te mereces",
  "abrumar",
  "puede abrumar",
  "vistas que te quitan el aliento",
  "una experiencia unica e inolvidable",
  "en el corazon de",
  "conectar con tu esencia",
  "transformador",
  "transformadora",
  "listo para",
  "lista para",
  "sin limites",
  "hagamoslo realidad",
];

// Rioplatense: estrategia.ts pide acento neutro latinoamericano, tuteo siempre.
const RIOPLATENSE = ["vos ", "tenes", "sos ", "queres", "che ", "barbaro", "re lindo"];

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function contarEmojis(texto: string): number {
  // Coincide con los pictogramas y emoticones más comunes. No pretende ser exhaustivo:
  // basta para cazar el caso real, que es un copy sembrado de emojis.
  const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu;
  return (texto.match(re) ?? []).length;
}

export function revisarVoz(caption: string, hashtags: string): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const plano = normalizar(caption);

  // 1. Markdown: prohibido explícitamente ("nada de asteriscos, negritas ni encabezados").
  if (/\*|_{2,}|^#{1,6}\s/m.test(caption)) {
    hallazgos.push({
      regla: "Sin markdown",
      detalle: "Hay asteriscos, guiones bajos o encabezados. La voz los prohíbe.",
      gravedad: "error",
    });
  }

  // 2. Listas con viñetas: el "qué incluye" va en prosa, nunca como checklist.
  if (/^\s*[-•·✓✔]\s+/m.test(caption)) {
    hallazgos.push({
      regla: "Nada de listas",
      detalle: "Hay viñetas o checkmarks. El qué incluye va integrado en prosa.",
      gravedad: "error",
    });
  }

  // 3. Frases prohibidas.
  for (const f of FRASES_PROHIBIDAS) {
    if (plano.includes(f)) {
      hallazgos.push({
        regla: "Frase prohibida",
        detalle: `Aparece "${f}". estrategia.ts la marca como cliché.`,
        gravedad: "error",
      });
    }
  }

  // 4. Rioplatense y usted.
  for (const f of RIOPLATENSE) {
    if (plano.includes(f)) {
      hallazgos.push({
        regla: "Acento neutro",
        detalle: `Aparece "${f.trim()}". Se escribe en español neutro, con tuteo.`,
        gravedad: "error",
      });
    }
  }
  if (/\busted\b/.test(plano)) {
    hallazgos.push({ regla: "Tuteo", detalle: 'Aparece "usted". Siempre se tutea.', gravedad: "error" });
  }

  // 5. Emojis: máximo uno, y en el cierre.
  const n = contarEmojis(caption);
  if (n > 1) {
    hallazgos.push({
      regla: "Máximo un emoji",
      detalle: `Hay ${n}. La voz permite uno solo, opcional, y solo al cierre.`,
      gravedad: "error",
    });
  }

  // 6. Signos de exclamación en el cierre: el CTA va sin ellos.
  if (/!/.test(caption)) {
    hallazgos.push({
      regla: "Sin exclamaciones",
      detalle: "El cierre va sin signos de exclamación.",
      gravedad: "aviso",
    });
  }

  // 7. Hashtags fuera de la lista curada: "la IA elige de aquí; no inventa".
  const curados = new Set(HASHTAGS.map((h) => h.toLowerCase()));
  const usados = (hashtags.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase());
  const fuera = usados.filter((h) => !curados.has(h));
  if (fuera.length) {
    hallazgos.push({
      regla: "Hashtags de la lista",
      detalle: `Fuera de la lista curada: ${fuera.join(" ")}`,
      gravedad: "error",
    });
  }

  // 8. Largo: un caption de Instagram se corta a los ~125 caracteres en el feed, pero el
  // tope duro son 2200. Avisar del tope duro es útil; del corte, no, porque el desarrollo
  // largo es parte de la voz.
  if (caption.length > 2200) {
    hallazgos.push({
      regla: "Largo de Instagram",
      detalle: `${caption.length} caracteres. Instagram corta en 2200.`,
      gravedad: "error",
    });
  }

  return hallazgos;
}
