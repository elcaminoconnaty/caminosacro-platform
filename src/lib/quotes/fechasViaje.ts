/**
 * Las fechas de un viaje y qué pasa cada día.
 *
 * Misma cuenta que el itinerario del PDF y de la carta de bienvenida
 * (`buildItinerarioStages` en @/lib/quotePdf):
 * - Día 1: llegada al pueblo de salida. Es la `start_date` de la cotización.
 * - Días 2 … N+1: las N etapas caminadas.
 * - Luego, las noches extra en Santiago (si las compró). Los tours contratados ocupan esos
 *   días libres en orden; si sobran, se juntan en el último.
 * - Último día: fin de servicios, el check-out de la última noche reservada.
 *
 * La `end_date` guardada NO sirve para esto: no incluye las noches extra.
 */
import { sumarDiasIso, type EtapaItinerario } from "@/lib/quotes/itinerario";

export type HitoViaje = "llegada" | "inicio_camino" | "fin_camino" | "fin_reserva";

export type FechasViaje = {
  llegada: string;
  inicioCamino: string;
  finCamino: string;
  finReserva: string;
  etapas: number;
  nochesExtra: number;
  /** Tours contratados, en el orden en que ocupan los días libres. */
  tours: string[];
};

export const HITOS: readonly HitoViaje[] = ["llegada", "inicio_camino", "fin_camino", "fin_reserva"];

export const HITO_LABELS: Record<HitoViaje, string> = {
  llegada: "Inicia el viaje",
  inicio_camino: "Empieza a caminar",
  fin_camino: "Termina de caminar",
  fin_reserva: "Termina la reserva",
};

/** Versión corta, para la lista lateral del calendario. */
export const HITO_CORTO: Record<HitoViaje, string> = {
  llegada: "Llega",
  inicio_camino: "Camina",
  fin_camino: "Termina",
  fin_reserva: "Sale",
};

/** null si falta la salida o el itinerario no tiene etapas caminadas. */
export function fechasDelViaje(
  startDate: string | null,
  etapas: number,
  nochesExtra = 0,
  tours: string[] = [],
): FechasViaje | null {
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
    tours,
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

// ---------- Día a día ----------

export type TipoDia = "llegada" | "camino" | "libre" | "tour" | "salida";

export const TIPO_DIA_LABELS: Record<TipoDia, string> = {
  llegada: "Llega",
  camino: "Caminando",
  libre: "Día libre en Santiago",
  tour: "Tour en Santiago",
  salida: "Sale del hotel",
};

/** Fondo de cada tramo de la raya. El texto encima va en `TIPO_DIA_TEXTO`. */
export const TIPO_DIA_BG: Record<TipoDia, string> = {
  llegada: "bg-[#9dbfaa]",
  camino: "bg-bosque-medio",
  libre: "bg-dorado",
  tour: "bg-[#c2703d]",
  salida: "bg-[#cfc6b5]",
};

export const TIPO_DIA_TEXTO: Record<TipoDia, string> = {
  llegada: "text-bosque",
  camino: "text-white",
  libre: "text-bosque",
  tour: "text-white",
  salida: "text-tinta",
};

export const TIPOS_DIA: readonly TipoDia[] = ["llegada", "camino", "libre", "tour", "salida"];

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

/** El tour de cada día libre, con el mismo reparto que el PDF. */
function tourDelDiaLibre(f: FechasViaje, i: number): string | null {
  if (i < f.nochesExtra - 1) return f.tours[i] ?? null;
  const resto = f.tours.slice(i);
  return resto.length > 0 ? resto.join(" · ") : null;
}

/** Qué pasa ese día del viaje, o null si la fecha cae fuera. */
export function tipoDelDia(f: FechasViaje, fecha: string): TipoDia | null {
  if (fecha < f.llegada || fecha > f.finReserva) return null;
  if (fecha === f.llegada) return "llegada";
  if (fecha === f.finReserva) return "salida";
  if (fecha <= f.finCamino) return "camino";
  return tourDelDiaLibre(f, diasEntre(f.finCamino, fecha) - 1) ? "tour" : "libre";
}

/** "Día 4 · Palas de Rei → Arzúa (29 km)": lo que se ve al pasar el mouse por un día. */
export function detalleDelDia(f: FechasViaje, fecha: string, etapas?: EtapaItinerario[] | null): string {
  const tipo = tipoDelDia(f, fecha);
  if (!tipo) return "";
  const n = diasEntre(f.llegada, fecha) + 1;
  const caminadas = etapas ?? [];
  switch (tipo) {
    case "llegada": {
      const origen = caminadas[0]?.from_place;
      return `Día ${n} · Llegada${origen ? ` a ${origen}` : ""}`;
    }
    case "camino": {
      const e = caminadas[n - 2];
      if (!e) return `Día ${n} · Etapa ${n - 1}`;
      const tramo = e.from_place && e.to_place ? `${e.from_place} → ${e.to_place}` : (e.to_place || e.from_place || `Etapa ${n - 1}`);
      return `Día ${n} · ${tramo}${e.km ? ` (${Math.round(Number(e.km))} km)` : ""}`;
    }
    case "tour":
      return `Día ${n} · ${tourDelDiaLibre(f, diasEntre(f.finCamino, fecha) - 1)}`;
    case "libre":
      return `Día ${n} · Día libre en Santiago`;
    case "salida":
      return `Día ${n} · Fin de servicios${f.nochesExtra === 0 && f.tours.length > 0 ? ` · ${f.tours.join(" · ")}` : ""}`;
  }
}
