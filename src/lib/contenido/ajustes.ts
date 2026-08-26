import { z } from "zod";
import type { Formato, FormatoId } from "./formatos";
import { MEDIDAS, OVERLAY_FOTO } from "./marca";

/**
 * Los ajustes que Nico puede tocar en cada slide.
 *
 * POR QUÉ ESTO Y NO UN LIENZO LIBRE. Nico pidió "poder diseñar": agrandar la letra, mover
 * la foto, bajar la franja verde, poner transparencias. Un lienzo libre de verdad
 * —arrastrar con el ratón, tiradores, capas— es mucho más trabajo y, sobre todo, empuja en
 * contra del objetivo: sería volverse un Canva pequeño, y Canva es justo lo que se quería
 * dejar de usar. Cada post volvería a costar decisiones.
 *
 * Son cuatro perillas acotadas que cubren lo que pidió de verdad, se mueven en segundos, y
 * dejan la pieza imposible de romper: no se puede sacar el texto de la zona segura ni
 * salirse de la marca.
 */
export const AjustesSlideSchema = z.object({
  /** Multiplica el tamaño de TODO el texto del slide. */
  escalaTexto: z.number().min(0.75).max(1.5).default(1),
  /**
   * Hasta dónde sube el degradado verde, como fracción del alto del lienzo. `null` = el
   * valor por defecto del formato. 0 = casi nada de verde, se ve la foto entera.
   * El tope subió de 0.5 a 0.75 al pasar de franja sólida a degradado: ahora que se funde
   * con la foto, cubrir más no ensucia la imagen.
   */
  altoBloque: z.number().min(0).max(0.75).nullable().default(null),
  /** Qué parte de la foto se ve cuando no cabe entera. */
  encuadreFoto: z.enum(["arriba", "centro", "abajo"]).default("centro"),
  /** Acercar la foto, de 1 (entera) a 1.6. */
  zoomFoto: z.number().min(1).max(1.6).default(1),
  /**
   * Cuánto tapa el velo verde a la foto, de 0 (nada) a 0.85. `null` = el degradado de
   * marca de siempre, que oscurece hacia abajo.
   */
  velo: z.number().min(0).max(0.85).nullable().default(null),
});
export type AjustesSlide = z.infer<typeof AjustesSlideSchema>;

export const AJUSTES_POR_DEFECTO: AjustesSlide = AjustesSlideSchema.parse({});

/**
 * Cuánto ocupa la franja verde en cada formato, por defecto.
 *
 * ESTO ARREGLA LO DE LAS HISTORIAS. Un tercio del alto está bien en 4:5, pero en 9:16 son
 * 640 píxeles de verde que, sumados a la zona segura de abajo, se comían casi toda la
 * imagen. Nico: "cuando lo hago en historias es muy limitado el espacio y por ejemplo se
 * pone la franja verde en prácticamente toda la imagen".
 */
const ALTO_BLOQUE_POR_FORMATO: Record<FormatoId, number> = {
  "4x5": MEDIDAS.fraccionBloqueVerde, // 1/3 — la proporción de la portada del PDF
  "1x1": 0.36,
  "1.91x1": 0, // no hay alto para una franja: se resuelve con el degradado
  "9x16": 0.24,
  reel: 0.22,
};

export type AjustesResueltos = {
  /** Tamaño de letra ya escalado. Las plantillas usan esto para todo el texto. */
  ut: (n: number) => number;
  /** Alto en píxeles de la franja verde. 0 = no dibujarla. */
  altoBloque: number;
  /** Para el `objectPosition` de la foto. */
  posicionFoto: string;
  /**
   * Para el `transform` de la foto. `undefined` cuando no hay zoom, y entonces la
   * propiedad debe OMITIRSE con spread condicional: Satori revienta tanto con
   * `transform: "none"` como con `transform: undefined`. No basta con pasarlo vacío.
   */
  zoomFoto: string | undefined;
  /** El velo sobre la foto: degradado de marca o un verde plano regulable. */
  overlay: string;
};

/**
 * Convierte los ajustes guardados en los valores concretos que usa una plantilla.
 *
 * Vive aparte de las plantillas a propósito: así las ocho aplican los ajustes igual, y
 * cambiar cómo se interpreta una perilla se hace en un solo sitio.
 */
export function resolverAjustes(f: Formato, ajustes?: Partial<AjustesSlide> | null): AjustesResueltos {
  const a = { ...AJUSTES_POR_DEFECTO, ...(ajustes ?? {}) };

  const fraccion = a.altoBloque ?? ALTO_BLOQUE_POR_FORMATO[f.id] ?? MEDIDAS.fraccionBloqueVerde;

  return {
    // Se redondea al final para que no se acumulen medios píxeles entre escalas.
    ut: (n: number) => Math.round((n * f.w * a.escalaTexto) / MEDIDAS.anchoBase),
    altoBloque: Math.round(f.h * fraccion),
    posicionFoto: a.encuadreFoto === "arriba" ? "50% 0%" : a.encuadreFoto === "abajo" ? "50% 100%" : "50% 50%",
    zoomFoto: a.zoomFoto > 1 ? `scale(${a.zoomFoto})` : undefined,
    overlay:
      a.velo == null
        ? OVERLAY_FOTO
        : `linear-gradient(180deg, rgba(26,58,42,${(a.velo * 0.35).toFixed(2)}) 0%, rgba(26,58,42,${a.velo.toFixed(2)}) 100%)`,
  };
}

/** Los controles que pinta el editor. Cada uno con su rango y su explicación en cristiano. */
export const CONTROLES_AJUSTE = [
  {
    id: "escalaTexto" as const,
    etiqueta: "Tamaño del texto",
    min: 0.75,
    max: 1.5,
    paso: 0.05,
    formato: (v: number) => `${Math.round(v * 100)}%`,
  },
  {
    id: "altoBloque" as const,
    etiqueta: "Hasta dónde sube el verde",
    min: 0,
    max: 0.75,
    paso: 0.01,
    formato: (v: number) => (v === 0 ? "casi nada" : `${Math.round(v * 100)}% del alto`),
    soloConFranja: true,
  },
  {
    id: "zoomFoto" as const,
    etiqueta: "Acercar la foto",
    min: 1,
    max: 1.6,
    paso: 0.05,
    formato: (v: number) => `${Math.round(v * 100)}%`,
    soloConFoto: true,
  },
  {
    id: "velo" as const,
    etiqueta: "Cuánto se tapa la foto",
    min: 0,
    max: 0.85,
    paso: 0.05,
    formato: (v: number) => (v === 0 ? "nada" : `${Math.round(v * 100)}%`),
    soloConFoto: true,
  },
];
