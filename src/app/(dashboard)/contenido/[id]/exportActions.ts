"use server";

import { revalidatePath } from "next/cache";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";

/**
 * Deja constancia de una exportación. Los archivos NO pasan por acá: los sube el
 * navegador directo a Storage (ver Exportar.tsx), y esta acción solo escribe en la pieza
 * dónde quedaron.
 *
 * `export_paths` guarda las rutas CON el bucket adelante, que es la convención del repo
 * (ver src/lib/storage/paths.ts).
 */
export async function registrarExport(id: string, rutas: string[]) {
  const supabase = await createPublicSchemaClient();
  const { error } = await supabase
    .from("contenido_piezas")
    .update({ export_paths: rutas, exportado_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  revalidatePath(`/contenido/${id}`);
  return { ok: true as const };
}
