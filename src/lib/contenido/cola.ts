import "server-only";

import { createPublicSchemaClient } from "@/lib/supabase/server";
import type { Encargo } from "./encargo";

/**
 * La cola del puente, vista desde la plataforma.
 *
 * La plataforma nunca habla con Claude: deja el encargo aquí y pregunta si ya está. El
 * que habla con Claude es el worker que corre en el computador de Nico, usando la
 * suscripción. Ver la cabecera de la migración 0026.
 */

/** Cuántos segundos sin latido damos por "el computador está apagado". */
const LATIDO_VIVO_SEG = 90;

export type EstadoWorker = {
  encendido: boolean;
  visto_at: string | null;
  host: string | null;
  hace_seg: number | null;
};

export async function estadoDelWorker(): Promise<EstadoWorker> {
  const supabase = await createPublicSchemaClient();
  const { data, error } = await supabase
    .from("contenido_worker")
    .select("visto_at,host")
    .eq("id", 1)
    .maybeSingle();

  // DECISIÓN ESCRITA, no descuido: si la consulta falla, esta función NO lanza. La llama
  // sin try/catch `encargarCopy()` en copyActions.ts (una Server Action, que por
  // convención del repo nunca debe hacer throw), así que lanzar aquí rompería esa
  // promesa en un archivo que no está en mi bloque. En vez de eso se deja constancia en
  // los logs del servidor: "el computador parece apagado" y "no se pudo saber si está
  // encendido" son cosas distintas y solo la primera es inofensiva de confundir con la
  // pantalla actual, que las trata igual (dice "esperando a que enciendan el
  // computador" en los dos casos). Vale la pena que Bloque B distinga los dos casos en la
  // interfaz; queda anotado en Hallazgos.
  if (error) console.error(`[contenido] no se pudo leer el latido del worker: ${error.message}`);

  if (!data?.visto_at) return { encendido: false, visto_at: null, host: null, hace_seg: null };

  const hace = Math.round((Date.now() - new Date(data.visto_at).getTime()) / 1000);
  return {
    encendido: hace <= LATIDO_VIVO_SEG,
    visto_at: data.visto_at,
    host: data.host,
    hace_seg: hace,
  };
}

export async function encolar(tipo: "copy" | "ideas" | "pedido", encargo: Encargo, piezaId?: string | null) {
  const supabase = await createPublicSchemaClient();

  // Antes de encolar, devolver a la cola lo que quedó colgado de un worker que se cayó.
  // Es barato y evita que un trabajo huérfano bloquee la percepción de "esto no anda".
  // Best-effort a propósito (si falla, igual se intenta encolar), pero registrado: antes
  // no se miraba ni el resultado ni el error de este rpc.
  const { error: errRescate } = await supabase.rpc("contenido_rescatar_trabajos");
  if (errRescate) console.error(`[contenido] rescate de trabajos colgados falló: ${errRescate.message}`);

  const { data, error } = await supabase
    .from("contenido_trabajos")
    .insert({ tipo, pieza_id: piezaId ?? null, entrada: encargo })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { ok: true as const, trabajoId: data.id as number };
}

export type EstadoTrabajo =
  | { estado: "pendiente" | "tomado"; posicion: number }
  | { estado: "listo"; resultado: unknown }
  | { estado: "error"; error: string }
  | { estado: "desconocido" };

export async function consultarTrabajo(id: number): Promise<EstadoTrabajo> {
  const supabase = await createPublicSchemaClient();
  const { data, error } = await supabase
    .from("contenido_trabajos")
    .select("estado,resultado,error,creado_at")
    .eq("id", id)
    .maybeSingle();

  // "desconocido" hoy significa dos cosas MUY distintas: "ese id no existe" y "la consulta
  // falló". Los dos llamadores (recogerCopy/recogerIdeas en Bloque B) lo convierten en
  // "Ese encargo ya no existe" — que es mentira en el segundo caso, y confunde a quien está
  // esperando su copy. No lo cambio aquí (tocaría el tipo `EstadoTrabajo` y sus dos
  // llamadores, fuera de mi bloque), pero al menos queda en los logs para no ser un fallo
  // completamente mudo.
  if (error) console.error(`[contenido] no se pudo leer el trabajo #${id}: ${error.message}`);

  if (!data) return { estado: "desconocido" };

  if (data.estado === "listo" || data.estado === "consumido") {
    return { estado: "listo", resultado: data.resultado };
  }
  if (data.estado === "error") {
    return { estado: "error", error: data.error ?? "El encargo falló sin decir por qué." };
  }

  // Cuántos hay delante, para poder decirlo en pantalla en vez de un spinner mudo.
  const { count, error: errCuenta } = await supabase
    .from("contenido_trabajos")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente")
    .lt("creado_at", data.creado_at);
  // Si esto falla, "0 por delante" es una mentira optimista concreta (el usuario cree que
  // le toca ya). Se registra; no se tumba la consulta de estado por un dato secundario.
  if (errCuenta) console.error(`[contenido] no se pudo contar la cola delante del #${id}: ${errCuenta.message}`);

  return { estado: data.estado as "pendiente" | "tomado", posicion: count ?? 0 };
}

/**
 * Marca el trabajo como ya aprovechado, para no volver a procesarlo.
 *
 * ⚠️ Si este update falla en silencio (como hacía antes: ni siquiera se miraba el
 * resultado), el trabajo se queda en 'listo' y una segunda llamada a recogerCopy/
 * recogerIdeas para el MISMO trabajoId —dos pestañas, un doble clic, el polling del
 * cliente reintentando— vuelve a insertar el copy o las ideas por segunda vez. No es
 * hipotético: los dos llamadores insertan primero y marcan consumido después, sin
 * comprobar que el trabajo siga en 'listo' justo antes de escribir. Se deja registrado
 * para que aparezca en los logs si pasa; arreglarlo de raíz (un `update ... where estado
 * = 'listo'` que confirme una sola fila afectada) toca la firma de esta función y sus dos
 * llamadores en Bloque B, así que queda anotado en Hallazgos para quien pueda tocar esos
 * archivos.
 */
export async function marcarConsumido(id: number) {
  const supabase = await createPublicSchemaClient();
  const { error } = await supabase.from("contenido_trabajos").update({ estado: "consumido" }).eq("id", id);
  if (error) console.error(`[contenido] no se pudo marcar consumido el trabajo #${id}: ${error.message}`);
}
