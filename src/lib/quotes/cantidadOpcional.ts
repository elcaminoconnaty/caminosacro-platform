/**
 * Cuántas unidades de un opcional del catálogo van por defecto al marcarlo.
 *
 * La regla sale del texto de la unidad (`optional_services.unit`), el mismo que se lee en
 * el catálogo, en la tarjeta del expediente y en el PDF entre paréntesis. Así la unidad
 * que ve el cliente y la cuenta que hace la plataforma no se pueden separar:
 *
 *   "por persona"                     → personas
 *   "por persona y día"               → personas × días del viaje (cenas, seguro de bici)
 *   "por persona y noche"             → personas × 1 noche (se sube a mano si son más)
 *   "por vehículo (hasta 4 plazas)"   → un vehículo cada 4 personas
 *   cualquier otra ("por unidad"…)    → 1
 *
 * "Días del viaje" = noches entre la salida y el regreso: es el número de cenas en ruta
 * y de días con la bici. Sin fechas se usan las noches de la ruta; sin nada, 1.
 * La cantidad sigue siendo editable en la tarjeta: esto es solo el punto de partida.
 *
 * Sin "server-only": la tarjeta del expediente la usa para explicar la cuenta.
 */
export type ReglaCantidad = "persona" | "persona_dia" | "persona_noche" | "vehiculo" | "unidad";

export function reglaDeUnidad(unit: string | null | undefined): { regla: ReglaCantidad; plazas: number } {
  const u = (unit || "").toLowerCase();
  if (u.includes("vehículo") || u.includes("vehiculo")) {
    const m = u.match(/(\d+)\s*plazas/);
    return { regla: "vehiculo", plazas: m ? Math.max(1, Number(m[1])) : 4 };
  }
  if (u.includes("persona")) {
    if (/\bd[ií]a\b/.test(u)) return { regla: "persona_dia", plazas: 0 };
    if (u.includes("noche")) return { regla: "persona_noche", plazas: 0 };
    return { regla: "persona", plazas: 0 };
  }
  return { regla: "unidad", plazas: 0 };
}

/** Noches entre salida y regreso (fechas ISO); null si falta alguna o no cuadran. */
export function nochesDelViaje(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const a = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const n = Math.round((b - a) / 86_400_000);
  return n > 0 ? n : null;
}

export function cantidadPorDefecto(
  unit: string | null | undefined,
  personas: number | null | undefined,
  dias: number | null | undefined,
): number {
  const p = Math.max(1, Math.round(Number(personas) || 1));
  const d = Math.max(1, Math.round(Number(dias) || 1));
  const { regla, plazas } = reglaDeUnidad(unit);
  switch (regla) {
    case "persona":
    case "persona_noche":
      return p;
    case "persona_dia":
      return p * d;
    case "vehiculo":
      return Math.ceil(p / plazas);
    default:
      return 1;
  }
}

/** Texto corto que explica la cantidad por defecto ("4 pers. × 6 días"). */
export function explicarCantidad(
  unit: string | null | undefined,
  personas: number | null | undefined,
  dias: number | null | undefined,
): string | null {
  const p = Math.max(1, Math.round(Number(personas) || 1));
  const d = Math.max(1, Math.round(Number(dias) || 1));
  const { regla, plazas } = reglaDeUnidad(unit);
  const pers = `${p} ${p === 1 ? "persona" : "personas"}`;
  switch (regla) {
    case "persona":
      return pers;
    case "persona_dia":
      return `${pers} × ${d} ${d === 1 ? "día" : "días"}`;
    case "persona_noche":
      return `${pers} × noches`;
    case "vehiculo": {
      const v = Math.ceil(p / plazas);
      return `${v} ${v === 1 ? "vehículo" : "vehículos"} de ${plazas} plazas`;
    }
    default:
      return null;
  }
}
