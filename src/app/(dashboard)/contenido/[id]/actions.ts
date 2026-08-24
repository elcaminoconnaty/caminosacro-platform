"use server";

import { revalidatePath } from "next/cache";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { SlidesSchema, type Slide } from "@/lib/contenido/tipos";
import { esFormatoId, type FormatoId } from "@/lib/contenido/formatos";

/**
 * Guarda los slides de una pieza. La llama el autoguardado del editor cada vez que se
 * deja de escribir, así que tiene que ser barata y no lanzar nunca: un error acá se
 * muestra como aviso en la barra del editor, no tumba la pantalla.
 *
 * Valida con zod antes de escribir. El jsonb no lo valida Postgres, y un slide con forma
 * rara guardado hoy es un preview roto mañana.
 */
export async function guardarSlides(id: string, slides: Slide[]) {
  const parseo = SlidesSchema.safeParse(slides);
  if (!parseo.success) {
    return { error: "Los slides tienen una forma que el editor no reconoce. No se guardó nada." };
  }

  const supabase = await createPublicSchemaClient();
  const { error } = await supabase
    .from("contenido_piezas")
    .update({ slides: parseo.data })
    .eq("id", id);

  if (error) return { error: mensajeError(error) };
  return { ok: true as const };
}

/**
 * Cambia el formato de una pieza. No toca los slides: las plantillas se recomponen solas
 * porque escriben todas sus medidas con u() sobre el ancho real del lienzo.
 */
export async function cambiarFormato(id: string, formato: string) {
  if (!esFormatoId(formato)) return { error: "Ese formato no existe." };

  const supabase = await createPublicSchemaClient();
  const { error } = await supabase
    .from("contenido_piezas")
    .update({ formato: formato as FormatoId })
    .eq("id", id);

  if (error) return { error: mensajeError(error) };
  revalidatePath(`/contenido/${id}`);
  return { ok: true as const };
}

export async function guardarCopy(id: string, caption: string, hashtags: string) {
  const supabase = await createPublicSchemaClient();
  const { error } = await supabase.from("contenido_piezas").update({ caption, hashtags }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  return { ok: true as const };
}

export async function cambiarEstado(id: string, estado: string) {
  if (!["borrador", "listo", "publicado", "archivado"].includes(estado)) {
    return { error: "Ese estado no existe." };
  }
  const supabase = await createPublicSchemaClient();
  const { error } = await supabase.from("contenido_piezas").update({ estado }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  revalidatePath(`/contenido/${id}`);
  return { ok: true as const };
}
