import "server-only";

import { z } from "zod";
import { aJsonSchema, type Encargo } from "./encargo";
import { SYSTEM_PROMPT, PILARES, RUTAS, TONO, MARCA } from "./estrategia";
import {
  SlidePropuesto,
  completarCarrusel,
  completarUnico,
  completarSegunRango,
  catalogoDeSlides,
  REGLA_DE_LARGO,
} from "./propuesta";
import { esFormatoId, FORMATO_POR_DEFECTO, type FormatoId } from "./formatos";
import { TIPOS_PEDIDO, MAX_POSTS, MAX_LARGO_PEDIDO, type TipoPedidoId } from "./pedidoOpciones";

/**
 * "PÍDELO TÚ" — el camino contrario al motor de sugerencias.
 *
 * `ideas.ts` propone DESDE LOS DATOS: mira las métricas, las cotizaciones y el catálogo, y
 * solo dice lo que esos números sostienen. Es honesto y es cerrado. Este archivo hace lo
 * contrario: parte de una frase escrita a mano —"un carrusel que hable del Año Jacobeo",
 * "guía para evitar ampollas"— y devuelve el post entero redactado.
 *
 * LA DIFERENCIA QUE IMPORTA, Y QUE DEFINE ESTE PROMPT: en las sugerencias, cada afirmación
 * sale de una fila de la base de datos. Aquí el tema puede caer completamente fuera de la
 * plataforma, así que Claude va a escribir con lo que sabe. Eso está bien para "qué es el
 * Año Jacobeo" y es INACEPTABLE para "el Francés desde Sarria cuesta desde 480€": los
 * precios, los km y los días son datos comerciales reales que se publican en Instagram y
 * por los que la gente escribe. De ahí la regla dura del prompt (ver REGLA DE DATOS abajo)
 * y el aviso fijo que la tarjeta muestra siempre.
 */

/** El aviso que acompaña SIEMPRE a un post pedido a mano. */
export const NOTA_PEDIDO =
  "Esto salió de tu pedido, no de los datos de la plataforma: revisa fechas y cifras antes de publicar.";

/**
 * Tolerante a propósito, igual que `RespuestaIdeas`: un `.min()` estricto haría fallar la
 * respuesta ENTERA y dejaría a quien pidió sin nada. Es mejor entregar 2 posts de los 3
 * pedidos que ninguno.
 */
export const RespuestaPedido = z.object({
  posts: z
    .array(
      z.object({
        titulo: z.string(),
        pilar: z.string(),
        formato: z.string(),
        angulo: z.string(),
        /** Por qué este enfoque para lo que se pidió. Va a `contenido_ideas.razon`. */
        enfoque: z.string(),
        ruta_nombre: z.string().nullable(),
        slides: z.array(SlidePropuesto).min(1).max(8),
      }),
    )
    .min(1)
    .max(MAX_POSTS),
});

export type OpcionesPedido = {
  texto: string;
  /** "auto" = que lo diga el pedido. */
  cantidad: number | null;
  tipo: TipoPedidoId;
};

/** Qué se le exige sobre cuántos posts y de qué forma. */
function instruccionDeForma({ cantidad, tipo }: OpcionesPedido): string {
  const t = TIPOS_PEDIDO[tipo];

  const cuantos =
    cantidad != null
      ? `Devuelve EXACTAMENTE ${cantidad} post${cantidad > 1 ? "s" : ""}, aunque el pedido diga otra cosa.`
      : `Cuántos posts: lo dice el pedido ("hazme 3 posts…" son 3). Si no lo dice, devuelve 1. Nunca más de ${MAX_POSTS}.`;

  const forma =
    t.slides != null
      ? `Cada post lleva ${
          t.slides[0] === t.slides[1]
            ? `EXACTAMENTE ${t.slides[0]} slide${t.slides[0] > 1 ? "s" : ""}`
            : `entre ${t.slides[0]} y ${t.slides[1]} slides`
        }, en formato ${t.formatos!.join(" o ")}. Es "${t.etiqueta}": ${t.ayuda}`
      : `Qué forma tiene: lo dice el pedido. "Una sola imagen" o "un post" = UN solo slide.
"Carrusel" = entre 4 y 6 slides (portada + cuerpo + cierre-cta). "Historia" = formato 9x16.
Si el pedido no dice nada, haz un carrusel 4x5 de 4 a 6 slides.`;

  return `${cuantos}\n${forma}`;
}

export function construirEncargoPedido(opciones: OpcionesPedido): Encargo {
  const texto = opciones.texto.trim().slice(0, MAX_LARGO_PEDIDO);

  const user = `Te están pidiendo contenido para el Instagram de ${MARCA.nombre}. Esto es lo que
pidieron, escrito por la persona que lleva la cuenta:

«${texto}»

ESO DE ARRIBA MANDA. El tema, el enfoque y el tono de lo que pidieron van por delante de
cualquier preferencia tuya: no lo reinterpretes ni lo cambies por algo que te parezca que
rinde más. Si el pedido es sobre un tema que no está en los datos de abajo (una fecha del
Camino, un consejo de salud, una explicación histórica), escríbelo igual: para eso te lo
piden.

CUÁNTOS Y DE QUÉ FORMA:
${instruccionDeForma(opciones)}

REGLA DE DATOS — la única línea que no puedes cruzar:
Los km, los días, los precios "desde X€" y lo que incluye cada ruta salen SOLO de la lista
de rutas de abajo. No inventes ni ajustes ninguno de esos números, ni siquiera "para que
quede redondo". Para todo lo demás escribe con lo que sabes, pero si no estás seguro de una
cifra, una fecha o una estadística, di lo general en vez de un número falso: "las mejores
fechas se agotan con meses de antelación" es correcto; "el 73% reserva antes de marzo" es
inventado y no se puede publicar.

CADA POST TIENE QUE VENIR REDACTADO ENTERO, listo para publicar sin reescribir nada.
Reglas estrictas de los slides:
- Usa SOLO estos ids de plantilla y SOLO estos campos (nada inventado):
${catalogoDeSlides()}
- Cada slide es { "plantilla": "<id de la lista de arriba>", "valores": { "<campo>": "<texto>" } }.
  Solo incluyas los campos que esa plantilla declara, y respeta su largo máximo.
- En un carrusel: el primer slide es de rol "portada", el último es "cierre-cta", y los del
  medio son de rol "cuerpo". **Cada slide del medio dice algo distinto y concreto** —un
  consejo, un dato, una objeción, una comparación—. Nada de repetir la portada con otras
  palabras.
- En un post de una sola imagen NO uses "cierre-cta": esa plantilla sola no comunica nada.
  Elige la plantilla de cuerpo o portada que mejor cuente la idea de un vistazo.
- Rellena TODOS los campos con texto de verdad, en la voz de la marca. Nada de textos de
  ejemplo ni marcadores tipo "[titular aquí]".

${REGLA_DE_LARGO}

REGLAS DE TONO QUE DEBES CUMPLIR:
${TONO}

PILARES DISPONIBLES (devuelve el id del que mejor encaje con lo que pidieron):
${PILARES.map((p) => `- ${p.id}: ${p.objetivo.slice(0, 140)}`).join("\n")}

RUTAS REALES CON SUS DATOS (la única fuente de km, días y precios):
${RUTAS.map((r) => `- ${r.nombre}: ${r.desde ? `desde ${r.desde}€ — ` : "precio a consultar — "}${r.detalle}`).join("\n")}

FORMATOS POSIBLES: 4x5 (carrusel de feed, el que más rinde), 1x1 (cuadrado),
1.91x1 (apaisado), 9x16 (historia), reel (portada de reel).

Por cada post devuelve además:
- "titulo": cómo se va a llamar la pieza en la bandeja, corto y reconocible.
- "angulo": en una línea, qué hace este post.
- "enfoque": por qué este enfoque para lo que pidieron. Es lo que se lee al decidir si
  armarlo o descartarlo, así que di algo útil, no repitas el título.
- "ruta_nombre": el nombre exacto de la ruta si el post habla de una; null si no.`;

  return { system: SYSTEM_PROMPT, user, schema: aJsonSchema(RespuestaPedido) };
}

export type PostPedido = {
  titulo: string;
  pilar: string;
  formato: FormatoId;
  angulo: string;
  enfoque: string;
  ruta_nombre: string | null;
  slides: { plantilla: string; valores: Record<string, string> }[];
};

/** El formato que devolvió Claude, obligado a caber en lo que se pidió. */
function formatoValido(crudo: string, tipo: TipoPedidoId): FormatoId {
  // Anotado a mano: con `as const satisfies`, el tipo de `.formatos` es la UNIÓN de las
  // tuplas literales de cada tipo, y `.includes` sobre esa unión pide un `never`.
  const permitidos: readonly FormatoId[] | null = TIPOS_PEDIDO[tipo].formatos;
  const limpio = esFormatoId(crudo) ? crudo : FORMATO_POR_DEFECTO;
  if (!permitidos) return limpio;
  return permitidos.includes(limpio) ? limpio : permitidos[0];
}

/**
 * Valida lo que devolvió el worker y garantiza que cada post se pueda dibujar.
 *
 * Cuando el tipo es "auto" NO se impone un número de slides: se respeta lo que devolvió
 * Claude, que es quien leyó el pedido. Un solo slide se toma como "una sola imagen" y todo
 * lo demás como carrusel — que es justo lo que significa "como diga el pedido".
 */
export function interpretarPedido(crudo: unknown, tipo: TipoPedidoId) {
  const r = RespuestaPedido.safeParse(crudo);
  if (!r.success) {
    return { error: "Claude respondió con una forma que no encaja. Vuelve a intentarlo." };
  }

  const rango = TIPOS_PEDIDO[tipo].slides;

  const posts: PostPedido[] = r.data.posts.map((p) => {
    const slides = rango
      ? completarSegunRango(p.slides, rango[0], rango[1])
      : p.slides.length <= 1
        ? completarUnico(p.slides)
        : completarCarrusel(p.slides);

    return {
      titulo: p.titulo.trim() || "Post sin título",
      pilar: p.pilar,
      formato: formatoValido(p.formato, tipo),
      angulo: p.angulo,
      enfoque: p.enfoque,
      ruta_nombre: p.ruta_nombre,
      slides,
    };
  });

  return { ok: true as const, posts };
}
