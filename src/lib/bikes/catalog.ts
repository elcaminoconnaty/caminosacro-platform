/**
 * Lectura del catálogo de bicicletas (migración 0021).
 *
 * Regla de precio, idéntica a la de las rutas (`@/lib/pricing/year`): manda el año de
 * SALIDA del viaje y la coincidencia es EXACTA. Si el año no está cargado no se autocarga
 * nada — la tarjeta lo avisa en ámbar y Nico teclea el precio real. Es a propósito: una
 * bici de 2027 cotizada con tarifa 2026 es plata perdida en cada reserva.
 *
 * (Los opcionales sí caen al año anterior, pero ahí no hay dónde teclear el precio a mano;
 * acá sí lo hay, en /catalogo → Bicicletas.)
 */

import { CATALOG_BASE_YEAR } from "@/lib/pricing/year";

export type BikeSpec = { label: string; value: string };

/** Ficha de un modelo de la flota, tal como vive en `comercial.bikes`. */
export type BikeRow = {
  id: string;
  slug: string;
  position: number;
  name: string;
  category_label: string;
  pilgrim_service: string | null;
  tagline: string | null;
  description: string | null;
  ideal_para: string | null;
  sizes: string[];
  sizes_note: string | null;
  wheels: string[];
  luggage: string | null;
  specs: BikeSpec[];
  motor: { motor: string; pantalla: string; bateria: string } | null;
  electric: boolean;
  photo: string | null;
  active: boolean;
};

/** Una fila de `comercial.bike_prices`. `price_*` en null = tarifa sin cargar. */
export type BikePriceRow = {
  bike_id: string;
  route_id: string;
  year: number;
  days: number | null;
  price_pilgrim: number | null;
  price_cs: number | null;
};

/** Ficha + tarifa ya resuelta para una ruta y un año. */
export type BikeWithPrice = BikeRow & {
  /** null = no hay tarifa cargada para esa ruta y ese año. */
  price_cs: number | null;
  price_pilgrim: number | null;
  /** Días de alquiler que cubre la tarifa. */
  days: number | null;
};

/** Fianza obligatoria por bicicleta. Reembolsable: NO entra al total de la cotización. */
export const FIANZA_POR_BICI_EUR = 200;

/** Columnas de `comercial.bikes` que necesitan la UI y los PDFs. */
export const BIKE_COLUMNS =
  "id,slug,position,name,category_label,pilgrim_service,tagline,description,ideal_para,sizes,sizes_note,wheels,luggage,specs,motor,electric,photo,active";

/** Normaliza una fila cruda de Supabase a `BikeRow` (arrays y jsonb pueden venir sueltos). */
export function normalizeBike(raw: Record<string, unknown>): BikeRow {
  return {
    id: String(raw.id),
    slug: String(raw.slug),
    position: Number(raw.position) || 0,
    name: String(raw.name ?? ""),
    category_label: String(raw.category_label ?? ""),
    pilgrim_service: (raw.pilgrim_service as string | null) ?? null,
    tagline: (raw.tagline as string | null) ?? null,
    description: (raw.description as string | null) ?? null,
    ideal_para: (raw.ideal_para as string | null) ?? null,
    sizes: Array.isArray(raw.sizes) ? (raw.sizes as string[]) : [],
    sizes_note: (raw.sizes_note as string | null) ?? null,
    wheels: Array.isArray(raw.wheels) ? (raw.wheels as string[]) : [],
    luggage: (raw.luggage as string | null) ?? null,
    specs: Array.isArray(raw.specs) ? (raw.specs as BikeSpec[]) : [],
    motor: (raw.motor as BikeRow["motor"]) ?? null,
    electric: Boolean(raw.electric),
    photo: (raw.photo as string | null) ?? null,
    active: raw.active !== false,
  };
}

/** Normaliza una fila cruda de `comercial.bike_prices`. */
export function normalizeBikePrice(raw: Record<string, unknown>): BikePriceRow {
  const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
  return {
    bike_id: String(raw.bike_id),
    route_id: String(raw.route_id),
    year: Number(raw.year) || CATALOG_BASE_YEAR,
    days: n(raw.days),
    price_pilgrim: n(raw.price_pilgrim),
    price_cs: n(raw.price_cs),
  };
}

/**
 * Resuelve la tarifa de cada bici para una ruta y un año concretos.
 *
 * Devuelve TODAS las bicis activas, también las que no tienen tarifa cargada (con
 * `price_cs: null`). Quien las pinta decide qué hacer: el CRM las muestra deshabilitadas
 * con el aviso en ámbar, y el PDF y el catálogo público las omiten (`soloConPrecio`).
 */
export function bikesForRouteYear(
  bikes: BikeRow[],
  prices: BikePriceRow[],
  routeId: string | null,
  year: number,
  opts: { soloConPrecio?: boolean } = {},
): BikeWithPrice[] {
  const porBici = new Map<string, BikePriceRow>();
  if (routeId) {
    for (const p of prices) {
      if (p.route_id === routeId && p.year === year) porBici.set(p.bike_id, p);
    }
  }
  const out = bikes
    .filter((b) => b.active)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((b) => {
      const p = porBici.get(b.id);
      return {
        ...b,
        price_cs: p?.price_cs ?? null,
        price_pilgrim: p?.price_pilgrim ?? null,
        days: p?.days ?? null,
      };
    });
  return opts.soloConPrecio ? out.filter((b) => (b.price_cs ?? 0) > 0) : out;
}

/**
 * Cómo se describe una bici en una línea de cotización.
 * Lo que se vende es la GAMA; el modelo va como referencia porque el proveedor solo
 * garantiza una bicicleta equivalente en la talla disponible.
 */
export function descripcionLineaBici(bike: { category_label: string; name: string }, days?: number | null): string {
  const dias = days && days > 0 ? ` · ${days} días de alquiler` : "";
  return `Alquiler de bicicleta ${bike.category_label} — ${bike.name}${dias}`;
}
