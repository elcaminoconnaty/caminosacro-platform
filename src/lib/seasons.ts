export type SeasonSupplements = {
  high_season: {
    name: string;
    description: string;
    months: number[]; // 1..12 — meses por defecto si el año no está en months_by_year
    /** Pilgrim cambia los meses de un año a otro (2026: jul–sep; 2027: may, ago, sep). */
    months_by_year?: Record<string, number[]>;
    price_pilgrim: number;
    price_cs: number;
  };
  easter: {
    name: string;
    description: string;
    price_pilgrim: number;
    price_cs: number;
    dates_by_year: Record<string, { from: string; to: string }>;
  };
};

export type SeasonResult = {
  type: "regular" | "high_season" | "easter";
  label: string;
  surcharge_per_person_cs: number;
  surcharge_per_person_pilgrim: number;
};

/** Si el viaje cae en Semana Santa o temporada alta (al menos parcialmente), retorna el suplemento mayor aplicable. */
export function detectSeason(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  config: SeasonSupplements,
): SeasonResult {
  if (!startDate) {
    return { type: "regular", label: "Regular", surcharge_per_person_cs: 0, surcharge_per_person_pilgrim: 0 };
  }
  const start = new Date(startDate + "T00:00:00");
  const end = endDate ? new Date(endDate + "T00:00:00") : new Date(start);

  // 1. Semana Santa (mayor prioridad si aplica)
  for (const [, { from, to }] of Object.entries(config.easter.dates_by_year || {})) {
    const f = new Date(from + "T00:00:00");
    const t = new Date(to + "T23:59:59");
    if (start <= t && end >= f) {
      return {
        type: "easter",
        label: config.easter.name,
        surcharge_per_person_cs: config.easter.price_cs,
        surcharge_per_person_pilgrim: config.easter.price_pilgrim,
      };
    }
  }

  // 2. Temporada alta — si alguna parte del viaje cae en un mes de temporada alta del año de salida.
  // Se recorre mes a mes porque los meses ya no son contiguos (2027: mayo, agosto, septiembre).
  const months = highSeasonMonths(config, start.getFullYear());
  let overlap = false;
  for (const d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
    if (months.includes(d.getMonth() + 1)) { overlap = true; break; }
  }

  if (overlap) {
    return {
      type: "high_season",
      label: config.high_season.name,
      surcharge_per_person_cs: config.high_season.price_cs,
      surcharge_per_person_pilgrim: config.high_season.price_pilgrim,
    };
  }

  return { type: "regular", label: "Temporada regular", surcharge_per_person_cs: 0, surcharge_per_person_pilgrim: 0 };
}

/** Meses de temporada alta (1..12) que rigen para un año de salida. */
export function highSeasonMonths(config: SeasonSupplements, year: number | string | null | undefined): number[] {
  const porAno = config.high_season.months_by_year;
  if (year != null && porAno?.[String(year)]) return porAno[String(year)];
  return config.high_season.months;
}

const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "julio, agosto o septiembre" / "mayo, agosto o septiembre". */
export function mesesTexto(months: number[], conjuncion: "y" | "o" = "o"): string {
  const n = [...months].sort((a, b) => a - b).map((m) => NOMBRES_MES[m - 1]);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} ${conjuncion} ${n[n.length - 1]}`;
}

export const DEFAULT_SEASON_SUPPLEMENTS: SeasonSupplements = {
  high_season: {
    name: "Temporada alta",
    description: "Julio, agosto y septiembre",
    months: [7, 8, 9],
    months_by_year: { "2026": [7, 8, 9], "2027": [5, 8, 9] },
    price_pilgrim: 50,
    price_cs: 80,
  },
  easter: {
    name: "Semana Santa",
    description: "Domingo de Ramos a Lunes de Pascua",
    price_pilgrim: 25,
    price_cs: 40,
    dates_by_year: {
      "2026": { from: "2026-03-29", to: "2026-04-06" },
      "2027": { from: "2027-03-21", to: "2027-03-29" },
      "2028": { from: "2028-04-09", to: "2028-04-17" },
    },
  },
};
