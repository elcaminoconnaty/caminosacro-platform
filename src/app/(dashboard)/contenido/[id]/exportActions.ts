"use server";

import { revalidatePath } from "next/cache";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mensajeError } from "@/lib/errors";
import { rutaPiezaJpg, sinBucket } from "@/lib/storage/paths";

const BUCKET = "contenido-piezas";

/**
 * Archiva un slide ya exportado y devuelve su ruta.
 *
 * ⚠️ POR QUÉ SUBE EL SERVIDOR Y NO EL NAVEGADOR. Antes el navegador subía directo a Storage
 * con la sesión del usuario. Auditando salió que **el bucket `contenido-piezas` estaba
 * vacío** pese a que ya se habían exportado piezas: la subida fallaba y el fallo se perdía
 * en un aviso lateral, porque la descarga sí funcionaba y todo parecía bien. Consecuencias
 * calladas: las miniaturas de la bandeja nunca usaban el JPG (siempre volvían a renderizar)
 * y la fase 2 se habría encontrado sin archivos que publicar.
 *
 * Subir desde el servidor con la service_role quita de en medio las políticas de Storage y
 * la sesión del navegador. Se puede hacer aquí y no con las fotos porque un JPG exportado
 * ronda los 250 KB: cabe de sobra en el `bodySizeLimit` de 15 MB de las Server Actions, que
 * es justo lo que NO permitía subir así una carpeta de fotos de cámara.
 */
export async function archivarSlide(piezaId: string, indice: number, jpegBase64: string) {
  try {
    const bytes = Buffer.from(jpegBase64, "base64");
    if (bytes.byteLength === 0) return { error: "El slide llegó vacío al archivarse." };

    const rutaConBucket = rutaPiezaJpg(piezaId, indice);
    const admin = createAdminClient("public");
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(sinBucket(rutaConBucket), bytes, { contentType: "image/jpeg", upsert: true });

    if (error) return { error: `No se pudo archivar el slide ${indice + 1}: ${error.message}` };
    return { ok: true as const, ruta: rutaConBucket };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo archivar el slide." };
  }
}

/**
 * Deja constancia de la exportación en la pieza. `export_paths` guarda las rutas CON el
 * bucket adelante, que es la convención del repo (ver src/lib/storage/paths.ts).
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
