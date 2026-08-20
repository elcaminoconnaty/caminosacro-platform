/**
 * Catálogo por año de vigencia (migración 0017).
 *
 * Regla del negocio: la tarifa que aplica es la del **año de salida** del viaje, no la del
 * año en que se cotiza. Pilgrim sube precios cada año, así que cotizar una salida 2027 con
 * la tarifa 2026 es cobrar de menos.
 *
 * Quién usa cuál:
 * - **Coincidencia exacta** (`ratesForYear`): el CRM y el cotizador de caminosacro.com
 *   (`quotes/webQuote.ts`). Si no hay tarifas del año, no se autocarga nada. En el CRM,
 *   que Nico teclee el precio real; en la web, el visitante ve un aviso de que ese año
 *   todavía no tiene precios oficiales y el lead le llega a Nico. Es lo que evita que se
 *   cuele una tarifa vieja en un viaje futuro.
 * - **Con caída al año anterior** (`ratesForYearWithFallback`): los opcionales
 *   (`optionalPricesForYear`, que no tienen dónde teclearse a mano) y el catálogo que
 *   `/api/wp/pricing` le muestra a la web, marcado con `isFallback`/`prices_year`. Ahí no
 *   se cotiza nada: solo se pintan cifras de referencia.
 *
 * OJO: `/cotizar` (el cotizador público interno) sigue con el fallback y su aviso en
 * pantalla; es una decisión aparte de la del cotizador de la web.
 */

/** Primer año del catálogo: todas las tarifas anteriores a la migración 0017 son de 2026. */
export const CATALOG_BASE_YEAR = 2026;

/** Los 4 slugs de `comercial.pricing.modality`. */
export const MODALITY_SLUGS = [
  "pension_doble",
  "pension_single",
  "hotel_doble",
  "hotel_single",
] as const;

export type ModalitySlug = (typeof MODALITY_SLUGS)[number];

/** Etiquetas cortas para la UI del catálogo y del asistente. */
export const MODALITY_LABELS: Record<ModalitySlug, string> = {
  pension_doble: "Pensión doble",
  pension_single: "Pensión individual",
  hotel_doble: "Hotel doble",
  hotel_single: "Hotel individual",
};

/** Años que ofrece el selector del catálogo: desde el base hasta el próximo. */
export function catalogYears(now: Date = new Date()): number[] {
  const last = now.getFullYear() + 1;
  const years: number[] = [];
  for (let y = CATALOG_BASE_YEAR; y <= last; y++) years.push(y);
  return years;
}

/**
 * Año de tarifa de una cotización: el de la fecha de salida. Sin fecha, el año en curso.
 * Se parsea el string ISO a mano para no depender de la zona horaria (`new Date("2027-01-01")`
 * es UTC y en Bogotá cae el 31 de diciembre de 2026).
 */
export function quoteYear(startDate: string | null | undefined, now: Date = new Date()): number {
  const m = /^(\d{4})-/.exec((startDate ?? "").trim());
  return m ? Number(m[1]) : now.getFullYear();
}

/** Filas del año exacto. Vacío significa "no hay tarifas cargadas para ese año". */
export function ratesForYear<T extends { year?: number | null }>(rows: T[], year: number): T[] {
  return rows.filter((r) => Number(r.year ?? CATALOG_BASE_YEAR) === year);
}

/**
 * Solo para el cotizador público: usa el año pedido y, si no hay nada cargado, cae al año
 * cargado más reciente por debajo. `isFallback` avisa que el precio es de referencia.
 */
export function ratesForYearWithFallback<T extends { year?: number | null }>(
  rows: T[],
  year: number,
): { rows: T[]; year: number; isFallback: boolean } {
  const exact = ratesForYear(rows, year);
  if (exact.length > 0) return { rows: exact, year, isFallback: false };

  const earlier = rows
    .map((r) => Number(r.year ?? CATALOG_BASE_YEAR))
    .filter((y) => y < year);
  if (earlier.length === 0) return { rows: [], year, isFallback: false };

  const fallbackYear = Math.max(...earlier);
  return { rows: ratesForYear(rows, fallbackYear), year: fallbackYear, isFallback: true };
}

/** Nota para pantalla y PDF cuando el precio salió de un año anterior. */
export function fallbackPriceNote(usedYear: number, requestedYear: number): string {
  return `Precio de referencia ${usedYear}. Para salidas en ${requestedYear} queda sujeto a confirmación.`;
}

/** Precio de un opcional resuelto para un año (tabla comercial.optional_prices). */
export type OptionalPrice = {
  optional_id: string;
  year: number;
  price_pilgrim: number;
  price_cs: number;
};

/**
 * Resuelve el precio de cada opcional para un año, cayendo al año cargado más reciente si
 * ese año todavía no está cargado. A diferencia de las rutas, acá el fallback también
 * aplica en el CRM (decisión de Nico): marcar un seguro o una noche extra no tiene dónde
 * teclear el precio a mano, así que bloquearlo dejaría sin extras a las cotizaciones del
 * año nuevo. El año realmente usado viaja en `priceYear` para poder avisarlo en ámbar.
 */
export function optionalPricesForYear(
  rows: OptionalPrice[],
  year: number,
): Map<string, { price_pilgrim: number; price_cs: number; priceYear: number; isFallback: boolean }> {
  const porOpcional = new Map<string, OptionalPrice[]>();
  for (const r of rows) {
    if (!porOpcional.has(r.optional_id)) porOpcional.set(r.optional_id, []);
    porOpcional.get(r.optional_id)!.push(r);
  }
  const out = new Map<string, { price_pilgrim: number; price_cs: number; priceYear: number; isFallback: boolean }>();
  for (const [optionalId, propias] of porOpcional) {
    const elegidas = ratesForYearWithFallback(propias, year);
    const fila = elegidas.rows[0];
    if (!fila) continue;
    out.set(optionalId, {
      price_pilgrim: Number(fila.price_pilgrim) || 0,
      price_cs: Number(fila.price_cs) || 0,
      priceYear: elegidas.year,
      isFallback: elegidas.isFallback,
    });
  }
  return out;
}
