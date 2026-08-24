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
  const { data } = await supabase
    .from("contenido_worker")
    .select("visto_at,host")
    .eq("id", 1)
    .maybeSingle();

  if (!data?.visto_at) return { encendido: false, visto_at: null, host: null, hace_seg: null };

  const hace = Math.round((Date.now() - new Date(data.visto_at).getTime()) / 1000);
  return {
    encendido: hace <= LATIDO_VIVO_SEG,
    visto_at: data.visto_at,
    host: data.host,
    hace_seg: hace,
  };
}

export async function encolar(tipo: "copy" | "ideas", encargo: Encargo, piezaId?: string | null) {
  const supabase = await createPublicSchemaClient();

  // Antes de encolar, devolver a la cola lo que quedó colgado de un worker que se cayó.
  // Es barato y evita que un trabajo huérfano bloquee la percepción de "esto no anda".
  await supabase.rpc("contenido_rescatar_trabajos");

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
  const { data } = await supabase
    .from("contenido_trabajos")
    .select("estado,resultado,error,creado_at")
    .eq("id", id)
    .maybeSingle();

  if (!data) return { estado: "desconocido" };

  if (data.estado === "listo" || data.estado === "consumido") {
    return { estado: "listo", resultado: data.resultado };
  }
  if (data.estado === "error") {
    return { estado: "error", error: data.error ?? "El encargo falló sin decir por qué." };
  }

  // Cuántos hay delante, para poder decirlo en pantalla en vez de un spinner mudo.
  const { count } = await supabase
    .from("contenido_trabajos")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente")
    .lt("creado_at", data.creado_at);

  return { estado: data.estado as "pendiente" | "tomado", posicion: count ?? 0 };
}

/** Marca el trabajo como ya aprovechado, para no volver a procesarlo. */
export async function marcarConsumido(id: number) {
  const supabase = await createPublicSchemaClient();
  await supabase.from("contenido_trabajos").update({ estado: "consumido" }).eq("id", id);
}
