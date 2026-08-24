import "server-only";

import { createPublicSchemaClient } from "@/lib/supabase/server";

/**
 * De dónde saca fotos el Estudio de Contenido.
 *
 * ⚠️ REGLA QUE NO SE NEGOCIA: este módulo **lee** de `public.fotos` (el banco del bot) y
 * **nunca escribe** ahí. La Edge Function `publicar` elige de esa tabla por `status`, sin
 * mirar en qué bucket vive el archivo: insertar una fila bastaría para que el bot
 * publicara esa foto sola a las 7pm en la cuenta real. Las fotos que sube el usuario van
 * a `public.contenido_fotos` y al bucket `contenido-fotos`.
 */

export type FotoDelBanco = {
  id: number;
  url: string;
  ruta_tag: string | null;
  usada: boolean;
};

export type FotoSubida = {
  id: number;
  url: string;
  nombre: string | null;
};

/**
 * El banco de fotos del bot. Se traen también las usadas: que el bot ya haya publicado
 * una foto suelta no impide usarla dentro de un carrusel, y son 177 fotos buenas.
 */
export async function listarBanco(limite = 200): Promise<FotoDelBanco[]> {
  const supabase = await createPublicSchemaClient();
  const { data } = await supabase
    .from("fotos")
    .select("id,public_url,ruta_tag,status")
    .order("status", { ascending: true })
    .order("id", { ascending: false })
    .limit(limite);

  return (data ?? []).map((f) => ({
    id: f.id,
    url: f.public_url,
    ruta_tag: f.ruta_tag,
    usada: f.status === "usada",
  }));
}

/** Las fotos subidas desde el editor. */
export async function listarSubidas(limite = 200): Promise<FotoSubida[]> {
  const supabase = await createPublicSchemaClient();
  const { data } = await supabase
    .from("contenido_fotos")
    .select("id,public_url,nombre")
    .order("id", { ascending: false })
    .limit(limite);

  return (data ?? []).map((f) => ({ id: f.id, url: f.public_url, nombre: f.nombre }));
}
