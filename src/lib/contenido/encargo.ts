import { z } from "zod";

/**
 * Un "encargo" es todo lo que el worker necesita para hablar con Claude, y nada más.
 *
 * La separación es deliberada: la app arma el prompt (sabe de rutas, de voz, de plantillas
 * y de la base de datos) y el worker solo lo despacha. Así toda la lógica de negocio se
 * despliega con la plataforma y el programita del computador puede quedarse quieto meses
 * sin actualizarse.
 */
export type Encargo = {
  system: string;
  user: string;
  /** JSON Schema de la respuesta esperada. */
  schema: Record<string, unknown>;
};

/**
 * Convierte un esquema zod a JSON Schema para el SDK de agentes.
 *
 * Hay que QUITARLE el `$schema`: zod v4 escribe la referencia al draft 2020-12 y el CLI la
 * rechaza con "no schema with key or ref…". Cuesta media hora encontrarlo si no está dicho.
 */
export function aJsonSchema(esquema: z.ZodType): Record<string, unknown> {
  const { $schema: _descartado, ...resto } = z.toJSONSchema(esquema) as Record<string, unknown>;
  void _descartado;
  return resto;
}
