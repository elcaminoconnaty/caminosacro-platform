"use client";

import { useMemo, useRef, useState, useTransition, useEffect } from "react";
import { updateQuote } from "./actions";
import { detectSeason, type SeasonSupplements } from "@/lib/seasons";
import { QUOTE_STATUSES, STATUS_LABELS, DEFAULT_STATUS, statusLabel } from "@/lib/quoteStatus";
import { MODALITY_LABELS, MODALITY_SLUGS, quoteYear, ratesForYear, type ModalitySlug } from "@/lib/pricing/year";
import RoomsPanel from "@/components/RoomsPanel";
import {
  MODALIDAD_A_MEDIDA,
  etiquetaHabitaciones,
  filaVacia,
  leerFilasHabitacion,
  priceBlocksDeFilas,
  roomsJsonAMedida,
  totalesHabitacion,
  type RoomRow,
} from "@/lib/quotes/rooms";
import {
  etiquetaReparto,
  eurPP,
  notaPrecioPorPersona,
  renglonLibre,
  renglonesDeFilas,
  renglonesDelReparto,
  repartoAutomatico,
  slotsDelReparto,
  totalesDeRenglones,
  type TipoAlojamiento,
} from "@/lib/quotes/precioPorPersona";

type Quote = {
  id: string;
  code: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  route_id?: string | null;
  route_name: string | null;
  start_date: string | null;
  end_date: string | null;
  people: number | null;
  modality: string | null;
  total_eur: number | string | null; // grand total = base + suplemento + opcionales
  base_eur: number | string | null; // ruta + alojamiento (sin suplemento ni opcionales)
  cost_eur: number | string | null; // derivado = cost_base + suplemento Pilgrim + opcionales
  cost_base_eur?: number | string | null; // ruta + alojamiento a precio Pilgrim
  status: string | null;
  valid_until: string | null;
  notes: string | null;
  season_supplement_eur?: number | string | null;
  season_supplement_cost_eur?: number | string | null;
  season_kind?: string | null;
  // Precios por persona de las tarjetas del PDF (migración 0016). null = usar el catálogo.
  price_blocks?: Record<string, number | string | null> | null;
  // Reparto de habitaciones. Con `filas` es un reparto a medida (ver @/lib/quotes/rooms).
  rooms_json?: unknown;
  // Nota interna de "precio POR PERSONA puesto a mano" (migración 0038). null = del catálogo.
  manual_price_note?: string | null;
  // Empresa contratante (migración 0036). Su presencia cambia el módulo de contratos:
  // un solo contrato a nombre de la empresa en vez de uno por viajero.
  company_id?: string | null;
};

export type CompanyLite = {
  id: string;
  legal_name: string | null;
  nit: string | null;
  address: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  rep_name: string | null;
  rep_document_type: string | null;
  rep_document_number: string | null;
};

/**
 * La ruta del catálogo, con lo que el editor necesita para elegirla: la familia (el Camino)
 * para agrupar el desplegable y los días para recalcular la fecha de fin.
 */
export type RouteLite = {
  id: string;
  name: string;
  family?: string | null;
  days?: number | null;
  km?: number | string | null;
  active?: boolean | null;
};

// Mismas etiquetas que el asistente (@/app/(dashboard)/cotizaciones/nueva/Wizard.tsx).
const SIN_FAMILIA = "Sin Camino";
// Escape para las cotizaciones viejas cuya ruta no está en el catálogo ("Portugues desde
// Tui", sin tilde): abre el texto libre de siempre en vez de obligar a cambiarles la ruta.
const RUTA_LIBRE = "__libre__";

type PricingRow = {
  route_id: string;
  route_name: string;
  modality_slug: string;
  year: number;
  price_pilgrim: number;
  price_cs: number;
};

/**
 * Opciones de alojamiento con reparto automático. "Pensión doble" = pares en doble y el
 * impar en individual (igual que el asistente y el cotizador web); "Pensión individual" =
 * todo el grupo en individual. Al guardar, la etiqueta que se escribe es la del reparto
 * REAL ("Pensión · 1 doble + 1 individual"), que es la que el PDF sabe desglosar.
 */
const MODALITY_DISPLAY = MODALITY_SLUGS.map((slug) => ({ slug, label: MODALITY_LABELS[slug] }));

// "Habitaciones a medida" abre el panel de reparto (dobles + triples + cuádruples, cada una
// con su precio). Las otras dos son texto libre y siguen por las cotizaciones que ya las usan.
const EXTRA_MODALITIES = [MODALIDAD_A_MEDIDA, "Doble + Triple", "Personalizada"];

/** Pensión u hotel a partir de cualquier etiqueta de alojamiento; null si no lo dice. */
function tipoDeEtiqueta(label: string | null): TipoAlojamiento | null {
  const m = (label ?? "").toLowerCase();
  if (m.includes("hotel")) return "hotel";
  if (m.includes("pensión") || m.includes("pension")) return "pension";
  return null;
}

/**
 * La etiqueta de alojamiento es texto libre y convive en varios formatos: "Pensión doble"
 * (catálogo y este editor) y "Pensión, habitación doble" (asistente y cotizador web). Se
 * detectan tipo y habitación por separado, igual que en src/lib/quotes/pdf.ts, para que el
 * catálogo también cargue al editar una cotización creada por el asistente.
 */
function modalityToSlug(label: string | null): ModalitySlug | null {
  const m = (label ?? "").toLowerCase();
  const tipo = tipoDeEtiqueta(label);
  if (!m || !tipo) return null;
  const hasDoble = m.includes("doble");
  const hasSingle = m.includes("single") || m.includes("individual");
  if (hasSingle && !hasDoble) return `${tipo}_single`;
  if (hasDoble && !hasSingle) return `${tipo}_doble`;
  return null; // etiqueta mixta ("Pensión · 2 dobles + 1 individual"): reparto automático
}

const numOrNull = (s: string | number | null | undefined): number | null => {
  const t = String(s ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const positivo = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const dosDecimales = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export default function QuoteEditor({
  quote,
  routes,
  pricing,
  seasonConfig,
  company = null,
}: {
  quote: Quote;
  routes: RouteLite[];
  pricing: PricingRow[];
  seasonConfig: SeasonSupplements;
  company?: CompanyLite | null;
}) {
  const [editing, setEditing] = useState(false);
  // El bloque de empresa arranca abierto solo si ya hay una: la mayoría de cotizaciones
  // son de personas y no tienen por qué ver este formulario.
  const [conEmpresa, setConEmpresa] = useState(!!company);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ---- Ruta ----
  //
  // La ruta se ELIGE del catálogo (Camino → desde dónde), igual que en el asistente, y se
  // guarda también su `route_id`. Antes era un `<input list>` de texto libre: el desplegable
  // solo ofrecía lo que ya estaba escrito —o sea nada—, así que en la práctica no se podía
  // cambiar la ruta de una cotización; y si se escribía a mano, un acento de menos dejaba el
  // nombre sin ruta del catálogo detrás y el PDF salía sin etapas ni tarjetas de precio.
  const rutaGuardada = useMemo(
    () => routes.find((r) => (quote.route_id ? r.id === quote.route_id : r.name === quote.route_name)) ?? null,
    [routes, quote.route_id, quote.route_name],
  );
  const [routeName, setRouteName] = useState(quote.route_name ?? "");
  const [routeId, setRouteId] = useState<string | null>(rutaGuardada?.id ?? null);
  // Arranca en el Camino de la ruta guardada. Si esa ruta no está en el catálogo, arranca en
  // texto libre: abrir el expediente no puede cambiarle la ruta a nadie.
  const [family, setFamily] = useState<string>(() => {
    if (!rutaGuardada) return quote.route_name ? RUTA_LIBRE : "";
    return rutaGuardada.family || SIN_FAMILIA;
  });
  const rutaLibre = family === RUTA_LIBRE;

  const families = useMemo(() => {
    const set = new Set<string>();
    let hayHuerfanas = false;
    for (const r of routes) {
      if (r.active === false && r.id !== rutaGuardada?.id) continue;
      if (r.family) set.add(r.family);
      else hayHuerfanas = true;
    }
    const list = [...set].sort();
    if (hayHuerfanas) list.push(SIN_FAMILIA);
    return list;
  }, [routes, rutaGuardada]);

  // Las rutas del Camino elegido. La ruta actual va siempre primera aunque sea de otro
  // Camino o esté inactiva: mientras no se elija otra, el desplegable muestra la que hay.
  const rutasDelCamino = useMemo(() => {
    if (!family || rutaLibre) return [];
    const lista = routes
      .filter((r) => r.active !== false && (family === SIN_FAMILIA ? !r.family : r.family === family))
      .sort((a, b) => (Number(b.days) || 0) - (Number(a.days) || 0));
    if (routeName && !lista.some((r) => r.name === routeName)) {
      const actual = routes.find((r) => r.name === routeName);
      if (actual) return [actual, ...lista];
    }
    return lista;
  }, [routes, family, rutaLibre, routeName]);
  const selectedRoute = useMemo(
    () => routes.find((r) => (routeId ? r.id === routeId : r.name === routeName)) ?? null,
    [routes, routeId, routeName],
  );

  // ---- Lo guardado, leído una sola vez ----
  const storedPeople = Math.max(1, Number(quote.people) || 1);
  const storedBase = quote.base_eur != null ? Number(quote.base_eur) || 0 : Number(quote.total_eur) || 0;
  const storedCost = quote.cost_base_eur != null ? Number(quote.cost_base_eur) || 0 : Number(quote.cost_eur) || 0;
  const roomsGuardado = (quote.rooms_json ?? null) as Record<string, unknown> | null;
  // Reparto de habitaciones a medida (si la cotización lo trae, el select arranca ahí: su
  // `modality` guardada es la etiqueta larga —"Pensión · 2 dobles + 1 triple"— y no una
  // opción de la lista).
  const filasGuardadas = useMemo(() => leerFilasHabitacion(quote.rooms_json), [quote.rooms_json]);
  const [roomRows, setRoomRows] = useState<RoomRow[]>(() =>
    filasGuardadas.length > 0 ? filasGuardadas : [filaVacia()],
  );

  // El alojamiento guardado, traducido a la opción del select. Una etiqueta mixta del
  // asistente o de la web ("Pensión · 1 doble + 1 individual") ES el reparto automático de
  // pensión, o sea la opción "Pensión doble"; sin esta traducción quedaba como una opción
  // suelta que no cargaba catálogo.
  const tipoGuardado = tipoDeEtiqueta(quote.modality);
  const slugGuardado = modalityToSlug(quote.modality);
  const todosIndividualesGuardado = slugGuardado
    ? slugGuardado.endsWith("_single")
    : !!roomsGuardado?.tipo && (Number(roomsGuardado.dobles) || 0) === 0 && storedPeople > 1;
  const [modality, setModality] = useState(() => {
    if (filasGuardadas.length > 0) return MODALIDAD_A_MEDIDA;
    if (tipoGuardado) return MODALITY_LABELS[`${tipoGuardado}_${todosIndividualesGuardado ? "single" : "doble"}`];
    return quote.modality ?? "";
  });
  const aMedida = modality === MODALIDAD_A_MEDIDA;
  const roomTotals = useMemo(() => totalesHabitacion(roomRows), [roomRows]);
  const [people, setPeople] = useState<number>(storedPeople);
  const [startDate, setStartDate] = useState<string>(quote.start_date ?? "");
  const [endDate, setEndDate] = useState<string>(quote.end_date ?? "");
  const [autoLink, setAutoLink] = useState(true); // true = recalcular cuando cambian ruta/modalidad/personas

  /**
   * Cambiar de ruta: nombre, `route_id` y la fecha de fin, que es la que depende de los días
   * de la ruta. Se recalcula acá y no en un efecto para que abrir un expediente no le mueva
   * la fecha a nadie: solo se mueve cuando de verdad se elige otra ruta (mismo criterio que
   * el del autorrelleno de precios, §2.4). Los precios los recalcula `firmaTarifa`.
   */
  function elegirRuta(nombre: string) {
    const r = routes.find((x) => x.name === nombre) ?? null;
    setRouteName(nombre);
    setRouteId(r?.id ?? null);
    const dias = Number(r?.days) || 0;
    if (dias > 0 && startDate) {
      const fin = new Date(new Date(startDate + "T00:00:00").getTime() + (dias - 1) * 86400000);
      setEndDate(fin.toISOString().slice(0, 10));
    }
  }

  // Detección de temporada según fechas actuales — se recalcula al cambiar start/end/people
  const season = useMemo(
    () => detectSeason(startDate || null, endDate || null, seasonConfig),
    [startDate, endDate, seasonConfig],
  );
  const seasonSuppCs = season.surcharge_per_person_cs * people;
  const seasonSuppPilgrim = season.surcharge_per_person_pilgrim * people;

  // La tarifa que aplica es la del AÑO DE SALIDA (ver @/lib/pricing/year).
  const tarifaYear = quoteYear(startDate);
  const yearRates = useMemo(() => ratesForYear(pricing, tarifaYear), [pricing, tarifaYear]);
  const yearHasRates = !!routeName && yearRates.some((p) => p.route_name === routeName && p.price_cs > 0);
  // Catálogo del año por slug. `price_cs > 0`: una fila de tarifa creada y vacía no es una
  // tarifa; sin esto el autorrelleno pondría la base en 0,00 € (§2.4).
  const catalogBySlug = useMemo(() => {
    const out: Partial<Record<ModalitySlug, { price_cs: number; price_pilgrim: number }>> = {};
    if (!routeName) return out;
    for (const row of yearRates) {
      if (row.route_name !== routeName || row.price_cs <= 0) continue;
      out[row.modality_slug as ModalitySlug] = { price_cs: row.price_cs, price_pilgrim: row.price_pilgrim };
    }
    return out;
  }, [routeName, yearRates]);

  // ---- Reparto vivo: el que decide qué precios por persona hacen falta ----
  const tipoElegido = aMedida ? null : tipoDeEtiqueta(modality);
  const esTipo = tipoElegido != null;
  const libre = !esTipo && !aMedida;
  const todosIndividuales = modalityToSlug(modality)?.endsWith("_single") ?? false;
  const { dobles, individuales } = esTipo ? repartoAutomatico(people, todosIndividuales) : { dobles: 0, individuales: 0 };

  // ---- Precios POR PERSONA (ver @/lib/quotes/precioPorPersona) ----
  //
  // `rates`: mi precio de venta por persona por modalidad = las tarjetas del PDF. Se leen
  // de `price_blocks`; para las habitaciones del reparto guardado que no estén ahí, de las
  // tarifas de `rooms_json`; y si el grupo entero va en una sola habitación, de base ÷
  // personas. Así una cotización vieja abre con SU precio por persona, no con el catálogo.
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [slug, v] of Object.entries(quote.price_blocks ?? {})) {
      const n = positivo(v);
      if (n > 0) out[slug] = n.toFixed(2);
    }
    if (tipoGuardado && filasGuardadas.length === 0) {
      const r0 = repartoAutomatico(storedPeople, todosIndividualesGuardado);
      const slots = slotsDelReparto(tipoGuardado, r0.dobles, r0.individuales);
      for (const slug of slots) {
        if (out[slug]) continue;
        const deRooms = positivo(slug.endsWith("_doble") ? roomsGuardado?.tarifa_doble : roomsGuardado?.tarifa_single);
        if (deRooms > 0) out[slug] = deRooms.toFixed(2);
        else if (slots.length === 1 && storedBase > 0) out[slug] = dosDecimales(storedBase / storedPeople);
      }
    }
    return out;
  });
  // `pilgrimRates`: el costo Pilgrim por persona de cada habitación cobrada. De
  // `rooms_json.pilgrim_*` (migración 0038); en cotizaciones anteriores, de costo ÷ personas
  // (si el grupo va en una sola habitación) o del catálogo cuando el costo guardado coincide
  // con él. Si nada de eso aplica, se reparte el costo guardado por igual y se avisa.
  const [pilgrimRates, setPilgrimRates] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (!tipoGuardado || filasGuardadas.length > 0) return out;
    const r0 = repartoAutomatico(storedPeople, todosIndividualesGuardado);
    const slots = slotsDelReparto(tipoGuardado, r0.dobles, r0.individuales);
    for (const slug of slots) {
      const deRooms = positivo(slug.endsWith("_doble") ? roomsGuardado?.pilgrim_doble : roomsGuardado?.pilgrim_single);
      if (deRooms > 0) out[slug] = deRooms.toFixed(2);
    }
    const faltan = slots.filter((s) => !out[s]);
    if (faltan.length === 0 || storedCost <= 0) return out;
    if (slots.length === 1) {
      out[slots[0]] = dosDecimales(storedCost / storedPeople);
      return out;
    }
    // Dos habitaciones sin costo desglosado: el catálogo del año de salida, si cuadra.
    const year0 = quoteYear(quote.start_date);
    const cat = new Map(
      ratesForYear(pricing, year0)
        .filter((p) => p.route_name === quote.route_name && p.price_pilgrim > 0)
        .map((p) => [p.modality_slug, p.price_pilgrim] as const),
    );
    const personasDe = (slug: string) => (slug.endsWith("_doble") ? r0.dobles * 2 : r0.individuales);
    const sumaCat = slots.reduce((s, slug) => s + personasDe(slug) * (cat.get(slug) ?? 0), 0);
    if (slots.every((s) => cat.has(s)) && Math.abs(sumaCat - storedCost) < 0.01) {
      for (const slug of faltan) out[slug] = (cat.get(slug) ?? 0).toFixed(2);
    } else {
      for (const slug of faltan) out[slug] = dosDecimales(storedCost / storedPeople);
    }
    return out;
  });
  // Alojamiento de texto libre: un precio por persona para todo el grupo.
  const [libreCs, setLibreCs] = useState(() => (storedBase > 0 ? dosDecimales(storedBase / storedPeople) : ""));
  const [librePilgrim, setLibrePilgrim] = useState(() => (storedCost > 0 ? dosDecimales(storedCost / storedPeople) : ""));

  // Mismos slots que el asistente: los que el reparto de habitaciones necesita, para los
  // dos tipos de alojamiento. El del tipo elegido cobra; el otro es la tarjeta del PDF.
  const rateSlots = useMemo(() => {
    const slots: Array<{ slug: ModalitySlug; tipo: TipoAlojamiento; label: string }> = [];
    for (const tipo of ["pension", "hotel"] as const) {
      for (const slug of slotsDelReparto(tipo, dobles, individuales)) slots.push({ slug, tipo, label: MODALITY_LABELS[slug] });
    }
    return slots;
  }, [dobles, individuales]);

  // Precarga las tarjetas del PDF y el costo Pilgrim con el catálogo del año.
  const ratesFromCatalog = () => {
    const cs: Record<string, string> = {};
    const pilgrim: Record<string, string> = {};
    for (const slug of MODALITY_SLUGS) {
      const r = catalogBySlug[slug];
      if (!r) continue;
      cs[slug] = r.price_cs.toFixed(2);
      if (r.price_pilgrim > 0) pilgrim[slug] = r.price_pilgrim.toFixed(2);
    }
    return { cs, pilgrim };
  };
  const catalogoCubre = esTipo && slotsDelReparto(tipoElegido, dobles, individuales).every((s) => !!catalogBySlug[s]);

  const recomputeFromCatalog = () => {
    if (!catalogoCubre) return;
    const { cs, pilgrim } = ratesFromCatalog();
    setRates(cs);
    setPilgrimRates(pilgrim);
  };

  // Lo que determina la tarifa del catálogo. Mientras no cambie, no hay nada que
  // recalcular: el precio guardado manda.
  const firmaTarifa = `${routeName}|${modality}|${people}|${tarifaYear}`;
  const firmaAplicada = useRef(firmaTarifa);

  // Auto-fill cuando cambian ruta/modalidad/personas/año y autoLink está activo.
  //
  // La comparación contra `firmaAplicada` es el arreglo de un hallazgo con dinero real
  // detrás (§2.4): antes este efecto también corría AL MONTAR, así que abrir un expediente
  // —sin tocar nada— devolvía la base al precio de catálogo y pisaba la cifra tecleada a
  // mano. Pasó en dos cotizaciones ya enviadas al cliente: CS-2026-077 (585 € tecleados
  // contra 625 de catálogo) y CS-2026-060 (800 contra 790). Tecleado a mano no es un
  // descuido: es lo que Nico hace cuando el año de salida todavía no tiene tarifa cargada.
  //
  // Se guarda la firma en vez de "saltar el primer render" porque eso último se rompe con
  // el doble montaje de StrictMode en desarrollo, y porque así el ida y vuelta funciona:
  // cambiar 2 → 3 → 2 personas vuelve a tarifar en los dos saltos.
  useEffect(() => {
    if (firmaTarifa === firmaAplicada.current) return;
    firmaAplicada.current = firmaTarifa;
    if (!autoLink) return;
    if (!catalogoCubre) return; // sin catálogo, lo tecleado se queda (o se teclea)
    const { cs, pilgrim } = ratesFromCatalog();
    setRates(cs);
    setPilgrimRates(pilgrim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaTarifa, autoLink, catalogoCubre]);

  // Reparto a medida: las personas salen de las habitaciones. Igual que en el asistente,
  // si las personas quedaran sueltas el suplemento de temporada (por persona) contaría un
  // grupo distinto al de la base.
  useEffect(() => {
    if (!aMedida) return;
    if (roomTotals.personas > 0) setPeople(roomTotals.personas);
  }, [aMedida, roomTotals.personas]);

  // Editar un precio a mano corta el auto-fill: si no, el efecto lo pisaría enseguida.
  function setRate(slug: string, value: string) {
    setAutoLink(false);
    setRates((prev) => ({ ...prev, [slug]: value }));
  }
  function setPilgrimRate(slug: string, value: string) {
    setAutoLink(false);
    setPilgrimRates((prev) => ({ ...prev, [slug]: value }));
  }

  // Los renglones del precio por persona: de acá sale TODA la plata del grupo.
  const renglones = useMemo(() => {
    if (aMedida) return renglonesDeFilas(roomRows);
    if (esTipo) return renglonesDelReparto(tipoElegido, dobles, individuales, rates, pilgrimRates);
    return renglonLibre(modality || "Alojamiento", people, numOrNull(libreCs) ?? 0, numOrNull(librePilgrim) ?? 0);
  }, [aMedida, esTipo, tipoElegido, roomRows, modality, dobles, individuales, rates, pilgrimRates, people, libreCs, librePilgrim]);
  const totales = useMemo(() => totalesDeRenglones(renglones), [renglones]);
  const baseEur = totales.baseEur;
  const costBaseEur = totales.costBaseEur;
  const faltaPrecio = renglones.filter((r) => r.personas > 0 && r.cs <= 0).map((r) => r.etiqueta);
  const chosenComplete = faltaPrecio.length === 0 && renglones.some((r) => r.personas > 0);
  // Lo derivado no cuadra con lo guardado: pasa en cotizaciones viejas con grupo impar
  // (la base se calculaba como doble × personas, sin la individual) o con la base tecleada
  // como total. Se avisa; al guardar manda el precio por persona.
  const baseCambia = Math.abs(baseEur - storedBase) >= 0.01;
  const costCambia = Math.abs(costBaseEur - storedCost) >= 0.01;

  // ¿El precio salió del catálogo tal cual, o lo puso Nico? Si lo puso Nico, la cotización
  // guarda la nota interna que dice que es POR PERSONA. Una cotización que ya tenía la
  // nota y cuya plata no se tocó la conserva: que la ruta tenga hoy esas mismas tarifas en
  // el catálogo (ruta personalizada) no cambia que se pusieron a mano.
  const precioManual = useMemo(() => {
    if (aMedida || libre || !tipoElegido) return true;
    if (quote.manual_price_note && !baseCambia && !costCambia) return true;
    for (const slug of slotsDelReparto(tipoElegido, dobles, individuales)) {
      const cat = catalogBySlug[slug];
      if (!cat) return true;
      if ((numOrNull(rates[slug]) ?? 0) !== cat.price_cs) return true;
      if ((numOrNull(pilgrimRates[slug]) ?? 0) !== cat.price_pilgrim) return true;
    }
    return false;
  }, [aMedida, libre, quote.manual_price_note, baseCambia, costCambia, tipoElegido, dobles, individuales, catalogBySlug, rates, pilgrimRates]);
  const notaPrecio = useMemo(
    () => (precioManual && chosenComplete
      ? notaPrecioPorPersona({ renglones, origen: aMedida ? "a_medida" : libre ? "libre" : "a_mano", year: tarifaYear })
      : null),
    [precioManual, chosenComplete, renglones, aMedida, libre, tarifaYear],
  );

  // Solo ruta + suplemento: los opcionales no se editan acá, así que esta cifra es
  // la utilidad DE LA RUTA. La utilidad completa es el KPI de arriba, que sí los suma.
  const utilidadPreview = baseEur + seasonSuppCs - (costBaseEur + seasonSuppPilgrim);

  async function onSubmit(formData: FormData) {
    setError(null);
    if (!chosenComplete) {
      setError(
        faltaPrecio.length > 0
          ? `Ponele tu precio por persona en: ${faltaPrecio.join(", ")}. Sin eso la cotización queda en cero.`
          : "Agregá al menos una habitación al reparto.",
      );
      return;
    }
    // La base y el costo Pilgrim son SIEMPRE personas × precio por persona.
    formData.set("total_eur", baseEur.toFixed(2));
    formData.set("cost_base_eur", costBaseEur.toFixed(2));
    formData.set("people", String(people));
    formData.set("route_name", routeName);
    // La ruta del catálogo detrás del nombre: de acá salen las etapas del PDF, las bicis,
    // el pedido a Pilgrim y la documentación de viaje. Vacío = ruta de texto libre.
    formData.set("route_id", routeId ?? "");
    formData.set("start_date", startDate);
    formData.set("end_date", endDate);
    formData.set("season_supplement_eur", seasonSuppCs.toFixed(2));
    formData.set("season_supplement_cost_eur", seasonSuppPilgrim.toFixed(2));
    formData.set("season_kind", season.type);
    formData.set("manual_price_note", notaPrecio ?? "");

    if (aMedida) {
      // El reparto manda: etiqueta, desglose del resumen del PDF y tarjetas de precio.
      const filas = roomRows.filter((r) => r.habitaciones > 0);
      formData.set("modality", etiquetaHabitaciones(filas));
      formData.set("rooms_json", JSON.stringify(roomsJsonAMedida(filas)));
      formData.set("price_blocks", JSON.stringify(priceBlocksDeFilas(filas)));
    } else if (esTipo) {
      // La etiqueta es la del reparto REAL (mismo texto que el asistente y la web): con 3
      // personas dice "1 doble + 1 individual", que es lo que el PDF sabe desglosar en dos
      // tarjetas. "Pensión doble" a secas con grupo impar hacía que el PDF pintara una sola
      // tarjeta con la base ÷ personas, un precio que nadie paga.
      formData.set("modality", etiquetaReparto(tipoElegido, dobles, individuales));
      // El reparto se REESCRIBE con las personas y la modalidad actuales, con la tarifa y
      // el costo Pilgrim POR PERSONA de cada habitación (§2.4 y migración 0038): de este
      // campo salen la línea "Habitaciones" del pedido a Pilgrim, la acomodación del
      // contrato y las tarjetas del PDF.
      formData.set(
        "rooms_json",
        JSON.stringify({
          tipo: tipoElegido,
          dobles,
          individuales,
          tarifa_doble: numOrNull(rates[`${tipoElegido}_doble`]) ?? 0,
          tarifa_single: numOrNull(rates[`${tipoElegido}_single`]) ?? 0,
          pilgrim_doble: numOrNull(pilgrimRates[`${tipoElegido}_doble`]) ?? 0,
          pilgrim_single: numOrNull(pilgrimRates[`${tipoElegido}_single`]) ?? 0,
        }),
      );
      // Precios de las tarjetas del PDF: solo los que tienen valor.
      const blocks: Record<string, number> = {};
      for (const { slug } of rateSlots) {
        const v = numOrNull(rates[slug]) ?? 0;
        if (v > 0) blocks[slug] = v;
      }
      formData.set("price_blocks", Object.keys(blocks).length > 0 ? JSON.stringify(blocks) : "");
    } else {
      formData.set("modality", modality);
      // Alojamiento libre: no hay un reparto correcto que escribir, y dejar el viejo haría
      // que el PDF dibujara habitaciones que ya no son las de esta cotización. Se borra; el
      // PDF saca su única tarjeta de base ÷ personas, que es justo el precio por persona.
      if (quote.rooms_json != null) formData.set("rooms_json", "");
      formData.set("price_blocks", "");
    }
    startTransition(async () => {
      const r = await updateQuote(quote.id, formData);
      if (r?.error) setError(r.error);
      else {
        // Guardar regenera el PDF; si eso falla se avisa sin cerrar el formulario, porque
        // el documento que ve el cliente quedó con los datos viejos.
        if ("aviso" in r && r.aviso) setError(r.aviso);
        else setEditing(false);
      }
    });
  }

  if (!editing) {
    return (
      <section className="bg-bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-bosque">Datos de la cotización</h2>
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
          >
            Editar
          </button>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <Field label="Cliente" v={quote.client_name} />
          <Field label="Teléfono" v={quote.client_phone} mono />
          <Field label="Email" v={quote.client_email} />
          <Field label="Ruta" v={quote.route_name} />
          <Field label="Personas" v={quote.people} />
          <Field label="Alojamiento" v={quote.modality} />
          <Field label="Fecha inicio" v={quote.start_date} />
          <Field label="Fecha fin" v={quote.end_date} />
          <Field label="Válida hasta" v={quote.valid_until} />
          <div className="col-span-2 md:col-span-3">
            <dt className="text-xs text-muted">Precio por persona (sin suplemento ni opcionales)</dt>
            <dd className="mt-0.5 tabular-nums">{precioPorPersonaGuardado(quote)}</dd>
          </div>
          <Field label="Base ruta € (grupo)" v={quote.base_eur != null ? Number(quote.base_eur).toFixed(2) : null} />
          <Field
            label="Suplemento temporada €"
            v={
              quote.season_kind && quote.season_kind !== "regular" && Number(quote.season_supplement_eur) > 0
                ? `${Number(quote.season_supplement_eur).toFixed(2)} (${quote.season_kind === "easter" ? "Semana Santa" : "alta"})`
                : null
            }
          />
          <Field label="Total cotización €" v={quote.total_eur != null ? Number(quote.total_eur).toFixed(2) : null} />
          <Field label="Base Pilgrim € (grupo)" v={quote.cost_base_eur != null ? Number(quote.cost_base_eur).toFixed(2) : null} />
          <Field
            label="Suplemento temporada Pilgrim €"
            v={Number(quote.season_supplement_cost_eur) > 0 ? Number(quote.season_supplement_cost_eur).toFixed(2) : null}
          />
          <Field label="Costo Pilgrim total €" v={quote.cost_eur != null ? Number(quote.cost_eur).toFixed(2) : null} />
          <Field label="Estado" v={statusLabel(quote.status)} />
        </dl>
        {/* La nota de precio puesto a mano va arriba de las notas libres y con su propio
            color: es lo primero que tiene que ver quien abra este expediente sin haberlo
            cotizado, igual que la nota "precio por persona" de las cotizaciones de Pilgrim. */}
        {quote.manual_price_note && (
          <div className="mt-4 rounded-md border border-dorado-oscuro/40 bg-dorado-oscuro/10 px-3 py-2 text-xs">
            <div className="font-medium text-dorado-oscuro mb-0.5">Precio puesto a mano · por persona</div>
            <div className="text-fg">{quote.manual_price_note}</div>
          </div>
        )}
        {quote.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-xs text-muted mb-1">Notas</div>
            <div className="text-sm whitespace-pre-wrap">{quote.notes}</div>
          </div>
        )}
      </section>
    );
  }

  // Modo edición
  const conocidas = [...MODALITY_DISPLAY.map((m) => m.label), ...EXTRA_MODALITIES];
  // Una etiqueta libre que no está en la lista ("Doble + Triple" vieja con otro texto) se
  // agrega para que el select no muestre otra cosa y guardar no le cambie el alojamiento.
  const allModalities = modality && !conocidas.includes(modality) ? [modality, ...conocidas] : conocidas;

  return (
    <section className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg text-bosque">Editar cotización</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
          >
            Cancelar
          </button>
        </div>
      </div>
      <form action={onSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <Input label="Cliente" name="client_name" defaultValue={quote.client_name} />
        <Input label="Teléfono" name="client_phone" defaultValue={quote.client_phone} placeholder="+57 ..." />
        <Input label="Email" name="client_email" type="email" defaultValue={quote.client_email} />

        {/* Empresa contratante. Los campos de arriba se quedan: siguen siendo el contacto
            humano con quien se habla. Lo de acá es quién firma y a quién se le factura. */}
        <div className="md:col-span-3 border border-border rounded-lg bg-crema/40">
          <label className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={conEmpresa}
              onChange={(e) => setConEmpresa(e.target.checked)}
            />
            <span className="font-medium text-bosque">Contrata una empresa</span>
            <span className="text-muted">
              — el contrato sale a nombre de la empresa, uno solo para todo el grupo, y lo firma su representante legal
            </span>
          </label>

          {conEmpresa ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-3 pb-3">
              <Input label="Razón social" name="company_legal_name" defaultValue={company?.legal_name} placeholder="COLEGIO SAN JOSÉ S.A.S." />
              <Input label="NIT" name="company_nit" defaultValue={company?.nit} placeholder="900.123.456-7" />
              <Input label="Correo de notificaciones" name="company_email" type="email" defaultValue={company?.email} />
              <Input label="Dirección de notificaciones" name="company_address" defaultValue={company?.address} placeholder="Calle 100 # 15-20, of. 401" />
              <Input label="Ciudad" name="company_city" defaultValue={company?.city} placeholder="Bogotá D.C." />
              <Input label="Teléfono de la empresa" name="company_phone" defaultValue={company?.phone} />
              <Input label="Representante legal" name="company_rep_name" defaultValue={company?.rep_name} />
              <label className="block">
                <span className="text-xs text-muted">Tipo de documento del representante</span>
                <select
                  name="company_rep_document_type"
                  defaultValue={company?.rep_document_type ?? "Cédula de ciudadanía"}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
                >
                  <option>Cédula de ciudadanía</option>
                  <option>Cédula de extranjería</option>
                  <option>Pasaporte</option>
                </select>
              </label>
              <Input label="Documento del representante" name="company_rep_document_number" defaultValue={company?.rep_document_number} />
              <p className="md:col-span-3 text-[11px] text-muted">
                La empresa se identifica por el NIT: si ya cotizó antes, se actualiza su ficha en vez de duplicarla.
              </p>
            </div>
          ) : (
            // Campos vacíos ocultos: sin ellos el formulario no manda nada y `updateQuote`
            // no sabría que hay que desvincular la empresa al desmarcar la casilla.
            <>
              <input type="hidden" name="company_legal_name" value="" />
              <input type="hidden" name="company_nit" value="" />
            </>
          )}
        </div>

        {/* Ruta: Camino → desde dónde, igual que el asistente. Cambiarla vuelve a tarifar
            con el catálogo del año de salida y recalcula la fecha de fin con sus días. */}
        <label className="block">
          <span className="text-xs text-muted">Camino</span>
          <select
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
          >
            <option value="">— Elegí un Camino —</option>
            {families.map((f) => <option key={f} value={f}>{f}</option>)}
            <option value={RUTA_LIBRE}>Ruta fuera del catálogo (texto libre)</option>
          </select>
        </label>

        {rutaLibre ? (
          <label className="block md:col-span-2">
            <span className="text-xs text-muted">Ruta</span>
            <input
              value={routeName}
              onChange={(e) => { setRouteName(e.target.value); setRouteId(null); }}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
            <span className="text-[11px] text-dorado-oscuro mt-0.5 inline-block">
              Escrita a mano: el PDF sale sin etapas ni tarjetas de precio, y no hay tarifas del catálogo.
            </span>
          </label>
        ) : (
          <label className="block md:col-span-2">
            <span className="text-xs text-muted">Desde</span>
            <select
              value={routeName}
              onChange={(e) => elegirRuta(e.target.value)}
              disabled={!family}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{family ? "— Elegí desde dónde —" : "Primero elegí un Camino"}</option>
              {rutasDelCamino.map((r) => {
                // La ruta de ahora sale marcada cuando es de otro Camino: así se ve que el
                // desplegable todavía muestra la que hay y que no cambió nada por filtrar.
                const deOtroCamino = family === SIN_FAMILIA ? !!r.family : r.family !== family;
                return (
                  <option key={r.id} value={r.name}>
                    {r.name}{r.days ? ` · ${r.days} días` : ""}{r.km ? ` · ${r.km} km` : ""}
                    {deOtroCamino ? " · la de ahora" : ""}
                  </option>
                );
              })}
            </select>
            {selectedRoute && (
              <span className="text-[11px] text-bosque mt-0.5 inline-block">
                {selectedRoute.days ? `${selectedRoute.days} días · ` : ""}etapas del catálogo
                {routeName !== (quote.route_name ?? "") ? " · se vuelve a tarifar al guardar" : ""}
              </span>
            )}
          </label>
        )}

        <label className="block">
          <span className="text-xs text-muted">Estado</span>
          <select name="status" defaultValue={quote.status ?? DEFAULT_STATUS} className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white">
            {QUOTE_STATUSES.map((o) => <option key={o} value={o}>{STATUS_LABELS[o]}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-muted">Fecha inicio</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Fecha fin</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
          />
        </label>
        <Input label="Válida hasta" name="valid_until" type="date" defaultValue={quote.valid_until} />

        <label className="block">
          <span className="text-xs text-muted">
            Personas
            {aMedida && <span className="text-bosque ml-1">· del reparto</span>}
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={people}
            readOnly={aMedida}
            onChange={(e) => setPeople(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
            className={`mt-1 w-full px-3 py-2 rounded-md border border-border ${aMedida ? "bg-taupe/40 text-muted" : "bg-white"}`}
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs text-muted">Alojamiento</span>
          <select
            value={modality}
            onChange={(e) => setModality(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
          >
            <option value="">—</option>
            {allModalities.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <span className="text-[11px] text-muted mt-0.5 inline-block">
            {esTipo
              ? `Reparto: ${dobles > 0 ? `${dobles} hab. ${dobles === 1 ? "doble" : "dobles"}` : ""}${dobles > 0 && individuales > 0 ? " + " : ""}${individuales > 0 ? `${individuales} individual${individuales === 1 ? "" : "es"}` : ""} para ${people} ${people === 1 ? "persona" : "personas"}. Se guarda como «${etiquetaReparto(tipoElegido, dobles, individuales)}».`
              : aMedida
                ? `Reparto tecleado abajo: ${roomTotals.habitaciones} hab. para ${roomTotals.personas} ${roomTotals.personas === 1 ? "persona" : "personas"}.`
                : "Alojamiento de texto libre: un precio por persona para todo el grupo. Si cada habitación tiene su precio, elegí \"Habitaciones a medida\"."}
          </span>
        </label>

        {/* Bloque precios con auto-fill */}
        <div className="md:col-span-3 bg-taupe/30 border border-border rounded-lg p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLink}
                  onChange={(e) => setAutoLink(e.target.checked)}
                  className="rounded border-border"
                />
                <span>Auto-cargar precios del catálogo</span>
              </label>
              <div className="space-y-0.5">
                {aMedida ? (
                  <div className="text-bosque">
                    Reparto a medida: la base y el costo Pilgrim salen de las habitaciones de abajo.
                  </div>
                ) : catalogoCubre ? (
                  <div className="text-bosque">
                    Catálogo {tarifaYear} por persona:{" "}
                    {slotsDelReparto(tipoElegido, dobles, individuales)
                      .map((s) => `${MODALITY_LABELS[s]} ${eurPP(catalogBySlug[s]!.price_cs)} (Pilgrim ${eurPP(catalogBySlug[s]!.price_pilgrim)})`)
                      .join(" · ")}
                  </div>
                ) : libre ? (
                  <div className="text-muted italic">Alojamiento libre — sin precio en catálogo</div>
                ) : !routeName || !modality ? (
                  <div className="text-muted">Elegí ruta y alojamiento para ver el catálogo</div>
                ) : !yearHasRates ? (
                  <div className="text-amber-700 font-medium">
                    ⚠ No hay tarifas {tarifaYear} cargadas para esta ruta — ingresá los precios por persona a mano.
                  </div>
                ) : (
                  <div className="text-amber-700">Sin precio {tarifaYear} en catálogo para este reparto de habitaciones</div>
                )}
                {season.type !== "regular" && (
                  <div className="text-dorado-oscuro font-medium">
                    ⚡ {season.label}: +{season.surcharge_per_person_cs}€/persona (costo Pilgrim +{season.surcharge_per_person_pilgrim}€/persona)
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={recomputeFromCatalog}
              disabled={!catalogoCubre}
              className="text-xs px-3 py-1 rounded-md border border-border bg-white hover:bg-taupe/40 disabled:opacity-40 transition"
            >
              Cargar del catálogo
            </button>
          </div>

          {/* Reparto a medida: una fila por tipo de habitación, con su precio de venta y su
              costo Pilgrim, ambos por persona. */}
          {aMedida && <RoomsPanel rows={roomRows} onChange={setRoomRows} people={people} />}

          {/* Precios POR PERSONA del reparto automático. Los del tipo elegido arman la base
              del grupo y el costo Pilgrim; los del otro tipo son la tarjeta comparativa del
              PDF. Vacía = esa tarjeta no se dibuja. */}
          {esTipo && rateSlots.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-muted">
                <strong className="text-fg">Todos los precios son por persona</strong>, sin suplemento. La base del
                grupo se calcula sola: personas de cada habitación × precio. Dejá en blanco el
                alojamiento que no querés ofrecer en el PDF.
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {rateSlots.map((slot) => {
                  const elegido = slot.tipo === tipoElegido;
                  const personasSlot = slot.slug.endsWith("_doble") ? dobles * 2 : individuales;
                  const cs = numOrNull(rates[slot.slug]) ?? 0;
                  const pil = numOrNull(pilgrimRates[slot.slug]) ?? 0;
                  return (
                    <div key={slot.slug} className={`rounded-md border p-2 space-y-1.5 ${elegido ? "border-bosque bg-white" : "border-border bg-white/60"}`}>
                      <div className={`text-xs ${elegido ? "text-bosque font-medium" : "text-muted"}`}>
                        {slot.label}
                        {elegido ? ` · cobrado · ${personasSlot} ${personasSlot === 1 ? "persona" : "personas"}` : " · solo tarjeta del PDF"}
                      </div>
                      <label className="block">
                        <span className="text-[11px] text-muted">Mi precio € / persona</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rates[slot.slug] ?? ""}
                          onChange={(e) => setRate(slot.slug, e.target.value)}
                          placeholder="—"
                          className={`mt-0.5 w-full px-2.5 py-1.5 rounded-md border bg-white text-sm font-medium text-bosque ${elegido ? "border-bosque/60" : "border-border"}`}
                        />
                      </label>
                      {elegido && (
                        <label className="block">
                          <span className="text-[11px] text-muted">Costo Pilgrim € / persona</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={pilgrimRates[slot.slug] ?? ""}
                            onChange={(e) => setPilgrimRate(slot.slug, e.target.value)}
                            placeholder="—"
                            className="mt-0.5 w-full px-2.5 py-1.5 rounded-md border border-border bg-white text-sm"
                          />
                        </label>
                      )}
                      {elegido && (
                        <div className="text-[11px] text-muted tabular-nums">
                          {personasSlot} × {eurPP(cs)} = <span className="text-bosque font-medium">{eurPP(personasSlot * cs)}</span>
                          {pil > 0 && <> · Pilgrim {eurPP(personasSlot * pil)}</>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Alojamiento libre: un precio por persona para todo el grupo. */}
          {libre && (
            <div className="space-y-2">
              <div className="text-xs text-muted">
                <strong className="text-fg">Precio por persona</strong> para las {people} {people === 1 ? "persona" : "personas"} del grupo, sin
                suplemento. La base se calcula sola.
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="block">
                  <span className="text-xs text-bosque font-medium">Mi precio € / persona</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={libreCs}
                    onChange={(e) => setLibreCs(e.target.value)}
                    placeholder="—"
                    className="mt-1 w-full px-3 py-2 rounded-md border border-bosque bg-white font-medium text-bosque"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted">Costo Pilgrim € / persona</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={librePilgrim}
                    onChange={(e) => setLibrePilgrim(e.target.value)}
                    placeholder="—"
                    className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
                  />
                </label>
                <div className="col-span-2 self-end pb-2 text-[11px] text-muted tabular-nums">
                  {people} × {eurPP(numOrNull(libreCs) ?? 0)} = <span className="text-bosque font-medium">{eurPP(baseEur)}</span>
                  {costBaseEur > 0 && <> · Pilgrim {people} × {eurPP(numOrNull(librePilgrim) ?? 0)} = {eurPP(costBaseEur)}</>}
                </div>
              </div>
            </div>
          )}

          {/* La plata del grupo, de solo lectura: siempre es personas × precio por persona. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-border/60">
            <div>
              <div className="text-xs text-muted">Base grupo € (sin suplemento ni opcionales) · calculado</div>
              <div className="text-bosque font-medium text-base tabular-nums">{eurPP(baseEur)}</div>
              {season.type !== "regular" && (
                <div className="text-[10px] text-dorado-oscuro">+ {eurPP(seasonSuppCs)} suplemento → total cliente {eurPP(baseEur + seasonSuppCs)}</div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted">Costo Pilgrim grupo € · calculado</div>
              <div className="text-fg font-medium text-base tabular-nums">{eurPP(costBaseEur)}</div>
              {season.type !== "regular" && costBaseEur > 0 && (
                <div className="text-[10px] text-dorado-oscuro">+ {eurPP(seasonSuppPilgrim)} suplemento → {eurPP(costBaseEur + seasonSuppPilgrim)}</div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted">Utilidad de ruta (sin opcionales)</div>
              <div className="text-bosque font-medium text-base tabular-nums">{eurPP(utilidadPreview)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Personas</div>
              <div className="font-medium text-base tabular-nums">{totales.personas || people}</div>
            </div>
          </div>
          {faltaPrecio.length > 0 && (
            <p className="text-xs text-amber-700">⚠ Falta tu precio por persona en: {faltaPrecio.join(", ")}.</p>
          )}
          {(baseCambia || costCambia) && chosenComplete && (
            <p className="text-xs text-amber-700">
              ⚠ La cotización tenía guardada una base de {eurPP(storedBase)} y un costo Pilgrim de {eurPP(storedCost)}.
              Con los precios por persona de arriba queda en {eurPP(baseEur)} y {eurPP(costBaseEur)}. Al guardar manda el precio por persona.
            </p>
          )}

          {/* La nota interna que se guarda cuando el precio no salió del catálogo. */}
          {notaPrecio && (
            <div className="rounded-md border border-dorado-oscuro/40 bg-dorado-oscuro/10 px-3 py-2 text-xs">
              <div className="font-medium text-dorado-oscuro mb-0.5">Nota interna que queda en la cotización (no sale en el PDF)</div>
              <div className="text-fg">{notaPrecio}</div>
            </div>
          )}
        </div>

        <div className="md:col-span-3">
          <label className="block">
            <span className="text-xs text-muted">Notas</span>
            <textarea
              name="notes"
              defaultValue={quote.notes ?? ""}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
          </label>
        </div>

        {error && <div role="alert" className="md:col-span-3 text-sm text-red-800">{error}</div>}

        <div className="md:col-span-3 flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-md bg-bosque text-white text-sm font-medium hover:bg-bosque-medio disabled:opacity-50 transition"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </section>
  );
}

/**
 * El precio por persona tal como quedó guardado, en una línea: por habitación si hay
 * reparto (a medida o automático con tarifas), y si no, base ÷ personas.
 */
function precioPorPersonaGuardado(quote: Quote): string {
  const personas = Math.max(1, Number(quote.people) || 1);
  const base = Number(quote.base_eur ?? quote.total_eur) || 0;
  const filas = leerFilasHabitacion(quote.rooms_json);
  if (filas.length > 0) {
    return renglonesDeFilas(filas)
      .map((r) => `${r.etiqueta} ${eurPP(r.cs)}${r.pilgrim > 0 ? ` (Pilgrim ${eurPP(r.pilgrim)})` : ""} × ${r.personas}`)
      .join(" · ");
  }
  const rooms = (quote.rooms_json ?? null) as Record<string, unknown> | null;
  const tipo = tipoDeEtiqueta(quote.modality) ?? (rooms?.tipo === "hotel" ? "hotel" : rooms?.tipo === "pension" ? "pension" : null);
  if (rooms && tipo && (positivo(rooms.tarifa_doble) > 0 || positivo(rooms.tarifa_single) > 0)) {
    const partes: string[] = [];
    const dobles = Number(rooms.dobles) || 0;
    const individuales = Number(rooms.individuales) || 0;
    if (dobles > 0 && positivo(rooms.tarifa_doble) > 0) {
      const pil = positivo(rooms.pilgrim_doble);
      partes.push(`${MODALITY_LABELS[`${tipo}_doble`]} ${eurPP(positivo(rooms.tarifa_doble))}${pil > 0 ? ` (Pilgrim ${eurPP(pil)})` : ""} × ${dobles * 2}`);
    }
    if (individuales > 0 && positivo(rooms.tarifa_single) > 0) {
      const pil = positivo(rooms.pilgrim_single);
      partes.push(`${MODALITY_LABELS[`${tipo}_single`]} ${eurPP(positivo(rooms.tarifa_single))}${pil > 0 ? ` (Pilgrim ${eurPP(pil)})` : ""} × ${individuales}`);
    }
    if (partes.length > 0) return partes.join(" · ");
  }
  if (base <= 0) return "—";
  const cost = Number(quote.cost_base_eur ?? quote.cost_eur) || 0;
  return `${eurPP(base / personas)} por persona${cost > 0 ? ` (Pilgrim ${eurPP(cost / personas)})` : ""} × ${personas}`;
}

function Field({ label, v, mono }: { label: string; v: unknown; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 ${mono ? "font-mono text-xs" : ""} ${v == null || v === "" ? "text-muted" : ""}`}>
        {v == null || v === "" ? "—" : String(v)}
      </dd>
    </div>
  );
}

function Input({
  label, name, defaultValue, type = "text", placeholder,
}: { label: string; name: string; defaultValue?: string | number | null; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
      />
    </label>
  );
}
