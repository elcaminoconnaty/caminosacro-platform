import { z } from "zod";

/**
 * De dónde vino la persona que cotiza: el primer toque que el tema de caminosacro.com
 * guarda en la cookie `cs_origen` y manda junto con la cotización o el lead.
 *
 * Es el eslabón que faltaba entre la pauta y la venta. Meta sabe qué anuncio produjo un
 * Lead; el CRM sabe quién firmó; con estas columnas las dos cosas se pueden unir por
 * `utm_content` (el identificador del anuncio) y decir cuánto costó cada venta.
 *
 * Todo es opcional y se guarda tal cual llega, recortado. Un lead sin origen es un lead
 * igual de válido: llegó orgánico, o con las cookies bloqueadas.
 */
export const origenSchema = z.object({
  utm_source: z.string().trim().max(120).optional(),
  utm_medium: z.string().trim().max(120).optional(),
  utm_campaign: z.string().trim().max(160).optional(),
  utm_content: z.string().trim().max(160).optional(),
  utm_term: z.string().trim().max(160).optional(),
  fbclid: z.string().trim().max(255).optional(),
  gclid: z.string().trim().max(255).optional(),
  landing_page: z.string().trim().max(500).optional(),
  referrer: z.string().trim().max(500).optional(),
});

export type Origen = z.infer<typeof origenSchema>;

const CAMPOS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "gclid", "landing_page", "referrer",
] as const;

/** Las columnas de origen listas para el `insert`: vacío → null, nunca cadena vacía. */
export function columnasOrigen(datos: Origen & { fbp?: string | null; fbc?: string | null }) {
  const out: Record<string, string | null> = {};
  for (const k of CAMPOS) {
    const v = datos[k];
    out[k] = v && v.trim() ? v.trim() : null;
  }
  out.fbp = datos.fbp?.trim() || null;
  out.fbc = datos.fbc?.trim() || null;
  return out;
}
