"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";

/**
 * Cierra (o reabre) un lead de la web desde el panel de Seguimiento.
 *
 * Recibe varios ids porque en pantalla un doble envío se ve como una sola línea: cerrar
 * "Hugo · Inglés desde Ferrol" tiene que cerrar las dos filas que lo componen, o la
 * siguiente carga lo devuelve a la bandeja.
 *
 * No borra nada nunca: `atendido_at` a null lo devuelve a pendientes. Las filas son el
 * registro de cuánta demanda entra sin tarifas cargadas y esa cuenta no se toca desde acá.
 */
export async function marcarLeadAtendido(ids: string[], atendido: boolean, nota?: string) {
  if (!ids.length) return { error: "No llegó ningún lead que marcar." };

  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("web_leads")
    .update({
      atendido_at: atendido ? new Date().toISOString() : null,
      // Al reabrir se limpia la nota: dejaría colgada la explicación de un cierre que
      // ya no existe.
      atendido_nota: atendido ? (nota?.trim() || null) : null,
    })
    .in("id", ids);

  if (error) return { error: mensajeError(error, "No se pudo marcar el lead.") };
  revalidatePath("/seguimiento");
  return { ok: true as const };
}
