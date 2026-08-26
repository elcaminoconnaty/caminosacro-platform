"use server";

import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import {
  buscarFotos,
  listarRutasDeFotos,
  type ConsultaFotos,
  type FotoSubida,
} from "@/lib/contenido/fotos";

/**
 * Registra en la base una foto que el navegador ya subió a Storage.
 *
 * El archivo NO pasa por acá: lo sube el navegador directo a Supabase Storage. El
 * `bodySizeLimit` de las Server Actions es de 15 MB y arrastrar una carpeta de fotos de
 * cámara lo revienta sin decir por qué.
 *
 * ⚠️ Escribe en `contenido_fotos`, jamás en `public.fotos`: ver la cabecera de
 * src/lib/contenido/fotos.ts.
 */
export async function registrarSubida(datos: {
  storage_path: string;
  public_url: string;
  nombre: string;
  bytes: number;
}) {
  const supabase = await createPublicSchemaClient();
  const { data, error } = await supabase
    .from("contenido_fotos")
    .upsert(
      {
        storage_path: datos.storage_path,
        public_url: datos.public_url,
        nombre: datos.nombre,
        origen: "subida",
        bytes: datos.bytes,
      },
      { onConflict: "storage_path" },
    )
    .select("id,public_url,nombre")
    .single();

  if (error) return { error: mensajeError(error) };
  const foto: FotoSubida = { id: data.id, url: data.public_url, nombre: data.nombre };
  return { ok: true as const, foto };
}


/**
 * Una tanda del buscador de fotos. El navegador la llama al abrir el selector, al
 * escribir y al llegar al final de la rejilla; nunca se traen las 177 de golpe.
 */
export async function buscarFotosAccion(consulta: ConsultaFotos) {
  try {
    const pagina = await buscarFotos(consulta);
    return { ok: true as const, ...pagina };
  } catch (e) {
    // Acá llega un `unknown` de un catch, no un error de Supabase: mensajeError espera
    // lo segundo, así que se traduce a mano.
    return { error: e instanceof Error ? e.message : "No se pudieron buscar las fotos." };
  }
}

/** Los chips de ruta: salen de los `ruta_tag` reales de cada fuente, sin lista fija. */
export async function rutasDeFotos(fuente: "banco" | "subida") {
  try {
    return { ok: true as const, rutas: await listarRutasDeFotos(fuente) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron leer las rutas." };
  }
}
