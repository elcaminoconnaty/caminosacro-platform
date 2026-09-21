import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MensajesGuardados } from "@/lib/mensajes/plantillas";

/**
 * Lo que Configuración haya cambiado de los mensajes, guardado en
 * `comercial.settings.mensajes`.
 *
 * Nunca lanza y nunca devuelve `null`: un fallo leyendo esta clave no puede dejar sin
 * correo a un proveedor ni sin mensaje a un peregrino. Sin fila, el armador usa los
 * textos de fábrica, que son los que estaban en el código de toda la vida.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export const MENSAJES_KEY = "mensajes";

export async function getMensajes(supabase: AnyClient): Promise<MensajesGuardados> {
  try {
    const { data } = await supabase.from("settings").select("value").eq("key", MENSAJES_KEY).maybeSingle();
    const v = data?.value;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return v as MensajesGuardados;
  } catch (e) {
    console.warn("[mensajes] no pude leer settings.mensajes:", e);
    return {};
  }
}
