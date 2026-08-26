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
 *
 * También sube el `estado` de "borrador" a "listo", en una segunda escritura aparte que
 * no puede impedir que quede constancia de la exportación. Antes `cambiarEstado` (en
 * `actions.ts`) existía pero nada la llamaba desde ninguna pantalla: la bandeja filtra por
 * "borrador / listo / publicado" (`PiezasGrid.tsx`) y los dos últimos filtros nunca
 * mostraban una sola pieza, porque no había manera de que una saliera de "borrador".
 * Exportar es la señal natural de "esto ya está listo para publicarse" — no hace falta un
 * botón aparte que sea una decisión más que tomar, que es justo lo que este módulo quiere
 * evitar. Solo sube de nivel: si ya estaba en "listo", "publicado" o "archivado", el
 * `.eq("estado","borrador")` hace que este segundo update no toque nada.
 */
export async function registrarExport(id: string, rutas: string[]) {
  const supabase = await createPublicSchemaClient();
  const { error } = await supabase
    .from("contenido_piezas")
    .update({ export_paths: rutas, exportado_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: mensajeError(error) };

  // Best-effort: si esto falla no se avisa ni se revierte el registro de arriba — la
  // exportación ya quedó a salvo, que es lo que de verdad le importa al usuario en este
  // momento. Subir el estado es una comodidad, no la operación crítica.
  await supabase.from("contenido_piezas").update({ estado: "listo" }).eq("id", id).eq("estado", "borrador");

  revalidatePath("/contenido");
  revalidatePath(`/contenido/${id}`);
  return { ok: true as const };
}
