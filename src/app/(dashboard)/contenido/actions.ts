"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { FORMATO_POR_DEFECTO, esFormatoId } from "@/lib/contenido/formatos";
import { valoresPorDefecto } from "@/lib/contenido/plantillas/registry";
import type { Slide } from "@/lib/contenido/tipos";

/**
 * Una pieza nueva estrena con dos slides —portada y cierre— y no vacía: así el usuario
 * ve de inmediato cómo se ve la marca y solo tiene que cambiar textos, que es justo lo
 * que el módulo promete.
 */
function slidesDeArranque(): Slide[] {
  return [
    { plantilla: "portada-ruta", valores: valoresPorDefecto("portada-ruta"), foto: null },
    { plantilla: "cierre-cta", valores: valoresPorDefecto("cierre-cta"), foto: null },
  ];
}

export async function crearPieza(formData: FormData) {
  const formatoCrudo = String(formData.get("formato") ?? "");
  const formato = esFormatoId(formatoCrudo) ? formatoCrudo : FORMATO_POR_DEFECTO;
  const titulo = String(formData.get("titulo") ?? "").trim() || "Pieza sin título";

  const supabase = await createPublicSchemaClient();
  const { data, error } = await supabase
    .from("contenido_piezas")
    .insert({ titulo, formato, slides: slidesDeArranque() })
    .select("id")
    .single();

  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  redirect(`/contenido/${data.id}`);
}

export async function duplicarPieza(id: string) {
  const supabase = await createPublicSchemaClient();
  const { data: original, error: errLeer } = await supabase
    .from("contenido_piezas")
    .select("titulo,formato,slides,caption,hashtags,pilar,ruta_id")
    .eq("id", id)
    .maybeSingle();

  if (errLeer) return { error: mensajeError(errLeer) };
  if (!original) return { error: "Esa pieza ya no existe." };

  // La copia arranca siempre en borrador y sin rastro de exportación: es una pieza nueva,
  // no una versión de la anterior.
  const { data, error } = await supabase
    .from("contenido_piezas")
    .insert({ ...original, titulo: `${original.titulo} (copia)`, estado: "borrador" })
    .select("id")
    .single();

  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  return { ok: true as const, id: data.id as string };
}

export async function borrarPieza(id: string) {
  const supabase = await createPublicSchemaClient();
  const { error } = await supabase.from("contenido_piezas").delete().eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  return { ok: true as const };
}

export async function renombrarPieza(id: string, titulo: string) {
  const limpio = titulo.trim();
  if (!limpio) return { error: "El título no puede quedar vacío." };

  const supabase = await createPublicSchemaClient();
  const { error } = await supabase.from("contenido_piezas").update({ titulo: limpio }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  revalidatePath(`/contenido/${id}`);
  return { ok: true as const };
}
