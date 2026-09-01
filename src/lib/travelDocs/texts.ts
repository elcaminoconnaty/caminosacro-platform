import "server-only";

import type { ComercialClient } from "@/lib/quotes/pdf";
import type { TravelDocTexts } from "@/lib/travelDocPdf";
import type { AsistenciaTexts } from "@/lib/asistenciaPdf";

/**
 * Los textos del documento de viaje y de la asistencia viven en comercial.settings, no
 * en el código: cambian sin desplegar (un teléfono, un horario, un porcentaje) y los
 * edita Nico desde Configuración. La migración 0030 los siembra.
 *
 * Si la clave no está, se devuelve una estructura vacía y VÁLIDA en vez de reventar: un
 * documento con menos texto se nota y se corrige; un PDF que no se genera media hora
 * antes de que salga el cliente, no.
 */

export const TRAVEL_DOC_KEY = "travel_doc";
export const ASISTENCIA_KEY = "asistencia_viaje";

const TRAVEL_DOC_VACIO: TravelDocTexts = { contacto: {}, servicios: [], condiciones: [] };
const ASISTENCIA_VACIO: AsistenciaTexts = { intro: [], secciones: [] };

export async function getTravelDocTexts(supabase: ComercialClient): Promise<TravelDocTexts> {
  const { data } = await supabase.from("settings").select("value").eq("key", TRAVEL_DOC_KEY).maybeSingle();
  const v = data?.value as Partial<TravelDocTexts> | null;
  if (!v) return TRAVEL_DOC_VACIO;
  return {
    contacto: v.contacto ?? {},
    servicios: Array.isArray(v.servicios) ? v.servicios : [],
    importante: v.importante ?? "",
    condiciones: Array.isArray(v.condiciones) ? v.condiciones : [],
  };
}

export async function getAsistenciaTexts(supabase: ComercialClient): Promise<AsistenciaTexts> {
  const { data } = await supabase.from("settings").select("value").eq("key", ASISTENCIA_KEY).maybeSingle();
  const v = data?.value as Partial<AsistenciaTexts> | null;
  if (!v) return ASISTENCIA_VACIO;
  return {
    intro: Array.isArray(v.intro) ? v.intro : [],
    secciones: Array.isArray(v.secciones) ? v.secciones : [],
  };
}
