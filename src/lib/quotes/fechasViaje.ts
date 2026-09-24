/**
 * Las cuatro fechas que importan de un viaje ya vendido.
 *
 * Misma cuenta que el itinerario del PDF y de la carta de bienvenida
 * (`buildItinerarioStages` en @/lib/quotePdf):
 * - Día 1: llegada al pueblo de salida. Es la `start_date` de la cotización.
 * - Días 2 … N+1: las N etapas caminadas.
 * - Luego, las noches extra en Santiago (si las compró).
 * - Último día: fin de servicios, el check-out de la última noche reservada.
 *
 * La `end_date` guardada NO sirve para esto: no incluye las noches extra.
 */
import { sumarDiasIso } from "@/lib/quotes/itinerario";

export type HitoViaje = "llegada" | "inicio_camino" | "fin_camino" | "fin_reserva";

export type FechasViaje = {
  llegada: string;
  inicioCamino: string;
  finCamino: string;
  finReserva: string;
  etapas: number;
  nochesExtra: number;
};

export const HITOS: readonly HitoViaje[] = ["llegada", "inicio_camino", "fin_camino", "fin_reserva"];

export const HITO_LABELS: Record<HitoViaje, string> = {
  llegada: "Inicia el viaje",
  inicio_camino: "Empieza a caminar",
  fin_camino: "Termina de caminar",
  fin_reserva: "Termina la reserva",
};

/** Versión corta para las celdas del calendario. */
export const HITO_CORTO: Record<HitoViaje, string> = {
  llegada: "Llega",
  inicio_camino: "Camina",
  fin_camino: "Termina",
  fin_reserva: "Sale",
};

export const HITO_COLORS: Record<HitoViaje, string> = {
  llegada: "bg-blue-100 text-blue-800",
  inicio_camino: "bg-emerald-100 text-emerald-800",
  fin_camino: "bg-amber-100 text-amber-800",
  fin_reserva: "bg-zinc-200 text-zinc-800",
};

/** null si falta la salida o el itinerario no tiene etapas caminadas. */
export function fechasDelViaje(startDate: string | null, etapas: number, nochesExtra = 0): FechasViaje | null {
  if (!startDate || etapas <= 0) return null;
  const llegada = startDate.slice(0, 10);
  const extra = Math.max(0, nochesExtra);
  return {
    llegada,
    inicioCamino: sumarDiasIso(llegada, 1),
    finCamino: sumarDiasIso(llegada, etapas),
    finReserva: sumarDiasIso(llegada, etapas + 1 + extra),
    etapas,
    nochesExtra: extra,
  };
}

export function fechaDeHito(f: FechasViaje, h: HitoViaje): string {
  switch (h) {
    case "llegada": return f.llegada;
    case "inicio_camino": return f.inicioCamino;
    case "fin_camino": return f.finCamino;
    case "fin_reserva": return f.finReserva;
  }
}
