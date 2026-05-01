export type SeasonSupplements = {
  high_season: {
    name: string;
    description: string;
    months: number[]; // 1..12
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

  // 2. Temporada alta — si alguna parte del viaje cae en julio/agosto/septiembre
  const startMonth = start.getMonth() + 1;
  const endMonth = end.getMonth() + 1;
  const months = config.high_season.months;
  const overlap =
    months.includes(startMonth) || months.includes(endMonth) ||
    // si el rango es largo y atraviesa todos los meses
    (start.getMonth() + 1 < Math.min(...months) && end.getMonth() + 1 > Math.max(...months));

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

export const DEFAULT_SEASON_SUPPLEMENTS: SeasonSupplements = {
  high_season: {
    name: "Temporada alta",
    description: "Julio, agosto y septiembre",
    months: [7, 8, 9],
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
