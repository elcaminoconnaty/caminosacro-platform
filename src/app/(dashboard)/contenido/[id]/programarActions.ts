"use server";

import { revalidatePath } from "next/cache";
import { createPublicSchemaClient, createCommercialClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mensajeError } from "@/lib/errors";
import { aInstante, esCadencia, fechaLocal, siguienteDiaLibre } from "@/lib/contenido/fechas";
import { diasOcupados, leerProgramacion, listarOcupados } from "@/lib/contenido/programacion";
import { motivoNoPublicable, publicarPiezaTomada, type PiezaTomada } from "@/lib/contenido/publicar";

const CAMPOS = "id,titulo,formato,slides,caption,hashtags,pilar,export_paths,export_hash,estado,publicacion_intentos";

function revalidar(id: string) {
  revalidatePath("/contenido");
  revalidatePath("/contenido/calendario");
  revalidatePath(`/contenido/${id}`);
}

/**
 * Lo que el diálogo de "Aprobar y programar" propone: el siguiente día libre según la
 * cadencia, la hora por defecto, y los días ya ocupados para avisar si se elige uno.
 */
export async function propuestaProgramacion() {
  try {
    const [pref, ocupados] = await Promise.all([leerProgramacion(), listarOcupados()]);
    const dias = diasOcupados(ocupados);
    return {
      ok: true as const,
      fecha: siguienteDiaLibre(dias, pref.cadencia),
      hora: pref.hora,
      cadencia: pref.cadencia,
      ocupados: [...new Set(dias)],
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo calcular la propuesta." };
  }
}

/**
 * Deja la pieza en la cola con fecha y hora de Bogotá. La pieza tiene que estar exportada
 * y sin cambios desde entonces (`export_hash`); el botón del editor exporta justo antes.
 */
export async function programarPieza(id: string, fecha: string, hora: string) {
  const instante = aInstante(fecha, hora);
  if (!instante) return { error: "La fecha o la hora no tienen sentido." };
  // Un minuto de margen: "ahora mismo" desde el diálogo no debe rebotar por segundos.
  if (Date.parse(instante) < Date.now() - 60_000) return { error: "Esa hora ya pasó. Elige una futura o usa «Publicar ahora»." };

  const supabase = await createPublicSchemaClient();
  const { data: p, error } = await supabase.from("contenido_piezas").select(CAMPOS).eq("id", id).maybeSingle();
  if (error) return { error: mensajeError(error) };
  if (!p) return { error: "La pieza no existe." };
  if (p.estado === "publicando") return { error: "Se está publicando en este momento." };
  if (p.estado === "publicado") return { error: "Esta pieza ya se publicó. Duplícala si quieres volver a usarla." };

  const motivo = motivoNoPublicable(p);
  if (motivo) return { error: motivo };

  const { error: errUpd } = await supabase
    .from("contenido_piezas")
    .update({
      estado: "programado", programada_para: instante,
      publicacion_error: null, publicacion_intentos: 0, publicando_desde: null,
    })
    .eq("id", id);
  if (errUpd) return { error: mensajeError(errUpd) };

  revalidar(id);
  return { ok: true as const, instante, fecha: fechaLocal(instante) };
}

/** Saca la pieza de la cola y la deja en "listo". Solo si todavía no se tomó. */
export async function desprogramarPieza(id: string) {
  const supabase = await createPublicSchemaClient();
  const { data, error } = await supabase
    .from("contenido_piezas")
    .update({ estado: "listo", programada_para: null, publicacion_error: null })
    .eq("id", id)
    .eq("estado", "programado")
    .select("id");
  if (error) return { error: mensajeError(error) };
  if (!data?.length) return { error: "La pieza ya no estaba programada (quizá se está publicando)." };
  revalidar(id);
  return { ok: true as const };
}

/**
 * Publica de inmediato, sin esperar al cron. Misma toma atómica que el cron (solo pasa
 * de `programado` a `publicando` si nadie más la tomó) y mismo motor, así que probar
 * este botón es probar el flujo entero. Tarda lo que tarde Instagram (10–60 s).
 */
export async function publicarAhora(id: string) {
  const supabase = await createPublicSchemaClient();
  const { data: p, error } = await supabase.from("contenido_piezas").select(CAMPOS).eq("id", id).maybeSingle();
  if (error) return { error: mensajeError(error) };
  if (!p) return { error: "La pieza no existe." };
  if (p.estado === "publicando") return { error: "Ya se está publicando." };
  if (p.estado === "publicado") return { error: "Esta pieza ya se publicó." };
  const motivo = motivoNoPublicable(p);
  if (motivo) return { error: motivo };

  // Primero a la cola con fecha "ahora", luego la toma atómica: si el cron pasa justo en
  // este instante y la toma él, aquí no se obtiene fila y no se publica dos veces.
  const { error: errCola } = await supabase
    .from("contenido_piezas")
    .update({ estado: "programado", programada_para: new Date().toISOString(), publicacion_error: null, publicacion_intentos: 0 })
    .eq("id", id);
  if (errCola) return { error: mensajeError(errCola) };

  const admin = createAdminClient("public");
  const { data: tomada, error: errToma } = await admin
    .from("contenido_piezas")
    .update({ estado: "publicando", publicando_desde: new Date().toISOString(), publicacion_intentos: 1 })
    .eq("id", id)
    .eq("estado", "programado")
    .select(CAMPOS)
    .maybeSingle();
  if (errToma) return { error: mensajeError(errToma) };
  if (!tomada) {
    revalidar(id);
    return { ok: true as const, aviso: "El cron la tomó justo ahora; en un momento aparece publicada." };
  }

  const r = await publicarPiezaTomada(tomada as PiezaTomada);
  revalidar(id);
  if (!r.ok) return { error: r.error };
  return { ok: true as const, permalink: r.permalink };
}

/** Guarda la hora por defecto y la cadencia del calendario. */
export async function guardarProgramacion(hora: string, cadencia: string) {
  if (!/^\d{2}:\d{2}$/.test(hora) || Number(hora.slice(0, 2)) > 23 || Number(hora.slice(3)) > 59) {
    return { error: "La hora no tiene sentido." };
  }
  if (!esCadencia(cadencia)) return { error: "Esa cadencia no existe." };
  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "contenido_programacion", value: { hora, cadencia } }, { onConflict: "key" });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido/calendario");
  return { ok: true as const };
}
