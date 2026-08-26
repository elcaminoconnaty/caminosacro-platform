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

// Rioplatense: estrategia.ts pide acento neutro latinoamericano y tuteo siempre.
//
// La lista es larga a propósito. La primera versión solo tenía siete formas y dejó pasar
// un copy generado que decía "vivís", "escribile" y "arrancá": el voseo se cuela sobre
// todo por el IMPERATIVO (escribí, mirá, contá) y por el imperativo con pronombre pegado
// (escribile, decile, mandale), no por el "vos" suelto que uno espera.
// Se comparan como palabra completa y sin tildes, así que "arranca" (correcto) no
// dispara: solo lo hace "arrancá", que al normalizar queda igual — por eso las formas con
// tilde van aparte, comparadas contra el texto original.
const RIOPLATENSE_SIN_TILDE = [
  "vos", "sos", "che", "barbaro",
  // presente de indicativo
  "tenes", "queres", "podes", "sabes", "haces", "vivis", "venis", "decis",
  "escribis", "elegis", "sentis", "conoces", "preferis",
  // imperativo con pronombre pegado — el patrón que más se cuela
  "escribile", "decile", "contale", "mandale", "preguntale", "escribinos", "contanos",
  "animate", "sumate", "preparate", "llevate", "quedate", "acordate", "fijate", "date",
];

// Formas de imperativo voseante: se buscan CON tilde en el texto original, porque sin
// tilde son palabras perfectamente correctas ("mira", "cuenta", "deja").
const IMPERATIVO_VOSEANTE = [
  "arrancá", "empezá", "aprovechá", "consultá", "reservá", "descubrí", "conocé",
  "mirá", "escuchá", "dejá", "hacé", "tené", "poné", "sacá", "llevá", "contá",
  "vení", "andá", "escribí", "elegí", "pedí", "seguí", "sumá", "animá", "planeá",
];

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

/**
 * Describir la imagen está PROHIBIDO en el bloque TONO: "nada de 'en esta foto', 'esta
 * vista', 'este paisaje', 'mira cómo', el clima, la hora, la persona, lo que hace".
 *
 * La razón es de negocio, no de estilo: el caption tiene que valer por sí solo. Un texto
 * que narra la foto se queda sin nada que decir en cuanto la foto cambia, y no vende.
 * Esta regla no se estaba comprobando en absoluto.
 */
const DESCRIBE_LA_IMAGEN = [
  "en esta foto", "esta foto", "en la foto", "la foto de arriba",
  "en esta imagen", "esta imagen", "en la imagen",
  "esta vista", "este paisaje", "este lugar de la foto",
  "mira como", "miren como", "como ves", "como puedes ver", "aqui vemos", "aqui se ve",
  "la persona de la foto", "ellos estan", "el de la foto",
];

/** El emoji va "solo en el cierre": uno a mitad del texto rompe la regla igual. */
const COLA_DEL_TEXTO = 90;

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
  const palabras = new Set(plano.match(/[a-z]+/g) ?? []);
  for (const f of RIOPLATENSE_SIN_TILDE) {
    if (palabras.has(f)) {
      hallazgos.push({
        regla: "Acento neutro",
        detalle: `Aparece "${f}". Es voseo: se escribe en español neutro, tuteando.`,
        gravedad: "error",
      });
    }
  }
  const original = caption.toLowerCase();
  for (const f of IMPERATIVO_VOSEANTE) {
    // Nada de \b: en JavaScript el límite de palabra se calcula sobre [A-Za-z0-9_], así
    // que una vocal con tilde ya cuenta como "no palabra" y `\barrancá\b` NUNCA casa.
    // Con propiedades unicode sí: se exige que no haya letra ni antes ni después.
    if (new RegExp(`(?<!\\p{L})${f}(?!\\p{L})`, "u").test(original)) {
      hallazgos.push({
        regla: "Acento neutro",
        detalle: `Aparece "${f}". Es imperativo voseante: usa la forma con tú.`,
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

  // 5b. El emoji de la mochila está prohibido por su nombre en el bloque TONO, junto al
  // checklist con viñetas: son las dos marcas del post-folleto que hace la competencia.
  if (/\u{1F392}/u.test(caption)) {
    hallazgos.push({
      regla: "Sin el emoji de mochila",
      detalle: "Aparece 🎒. estrategia.ts lo prohíbe por su nombre, junto al checklist con viñetas.",
      gravedad: "error",
    });
  }

  // 5c. El emoji permitido va SOLO en el cierre. Uno a mitad del texto incumple igual,
  // aunque sea el único.
  if (n === 1 && caption.length > COLA_DEL_TEXTO) {
    const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    const pos = caption.search(re);
    if (pos >= 0 && pos < caption.length - COLA_DEL_TEXTO) {
      hallazgos.push({
        regla: "El emoji va al cierre",
        detalle: "El emoji está a mitad del texto. La voz lo permite solo al final.",
        gravedad: "aviso",
      });
    }
  }

  // 5d. Describir la imagen.
  for (const f of DESCRIBE_LA_IMAGEN) {
    if (plano.includes(f)) {
      hallazgos.push({
        regla: "No describas la foto",
        detalle: `Aparece "${f}". El caption tiene que valer sin la imagen: si la narra, se queda sin nada que decir cuando la foto cambia.`,
        gravedad: "error",
      });
      break;
    }
  }

  // 5e. La prueba social solo admite "+200": cualquier otra cifra es inventada.
  const cifras = caption.match(/\+\s?(\d{2,5})/g) ?? [];
  for (const c of cifras) {
    const num = c.replace(/\D/g, "");
    if (num !== "200") {
      hallazgos.push({
        regla: "Solo la cifra +200",
        detalle: `Aparece "${c.trim()}". estrategia.ts dice: no inventes cifras distintas a "+200".`,
        gravedad: "error",
      });
      break;
    }
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
