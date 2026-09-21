/**
 * El itinerario de UNA cotización.
 *
 * El catálogo describe la ruta genérica; lo que se le vende a un cliente concreto puede
 * tener una etapa más, un pueblo distinto o un día partido en dos. Hasta ahora eso obligaba
 * a crear una ruta nueva en el catálogo por cada cliente —"Norte desde Vilalba (Carolina)"—
 * y el catálogo se llenaba de rutas que nadie va a volver a vender.
 *
 * El campo ya existía (`quotes.condiciones_json.etapas`, migración 0042) y el PDF ya le da
 * prioridad sobre el catálogo; lo que faltaba era poder escribirlo desde el expediente.
 *
 * Reglas que vienen del PDF (ver `buildItinerarioStages` en @/lib/quotePdf):
 * - Solo se guardan las etapas que se CAMINAN. La llegada ("Día 1: Llegada a X") y el
 *   "Fin de servicios" los pinta el documento solo; guardarlas las duplicaría.
 * - Una etapa cuenta como caminada si tiene km > 0. Una con km 0 el PDF la ignora.
 * - De la cantidad de etapas salen los días, las noches, los km del encabezado y la lista
 *   de "Incluye": N etapas caminadas = N+2 días y N+1 noches.
 */

export type EtapaItinerario = {
  day: number;
  from_place: string | null;
  to_place: string | null;
  km: number | null;
  accommodation: string | null;
};

/** Una fila del editor, antes de normalizarla. Los km llegan como texto del formulario. */
export type FilaEtapa = {
  from_place: string;
  to_place: string;
  km: string;
  accommodation: string;
};

const limpio = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

export const numeroKm = (v: string | number | null | undefined): number | null => {
  const t = String(v ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Las etapas que el PDF va a dibujar: las caminadas, en orden, renumeradas desde el día 2.
 * El día 1 es siempre la llegada, así que la primera etapa caminada es el día 2.
 */
export function etapasCaminadas(etapas: EtapaItinerario[] | null | undefined): EtapaItinerario[] {
  return [...(etapas ?? [])]
    .filter((e) => (Number(e.km) || 0) > 0)
    .sort((a, b) => a.day - b.day)
    .map((e, i) => ({ ...e, day: i + 2 }));
}

/** Las filas del editor → lo que se guarda. Se descartan las filas sin destino ni km. */
export function etapasDeFilas(filas: FilaEtapa[]): EtapaItinerario[] {
  return filas
    .filter((f) => limpio(f.to_place) !== null || numeroKm(f.km) !== null)
    .map((f, i) => ({
      day: i + 2,
      from_place: limpio(f.from_place),
      to_place: limpio(f.to_place),
      km: numeroKm(f.km),
      // Sin alojamiento escrito, la noche es en el pueblo de llegada: es lo que hace el PDF
      // por su cuenta, y dejarlo explícito es lo que luego lee la documentación de viaje.
      accommodation: limpio(f.accommodation) ?? limpio(f.to_place),
    }));
}

/** Lo guardado (o el catálogo) → las filas del editor. */
export function filasDeEtapas(etapas: EtapaItinerario[] | null | undefined): FilaEtapa[] {
  return etapasCaminadas(etapas).map((e) => ({
    from_place: e.from_place ?? "",
    to_place: e.to_place ?? "",
    km: e.km != null ? String(e.km) : "",
    accommodation: e.accommodation ?? "",
  }));
}

export const filaEtapaVacia = (desde = ""): FilaEtapa => ({
  from_place: desde,
  to_place: "",
  km: "",
  accommodation: "",
});

/**
 * Lo que este itinerario le dice al documento. Misma cuenta que el PDF: la llegada y el
 * fin de servicios son dos días más, y se duerme todas las noches menos la última.
 */
export function resumenItinerario(etapas: EtapaItinerario[] | null | undefined) {
  const caminadas = etapasCaminadas(etapas);
  const km = caminadas.reduce((a, e) => a + (Number(e.km) || 0), 0);
  return {
    etapas: caminadas.length,
    dias: caminadas.length > 0 ? caminadas.length + 2 : 0,
    noches: caminadas.length > 0 ? caminadas.length + 1 : 0,
    km: Math.round(km * 10) / 10,
  };
}

export function sumarDiasIso(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** La fecha de fin que corresponde a estas etapas. null si no hay salida o no hay etapas. */
export function fechaFinDeItinerario(startDate: string | null, etapas: EtapaItinerario[] | null | undefined): string | null {
  const { dias } = resumenItinerario(etapas);
  if (!startDate || dias <= 0) return null;
  return sumarDiasIso(startDate, dias - 1);
}

/** ¿Estas etapas dicen lo mismo que aquellas? Compara solo lo que sale en el documento. */
export function mismoItinerario(
  a: EtapaItinerario[] | null | undefined,
  b: EtapaItinerario[] | null | undefined,
): boolean {
  const x = etapasCaminadas(a);
  const y = etapasCaminadas(b);
  if (x.length !== y.length) return false;
  return x.every((e, i) => {
    const o = y[i];
    return (
      (e.from_place ?? "") === (o.from_place ?? "") &&
      (e.to_place ?? "") === (o.to_place ?? "") &&
      (Number(e.km) || 0) === (Number(o.km) || 0) &&
      (e.accommodation ?? "") === (o.accommodation ?? "")
    );
  });
}

/** Lee las etapas guardadas en `condiciones_json`. Vacío = la cotización usa el catálogo. */
export function etapasDeCondiciones(condiciones: unknown): EtapaItinerario[] {
  if (!condiciones || typeof condiciones !== "object") return [];
  const raw = (condiciones as { etapas?: unknown }).etapas;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e, i) => ({
      day: Number(e.day) || i + 2,
      from_place: limpio(e.from_place as string | null),
      to_place: limpio(e.to_place as string | null),
      km: numeroKm(e.km as string | number | null),
      accommodation: limpio(e.accommodation as string | null),
    }));
}
