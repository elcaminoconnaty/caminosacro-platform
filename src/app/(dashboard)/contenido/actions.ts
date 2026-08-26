"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { FORMATO_POR_DEFECTO, esFormatoId } from "@/lib/contenido/formatos";
import { valoresPorDefecto, plantilla } from "@/lib/contenido/plantillas/registry";
import type { Slide } from "@/lib/contenido/tipos";
import { ARRANQUES, type ArranqueId } from "@/lib/contenido/arranques";

function slidesDeArranque(id: ArranqueId): Slide[] {
  const receta = ARRANQUES[id] ?? ARRANQUES.blanco;
  // Si una plantilla de la receta ya no existe (se renombró), se salta en vez de crear un
  // slide que el editor no sabría dibujar.
  return receta.plantillas
    .filter((pl) => plantilla(pl) !== null)
    .map((pl) => ({ plantilla: pl, valores: valoresPorDefecto(pl), foto: null }));
}

export async function crearPieza(formData: FormData) {
  const formatoCrudo = String(formData.get("formato") ?? "");
  const formato = esFormatoId(formatoCrudo) ? formatoCrudo : FORMATO_POR_DEFECTO;
  const titulo = String(formData.get("titulo") ?? "").trim() || "Pieza sin título";
  const arranqueCrudo = String(formData.get("arranque") ?? "ruta");
  const arranque = (arranqueCrudo in ARRANQUES ? arranqueCrudo : "ruta") as ArranqueId;

  const supabase = await createPublicSchemaClient();
  const { data, error } = await supabase
    .from("contenido_piezas")
    .insert({ titulo, formato, slides: slidesDeArranque(arranque) })
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

/**
 * "Borrar" desde la bandeja archiva, no hace un DELETE de verdad.
 *
 * Antes era un `.delete()` sin ningún `confirm()` delante, disparado por un botón que
 * solo aparece al pasar el mouse por la tarjeta (`opacity-0 group-hover:opacity-100` en
 * `PiezasGrid`): un clic de más al mover el mouse por la bandeja bastaba para perder una
 * pieza para siempre, sin forma de deshacerlo. La bandeja ya filtra `estado != archivado`
 * (ver `page.tsx`), así que archivar produce el mismo efecto visible —la pieza desaparece
 * de la lista— sin el riesgo de borrar algo por accidente. Sigue viviendo en la base por
 * si hace falta recuperarla a mano.
 */
export async function borrarPieza(id: string) {
  const supabase = await createPublicSchemaClient();
  const { error } = await supabase.from("contenido_piezas").update({ estado: "archivado" }).eq("id", id);
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
