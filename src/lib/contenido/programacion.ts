import "server-only";

import { createCommercialClient, createPublicSchemaClient } from "@/lib/supabase/server";
import { CADENCIA, esCadencia, fechaLocal, type CadenciaId } from "@/lib/contenido/fechas";

/**
 * Lecturas compartidas por las acciones de programar y por el calendario: la preferencia
 * (hora y cadencia) y los días que ya tienen algo. Vive aparte de las acciones porque un
 * archivo "use server" solo puede exportar funciones async, y el calendario (Server
 * Component) las necesita sin pasar por una acción.
 */

export type Programacion = { hora: string; cadencia: CadenciaId };
export const PROGRAMACION_POR_DEFECTO: Programacion = { hora: "19:30", cadencia: "diario" };

export async function leerProgramacion(): Promise<Programacion> {
  try {
    const supabase = await createCommercialClient();
    const { data } = await supabase.from("settings").select("value").eq("key", "contenido_programacion").maybeSingle();
    const v = (data?.value ?? {}) as { hora?: unknown; cadencia?: unknown };
    const hora = typeof v.hora === "string" && /^\d{2}:\d{2}$/.test(v.hora) ? v.hora : PROGRAMACION_POR_DEFECTO.hora;
    const cadencia = typeof v.cadencia === "string" && esCadencia(v.cadencia) ? v.cadencia : PROGRAMACION_POR_DEFECTO.cadencia;
    return { hora, cadencia };
  } catch {
    return PROGRAMACION_POR_DEFECTO;
  }
}

export type DiaOcupado = {
  fecha: string;               // YYYY-MM-DD en Bogotá
  tipo: "programado" | "publicando" | "publicado" | "error";
  origen: "estudio" | "bot";
  pieza_id: string | null;
  titulo: string | null;
  instante: string | null;     // ISO del programada_para / publicado_at
  permalink: string | null;
  error: string | null;
};

/**
 * Todo lo que ocupa el calendario: piezas programadas/publicando/publicadas y los posts
 * históricos del bot viejo (posts_log sin pieza). Los posts del estudio ya salen por su
 * pieza; se filtran de posts_log para no pintarlos dos veces.
 */
export async function listarOcupados(): Promise<DiaOcupado[]> {
  const supabase = await createPublicSchemaClient();
  const [{ data: piezas }, { data: log }] = await Promise.all([
    supabase
      .from("contenido_piezas")
      .select("id,titulo,estado,programada_para,publicado_at,permalink,publicacion_error")
      .in("estado", ["programado", "publicando", "publicado", "listo"])
      .or("programada_para.not.is.null,publicado_at.not.is.null,publicacion_error.not.is.null"),
    supabase
      .from("posts_log")
      .select("id,fecha_local,status,permalink,pieza_id,error_msg,created_at")
      .is("pieza_id", null)
      .eq("status", "published")
      .order("fecha_local", { ascending: true }),
  ]);

  const salida: DiaOcupado[] = [];
  for (const p of piezas ?? []) {
    if (p.estado === "publicado" && p.publicado_at) {
      salida.push({ fecha: fechaLocal(p.publicado_at), tipo: "publicado", origen: "estudio", pieza_id: p.id, titulo: p.titulo, instante: p.publicado_at, permalink: p.permalink, error: null });
    } else if ((p.estado === "programado" || p.estado === "publicando") && p.programada_para) {
      salida.push({ fecha: fechaLocal(p.programada_para), tipo: p.estado, origen: "estudio", pieza_id: p.id, titulo: p.titulo, instante: p.programada_para, permalink: null, error: p.publicacion_error });
    } else if (p.estado === "listo" && p.publicacion_error) {
      // Se rindió tras los intentos: se muestra el día del último intento para que no pase
      // desapercibido. Sin fecha (se soltó al fallar), cae en hoy.
      salida.push({ fecha: fechaLocal(), tipo: "error", origen: "estudio", pieza_id: p.id, titulo: p.titulo, instante: null, permalink: null, error: p.publicacion_error });
    }
  }
  for (const l of log ?? []) {
    salida.push({ fecha: String(l.fecha_local).slice(0, 10), tipo: "publicado", origen: "bot", pieza_id: null, titulo: "Foto del bot", instante: l.created_at, permalink: l.permalink, error: null });
  }
  return salida;
}

/** Los días que cuentan como ocupados para proponer el siguiente libre. */
export function diasOcupados(ocupados: DiaOcupado[]): string[] {
  return ocupados.filter((o) => o.tipo !== "error").map((o) => o.fecha);
}

export { CADENCIA };
