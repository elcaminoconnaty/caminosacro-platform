// Formas de datos del Estudio de Contenido, validadas con zod.
//
// El contenido de una pieza vive en una columna `jsonb` (contenido_piezas.slides) y
// no en una tabla de slides. Un carrusel se edita, se guarda y se exporta SIEMPRE
// como una unidad: así el orden es el del array (cero columnas `position` que se
// desincronizan), el autoguardado es un solo UPDATE atómico y duplicar una pieza es
// copiar una columna. Lo que se pierde —una FK por slide a fotos(id)— no lo usa nadie.
//
// Como el jsonb no lo valida Postgres, lo valida zod acá. Si un slide guardado no
// cumple el esquema, el render devuelve una pieza de error legible en vez de tumbar
// el endpoint.

import { z } from "zod";
import { FORMATOS, type FormatoId } from "./formatos";
import { AjustesSlideSchema } from "./ajustes";

// ---------- Definición de una plantilla (el registry) ----------

export const TipoCampo = z.enum([
  "texto", // una línea
  "textarea", // varias líneas
  "numero",
  "select",
  "foto",
  "ruta", // selector de ruta del catálogo: autollena los datos de la pieza
]);
export type TipoCampo = z.infer<typeof TipoCampo>;

export const CampoPlantillaSchema = z.object({
  id: z.string(),
  etiqueta: z.string(),
  tipo: TipoCampo,
  requerido: z.boolean().optional(),
  /** Largo máximo sugerido. El editor avisa al pasarse; no bloquea. */
  maxLargo: z.number().optional(),
  opciones: z.array(z.object({ valor: z.string(), etiqueta: z.string() })).optional(),
  ayuda: z.string().optional(),
  porDefecto: z.string().optional(),
});
export type CampoPlantilla = z.infer<typeof CampoPlantillaSchema>;

const FormatoIdSchema = z.enum(
  Object.keys(FORMATOS) as [FormatoId, ...FormatoId[]],
);

export const DefinicionPlantillaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  descripcion: z.string(),
  /** En qué formatos tiene sentido esta plantilla. El smoke la renderiza en todos ellos. */
  formatos: z.array(FormatoIdSchema).min(1),
  campos: z.array(CampoPlantillaSchema),
  usaFoto: z.boolean(),
  /** Dónde suele ir dentro de un carrusel: portada, cuerpo o cierre. */
  rol: z.enum(["portada", "cuerpo", "cierre"]).default("cuerpo"),
  /**
   * Si la plantilla dibuja el bloque verde inferior cuyo alto se puede regular.
   *
   * ⚠️ Lo DECLARA la plantilla, y no se deduce del `rol`. Antes el editor mostraba la
   * perilla solo cuando `rol === "portada"`, y eso dejó a `ficha-bici` —que sí tiene el
   * bloque— sin poder ajustarlo: en los slides de la flota no se podía cambiar cuánto
   * espacio ocupaba la foto. Un papel dentro del carrusel no dice nada sobre qué dibuja
   * la plantilla; eran dos cosas distintas atadas por conveniencia.
   */
  franjaAjustable: z.boolean().optional(),
});
export type DefinicionPlantilla = z.infer<typeof DefinicionPlantillaSchema>;

// ---------- Contenido de una pieza ----------

export const FotoSlideSchema = z.object({
  url: z.string(),
  /** De dónde salió: el banco del bot, una subida del usuario, o ninguna. */
  origen: z.enum(["banco", "subida"]),
  alt: z.string().optional(),
});
export type FotoSlide = z.infer<typeof FotoSlideSchema>;

export const SlideSchema = z.object({
  plantilla: z.string(),
  valores: z.record(z.string(), z.string()).default({}),
  foto: FotoSlideSchema.nullable().default(null),
  // Las cuatro perillas de diseño. Opcional: los slides guardados antes de que existieran
  // siguen siendo válidos y toman los valores por defecto.
  ajustes: AjustesSlideSchema.optional(),
});
export type Slide = z.infer<typeof SlideSchema>;

export const SlidesSchema = z.array(SlideSchema);

export const EstadoPieza = z.enum(["borrador", "listo", "publicado", "archivado"]);
export type EstadoPieza = z.infer<typeof EstadoPieza>;

/** Espejo de la fila de public.contenido_piezas (la tabla se crea en la Etapa 2). */
export const PiezaSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  formato: FormatoIdSchema,
  slides: SlidesSchema,
  caption: z.string().default(""),
  hashtags: z.string().default(""),
  pilar: z.string().nullable().default(null),
  ruta_id: z.string().nullable().default(null),
  idea_id: z.number().nullable().default(null),
  export_paths: z.array(z.string()).default([]),
  exportado_at: z.string().nullable().default(null),
  estado: EstadoPieza.default("borrador"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type Pieza = z.infer<typeof PiezaSchema>;

/**
 * Lee los slides de una fila cruda sin tumbar nada. Si el jsonb está corrupto o
 * quedó de una versión anterior del esquema, devuelve un array vacío y deja el
 * porqué en `error` para que quien llama decida si avisa o dibuja una pieza vacía.
 */
export function leerSlides(valor: unknown): { slides: Slide[]; error: string | null } {
  const r = SlidesSchema.safeParse(valor ?? []);
  if (r.success) return { slides: r.data, error: null };
  return { slides: [], error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ") };
}
