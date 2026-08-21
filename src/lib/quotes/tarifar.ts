import "server-only";

import { detectSeason, DEFAULT_SEASON_SUPPLEMENTS, type SeasonResult, type SeasonSupplements } from "@/lib/seasons";
import { quoteYear, ratesForYear } from "@/lib/pricing/year";
import type { ComercialClient } from "@/lib/quotes/pdf";

/**
 * El cálculo de una cotización de ruta, en un solo lugar.
 *
 * Antes vivía copiado en `agentQuote.ts` y en `webQuote.ts` con los mismos pasos y las
 * mismas reglas: leer las dos tarifas del año de SALIDA, repartir habitaciones, detectar
 * temporada y armar la etiqueta de modalidad. Dos copias del mismo dinero es exactamente
 * lo que no puede pasar: si Nico cambia una regla en la plataforma, BayMax y la web tienen
 * que quedar cambiados en el mismo movimiento.
 *
 * Lo que NO entra acá a propósito: qué ruta se busca (la web solo cotiza las publicadas,
 * el CRM todas), qué se inserta en `quotes`, el PDF y los correos. Eso es de cada flujo.
 *
 * `cotizar/actions.ts` (el cotizador público interno) sigue aparte: usa el fallback al año
 * anterior con aviso en pantalla, que es una decisión distinta de negocio. Y el Wizard es
 * cliente: ahí Nico teclea precios cuando el año no tiene tarifa.
 */

export type TipoAlojamiento = "pension" | "hotel";

/** Lo mínimo de `comercial.routes` que hace falta para tarifar. */
export type RutaTarifable = { id: string; name: string; days: number | null };

export type Peticion = {
  route: RutaTarifable;
  tipo: TipoAlojamiento;
  /** true = todo el grupo en individual; false = pares en doble y el impar en individual. */
  todosIndividuales: boolean;
  personas: number;
  /** Fecha de salida YYYY-MM-DD. Manda el año de la tarifa. */
  startDate: string;
};

export type Tarifacion = {
  year: number;
  tipo: TipoAlojamiento;
  todosIndividuales: boolean;
  personas: number;
  /** Reparto real de habitaciones. */
  dobles: number;
  enDoble: number;
  individuales: number;
  tarifaDoble: number;
  tarifaSingle: number;
  pilgrimDoble: number;
  pilgrimSingle: number;
  /** Ruta + alojamiento, sin suplemento ni opcionales. */
  baseEur: number;
  costBaseEur: number;
  season: SeasonResult;
  suplementoEur: number;
  suplementoCostEur: number;
  /** base + suplemento. Los opcionales los suma después `recompute_quote_money()`. */
  totalEur: number;
  costEur: number;
  endDate: string;
  modalityLabel: string;
  roomsJson: { tipo: TipoAlojamiento; dobles: number; individuales: number; tarifa_doble: number; tarifa_single: number };
};

export type ErrorTarifa = {
  status: number;
  error: "ruta_sin_precio" | "sin_tarifas_ano";
  detalle: string;
};

export type ResultadoTarifa = { ok: true; tarifa: Tarifacion } | { ok: false } & ErrorTarifa;

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Etiqueta que refleja el reparto REAL de habitaciones, no la modalidad pedida. */
export function etiquetaModalidad(tipo: TipoAlojamiento, dobles: number, individuales: number): string {
  const tipoNombre = tipo === "hotel" ? "Hotel" : "Pensión";
  if (individuales === 0) return `${tipoNombre}, habitación doble`;
  if (dobles === 0) return `${tipoNombre}, habitación individual`;
  return `${tipoNombre} · ${dobles} ${dobles === 1 ? "doble" : "dobles"} + ${individuales} individual${individuales === 1 ? "" : "es"}`;
}

export async function tarifarRuta(supabase: ComercialClient, p: Peticion): Promise<ResultadoTarifa> {
  const modDoble = `${p.tipo}_doble`;
  const modSingle = `${p.tipo}_single`;

  const [{ data: precios }, { data: seasonSetting }] = await Promise.all([
    // Todos los años: abajo se exige el del viaje, sin caer al anterior.
    supabase
      .from("pricing")
      .select("modality,year,price_cs,price_pilgrim")
      .eq("route_id", p.route.id)
      .eq("season", "regular")
      .in("modality", [modDoble, modSingle]),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
  ]);

  // La tarifa es la del año de SALIDA, con coincidencia exacta y sin caer al año anterior:
  // cotizar 2027 con la tarifa de 2026 es cobrar de menos en silencio.
  const year = quoteYear(p.startDate);
  const todas = (precios || []) as Array<{ modality: string; year: number | null; price_cs: number | string | null; price_pilgrim: number | string | null }>;
  const rows = ratesForYear(todas, year);
  const fila = (m: string) => rows.find((r) => r.modality === m);

  const tarifaDoble = Number(fila(modDoble)?.price_cs) || 0;
  const tarifaSingle = Number(fila(modSingle)?.price_cs) || 0;
  // Con todos en individual basta la tarifa single; con reparto automático hacen falta las
  // dos, porque un grupo impar deja a alguien en individual.
  const falta = p.todosIndividuales ? tarifaSingle <= 0 : tarifaDoble <= 0 || tarifaSingle <= 0;
  if (falta) {
    const enOtroAno = todas.some((r) => (Number(r.price_cs) || 0) > 0);
    return enOtroAno
      ? { ok: false, status: 409, error: "sin_tarifas_ano", detalle: `La ruta no tiene tarifa ${p.tipo} cargada para ${year}.` }
      : { ok: false, status: 404, error: "ruta_sin_precio", detalle: `La ruta no tiene tarifa ${p.tipo} en ningún año.` };
  }

  // Reparto: pares en doble y el impar en individual, salvo que se pida todo individual.
  const dobles = p.todosIndividuales ? 0 : Math.floor(p.personas / 2);
  const enDoble = dobles * 2;
  const individuales = p.personas - enDoble;

  // Temporada sobre el viaje completo (salida → último día).
  const seasonConfig = (seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS;
  const endDate = p.route.days ? sumarDias(p.startDate, p.route.days - 1) : p.startDate;
  const season = detectSeason(p.startDate, endDate, seasonConfig);

  const baseEur = enDoble * tarifaDoble + individuales * tarifaSingle;
  const suplementoEur = season.surcharge_per_person_cs * p.personas;

  const pilgrimDoble = Number(fila(modDoble)?.price_pilgrim) || 0;
  const pilgrimSingle = Number(fila(modSingle)?.price_pilgrim) || 0;
  const costBaseEur = enDoble * pilgrimDoble + individuales * pilgrimSingle;
  const suplementoCostEur = season.surcharge_per_person_pilgrim * p.personas;

  return {
    ok: true,
    tarifa: {
      year,
      tipo: p.tipo,
      todosIndividuales: p.todosIndividuales,
      personas: p.personas,
      dobles,
      enDoble,
      individuales,
      tarifaDoble,
      tarifaSingle,
      pilgrimDoble,
      pilgrimSingle,
      baseEur,
      costBaseEur,
      season,
      suplementoEur,
      suplementoCostEur,
      totalEur: baseEur + suplementoEur,
      costEur: costBaseEur + suplementoCostEur,
      endDate,
      modalityLabel: etiquetaModalidad(p.tipo, dobles, individuales),
      roomsJson: { tipo: p.tipo, dobles, individuales, tarifa_doble: tarifaDoble, tarifa_single: tarifaSingle },
    },
  };
}
