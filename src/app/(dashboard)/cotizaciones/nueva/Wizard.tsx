"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createQuote, findClientByPhone, type ClientLite } from "./actions";
import { createRoute, createItinerary, type NewRoutePrice, type NewStageInput } from "../../catalogo/actions";
import CustomRoutePanel, { emptyCustomRoute, CUSTOM_MODALITIES, type CustomRouteData } from "./CustomRoutePanel";
import RoomsPanel from "@/components/RoomsPanel";
import {
  MODALIDAD_A_MEDIDA,
  etiquetaHabitaciones,
  filaVacia,
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
  totalesDeRenglones,
} from "@/lib/quotes/precioPorPersona";
import { detectSeason, type SeasonSupplements } from "@/lib/seasons";
import { DEFAULT_STATUS, STATUS_LABELS } from "@/lib/quoteStatus";
import { MODALITY_SLUGS, quoteYear, ratesForYear, type ModalitySlug } from "@/lib/pricing/year";

// Etiqueta para agrupar rutas activas sin "family" asignada, así no quedan invisibles en el asistente.
const SIN_FAMILIA = "Otras rutas";
// Valor especial del select de Camino: crear una ruta personalizada en el mismo formulario.
const RUTA_CUSTOM = "__custom__";

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type PricingRow = {
  route_id: string;
  route_name: string;
  modality_slug: string;
  year: number;
  price_pilgrim: number;
  price_cs: number;
};

/** Tarifa por persona de una modalidad, venga del catálogo o de la ruta personalizada. */
type Rate = { price_cs: number; price_pilgrim: number };

// Se elige solo el tipo de alojamiento; el reparto de habitaciones lo hace la
// plataforma con el número de peregrinos (pares en dobles, el impar en individual),
// igual que el cotizador de caminosacro.com (ver webQuote.ts).
const TIPOS = [
  { value: "pension", label: "Pensión" },
  { value: "hotel", label: "Hotel" },
] as const;

// Alojamientos que no salen del reparto automático. "Habitaciones a medida" abre el panel
// donde se teclea el reparto real con un precio por tipo de habitación (ver @/lib/quotes/rooms);
// las otras dos quedan como texto libre y siguen existiendo por las cotizaciones viejas que
// las usan.
const EXTRA_MODALITIES = [MODALIDAD_A_MEDIDA, "Doble + Triple", "Personalizada"];

const todayPlus = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function Wizard({
  routes,
  pricing,
  seasonConfig,
}: {
  routes: { id: string; name: string; family: string | null; origin: string | null; days: number | null; nights: number | null; km: number | null }[];
  pricing: PricingRow[];
  seasonConfig: SeasonSupplements;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Cliente
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [conEmpresa, setConEmpresa] = useState(false);
  const [foundClient, setFoundClient] = useState<ClientLite | null | "loading">(null);

  // Cotización — selección por cascada
  const [family, setFamily] = useState("");
  const [routeName, setRouteName] = useState("");
  // Ruta personalizada creada desde el propio wizard (family === RUTA_CUSTOM)
  const [custom, setCustom] = useState<CustomRouteData>(() => emptyCustomRoute());
  const customMode = family === RUTA_CUSTOM;
  const [modality, setModality] = useState("");
  // Reparto de habitaciones tecleado a mano (modalidad "Habitaciones a medida").
  const [roomRows, setRoomRows] = useState<RoomRow[]>(() => [filaVacia()]);
  const [people, setPeople] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [validUntil, setValidUntil] = useState(todayPlus(30));
  const [notes, setNotes] = useState("");


  // Precios (controlados — auto-fill desde catálogo)
  const [autoLink, setAutoLink] = useState(true);
  // TODO lo que se teclea acá es POR PERSONA (ver @/lib/quotes/precioPorPersona). La base
  // del grupo y el costo Pilgrim no se escriben nunca a mano: se derivan más abajo.
  //
  // `rates`: mi precio de venta por persona por modalidad — son las tarjetas del PDF
  // (comercial.quotes.price_blocks). Se precargan del catálogo cuando hay tarifas del año;
  // si no, se teclean. Las que queden vacías simplemente no salen en el PDF: así una
  // cotización vendida solo en pensión no muestra un precio de hotel que nadie cotizó.
  const [rates, setRates] = useState<Record<string, string>>({});
  // `pilgrimRates`: el costo Pilgrim por persona de cada habitación del tipo cobrado.
  // Pilgrim cotiza siempre por pasajero, así que se copia tal cual de su cotización.
  const [pilgrimRates, setPilgrimRates] = useState<Record<string, string>>({});
  // Alojamiento de texto libre ("Doble + Triple", "Personalizada" o sin elegir): un solo
  // precio por persona para todo el grupo, y su costo Pilgrim, también por persona.
  const [libreCs, setLibreCs] = useState("");
  const [librePilgrim, setLibrePilgrim] = useState("");

  // Buscar cliente por teléfono (debounce 500ms)
  useEffect(() => {
    const phone = clientPhone.trim();
    if (phone.length < 4) {
      setFoundClient(null);
      return;
    }
    const t = setTimeout(async () => {
      setFoundClient("loading");
      const c = await findClientByPhone(phone);
      setFoundClient(c);
      if (c) {
        if (!clientName) setClientName(c.full_name);
        if (!clientEmail && c.email) setClientEmail(c.email);
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientPhone]);

  // Reparto de habitaciones (misma regla que webQuote.ts): pares en doble, el impar en individual.
  const esTipo = modality === "pension" || modality === "hotel";
  const dobles = esTipo ? Math.floor(people / 2) : 0;
  const individuales = esTipo ? people % 2 : 0;

  // Reparto a medida: la plata sale de las filas tecleadas, no del catálogo ni del reparto
  // automático. Es el caso de un grupo que va parte en dobles y parte en triples.
  const aMedida = modality === MODALIDAD_A_MEDIDA;
  const roomTotals = useMemo(() => totalesHabitacion(roomRows), [roomRows]);

  // La tarifa que aplica es la del AÑO DE SALIDA, no la del año en que se cotiza:
  // Pilgrim sube precios cada año (ver @/lib/pricing/year).
  const tarifaYear = quoteYear(startDate);

  // Tarifas del catálogo de esa ruta y ese año, por slug de modalidad. En ruta
  // personalizada salen de lo tecleado en el panel (aún no existen en la DB al cotizar).
  const catalogBySlug = useMemo(() => {
    const out: Partial<Record<ModalitySlug, Rate>> = {};
    if (customMode) {
      for (const slug of MODALITY_SLUGS) {
        const p = custom.prices[slug];
        const cs = numOrNull(p?.cs ?? "");
        if (cs != null && cs > 0) out[slug] = { price_cs: cs, price_pilgrim: numOrNull(p?.pilgrim ?? "") ?? 0 };
      }
      return out;
    }
    if (!routeName) return out;
    for (const row of ratesForYear(pricing, tarifaYear)) {
      if (row.route_name !== routeName || row.price_cs <= 0) continue;
      out[row.modality_slug as ModalitySlug] = { price_cs: row.price_cs, price_pilgrim: row.price_pilgrim };
    }
    return out;
  }, [routeName, pricing, tarifaYear, customMode, custom.prices]);

  // ¿Esta ruta tiene ALGUNA tarifa cargada para el año de salida? Distingue "todavía no
  // cargamos el catálogo {año}" de "falta justo la modalidad que este reparto necesita".
  const yearHasRates = customMode
    ? Object.keys(catalogBySlug).length > 0
    : !!routeName && ratesForYear(pricing, tarifaYear).some((p) => p.route_name === routeName && p.price_cs > 0);

  // El catálogo alcanza si tiene la tarifa de cada habitación que el reparto necesita.
  const ratesOk = esTipo &&
    (dobles === 0 || !!catalogBySlug[`${modality}_doble` as ModalitySlug]) &&
    (individuales === 0 || !!catalogBySlug[`${modality}_single` as ModalitySlug]);

  // Detección de temporada según fecha de inicio + fin
  const season = useMemo(
    () => detectSeason(startDate || null, endDate || null, seasonConfig),
    [startDate, endDate, seasonConfig],
  );

  // Slots de precio a pedir: los que el reparto de habitaciones necesita, para los dos
  // tipos de alojamiento. El del tipo elegido manda la plata; el otro es la tarjeta
  // comparativa del PDF y es opcional.
  const rateSlots = useMemo(() => {
    const slots: Array<{ slug: ModalitySlug; tipo: "pension" | "hotel"; label: string }> = [];
    for (const tipo of ["pension", "hotel"] as const) {
      const nombre = tipo === "hotel" ? "Hotel" : "Pensión";
      if (dobles > 0) slots.push({ slug: `${tipo}_doble`, tipo, label: `${nombre} doble` });
      if (individuales > 0) slots.push({ slug: `${tipo}_single`, tipo, label: `${nombre} individual` });
    }
    return slots;
  }, [dobles, individuales]);

  // Auto-fill desde el catálogo del año, mientras autoLink siga activo. Precarga los DOS
  // tipos: el elegido para cobrar, el otro para la tarjeta comparativa del PDF. El costo
  // Pilgrim por persona se precarga igual: es la otra columna del mismo catálogo.
  useEffect(() => {
    if (!autoLink || !esTipo) return;
    const cs: Record<string, string> = {};
    const pilgrim: Record<string, string> = {};
    for (const slug of MODALITY_SLUGS) {
      const r = catalogBySlug[slug];
      if (!r) continue;
      cs[slug] = r.price_cs.toFixed(2);
      if (r.price_pilgrim > 0) pilgrim[slug] = r.price_pilgrim.toFixed(2);
    }
    setRates(cs);
    setPilgrimRates(pilgrim);
  }, [catalogBySlug, autoLink, esTipo]);

  // Alojamiento de texto libre.
  const libre = !esTipo && !aMedida;

  // Los renglones del precio por persona: qué habitación, cuánta gente, mi precio y el de
  // Pilgrim. De acá sale TODA la plata del grupo; no hay otro camino.
  const renglones = useMemo(() => {
    if (aMedida) return renglonesDeFilas(roomRows);
    if (esTipo) return renglonesDelReparto(modality as "pension" | "hotel", dobles, individuales, rates, pilgrimRates);
    return renglonLibre(modality || "Alojamiento", people, numOrNull(libreCs) ?? 0, numOrNull(librePilgrim) ?? 0);
  }, [aMedida, esTipo, roomRows, modality, dobles, individuales, rates, pilgrimRates, people, libreCs, librePilgrim]);

  // La base del grupo y el costo Pilgrim, sin suplemento de temporada ni opcionales. El
  // suplemento se desglosa al guardar (ver onSubmit) y sale como línea aparte en el PDF.
  const totales = useMemo(() => totalesDeRenglones(renglones), [renglones]);
  const baseEur = totales.baseEur;
  const costBaseEur = totales.costBaseEur;
  // Falta el precio de venta de alguna habitación que el reparto necesita.
  const faltaPrecio = renglones.filter((r) => r.personas > 0 && r.cs <= 0).map((r) => r.etiqueta);
  const chosenComplete = faltaPrecio.length === 0 && renglones.some((r) => r.personas > 0);

  // ¿El precio salió del catálogo tal cual, o lo puso Nico? Si lo puso Nico, la cotización
  // guarda la nota interna que dice que es POR PERSONA (ver @/lib/quotes/precioPorPersona).
  // Una ruta personalizada es siempre precio a mano: sus tarifas se acaban de teclear.
  const precioManual = useMemo(() => {
    if (aMedida || libre || customMode) return true;
    for (const slug of [`${modality}_doble`, `${modality}_single`] as ModalitySlug[]) {
      const necesario = slug.endsWith("_doble") ? dobles > 0 : individuales > 0;
      if (!necesario) continue;
      const cat = catalogBySlug[slug];
      if (!cat) return true;
      if ((numOrNull(rates[slug] ?? "") ?? 0) !== cat.price_cs) return true;
      if ((numOrNull(pilgrimRates[slug] ?? "") ?? 0) !== cat.price_pilgrim) return true;
    }
    return false;
  }, [aMedida, libre, customMode, modality, dobles, individuales, catalogBySlug, rates, pilgrimRates]);
  const notaPrecio = useMemo(
    () => (precioManual && chosenComplete
      ? notaPrecioPorPersona({ renglones, origen: aMedida ? "a_medida" : libre ? "libre" : "a_mano", year: tarifaYear })
      : null),
    [precioManual, chosenComplete, renglones, aMedida, libre, tarifaYear],
  );

  // A medida, las PERSONAS también se derivan del reparto. Si se dejaran sueltas, la base
  // saldría de las habitaciones y el suplemento de temporada (que es por persona) del campo
  // del grupo: dos cifras del mismo grupo que no cuadran entre sí.
  useEffect(() => {
    if (!aMedida) return;
    if (roomTotals.personas > 0) setPeople(roomTotals.personas);
  }, [aMedida, roomTotals.personas]);

  // Editar una tarifa a mano corta el auto-fill: si no, el efecto la pisaría enseguida.
  function setRate(slug: string, value: string) {
    setAutoLink(false);
    setRates((prev) => ({ ...prev, [slug]: value }));
  }
  function setPilgrimRate(slug: string, value: string) {
    setAutoLink(false);
    setPilgrimRates((prev) => ({ ...prev, [slug]: value }));
  }

  // Ruta seleccionada (para días)
  const selectedRoute = useMemo(
    () => routes.find((r) => r.name === routeName) || null,
    [routes, routeName],
  );

  // Familias disponibles + rutas filtradas
  const families = useMemo(() => {
    const set = new Set<string>();
    let hasUnclassified = false;
    routes.forEach((r) => { if (r.family) set.add(r.family); else hasUnclassified = true; });
    const list = [...set].sort();
    if (hasUnclassified) list.push(SIN_FAMILIA); // las rutas sin familia van al final, agrupadas
    return list;
  }, [routes]);

  const familyRoutes = useMemo(
    () => routes
      .filter((r) => (family === SIN_FAMILIA ? !r.family : r.family === family))
      .sort((a, b) => (b.days || 0) - (a.days || 0)),
    [routes, family],
  );

  // Si cambia family y la ruta actual no pertenece, limpio
  useEffect(() => {
    if (!family) return;
    if (routeName && !familyRoutes.some((r) => r.name === routeName)) {
      setRouteName("");
    }
  }, [family, familyRoutes, routeName]);

  // Si seleccioné ruta y no había family, lo seteo
  useEffect(() => {
    if (selectedRoute?.family && !family) setFamily(selectedRoute.family);
  }, [selectedRoute, family]);

  // Días efectivos: de la ruta del catálogo, o los tecleados en la ruta personalizada.
  const effectiveDays = customMode ? numOrNull(custom.days) : selectedRoute?.days ?? null;

  // Auto-calcular fecha fin = inicio + (días de la ruta - 1)
  const [endAuto, setEndAuto] = useState(true);
  useEffect(() => {
    if (!endAuto) return;
    if (!startDate || !effectiveDays) return;
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(start.getTime() + (effectiveDays - 1) * 24 * 60 * 60 * 1000);
    setEndDate(end.toISOString().slice(0, 10));
  }, [startDate, effectiveDays, endAuto]);

  // Suplemento total (grupo) y final con suplemento incluido para preview de utilidad.
  const seasonSuppCs = season.surcharge_per_person_cs * people;
  const seasonSuppPilgrim = season.surcharge_per_person_pilgrim * people;
  const utilidadPreview = useMemo(() => {
    const cliente = baseEur + seasonSuppCs;
    const proveedor = costBaseEur + seasonSuppPilgrim;
    return cliente - proveedor;
  }, [baseEur, costBaseEur, seasonSuppCs, seasonSuppPilgrim]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    // Sin precio por persona no hay cotización: guardar una en cero solo sirve para que
    // alguien la mande así. Vale para los tres modos (reparto automático, a medida y libre).
    if (!chosenComplete) {
      setError(
        faltaPrecio.length > 0
          ? `Ponele tu precio por persona en: ${faltaPrecio.join(", ")}. Sin eso la cotización queda en cero.`
          : "Agregá al menos una habitación al reparto.",
      );
      return;
    }
    // La base y el costo Pilgrim son SIEMPRE personas × precio por persona (ver arriba).
    fd.set("total_eur", baseEur.toFixed(2)); // base = ruta + alojamiento (sin suplemento ni opcionales)
    // Costo Pilgrim desglosado igual que el lado cliente: la base va aparte del
    // suplemento, y el cost_eur total lo arma recompute_quote_money() en la BD.
    fd.set("cost_base_eur", costBaseEur.toFixed(2));
    fd.set("season_supplement_cost_eur", seasonSuppPilgrim.toFixed(2));
    fd.set("people", String(people));
    fd.set("season_supplement_eur", seasonSuppCs.toFixed(2));
    fd.set("season_kind", season.type);
    // La nota interna de "precio por persona": vacía cuando el precio salió del catálogo.
    fd.set("manual_price_note", notaPrecio ?? "");
    // route_id, para que el PDF no tenga que resolver la ruta por nombre.
    if (!customMode && selectedRoute?.id) fd.set("route_id", selectedRoute.id);
    // Etiqueta de modalidad con el reparto real (mismos textos que webQuote.ts).
    if (esTipo) {
      fd.set("modality", etiquetaReparto(modality as "pension" | "hotel", dobles, individuales));
      // Desglose para el PDF y para reabrir el expediente: la tarifa y el costo Pilgrim
      // POR PERSONA de cada habitación, así el total y el desglose siempre cuadran.
      fd.set(
        "rooms_json",
        JSON.stringify({
          tipo: modality,
          dobles,
          individuales,
          tarifa_doble: numOrNull(rates[`${modality}_doble`] ?? "") ?? 0,
          tarifa_single: numOrNull(rates[`${modality}_single`] ?? "") ?? 0,
          pilgrim_doble: numOrNull(pilgrimRates[`${modality}_doble`] ?? "") ?? 0,
          pilgrim_single: numOrNull(pilgrimRates[`${modality}_single`] ?? "") ?? 0,
        }),
      );
    } else if (aMedida) {
      // El reparto tecleado manda en TODO: etiqueta, desglose del resumen y tarjetas del PDF.
      const filas = roomRows.filter((r) => r.habitaciones > 0);
      fd.set("modality", etiquetaHabitaciones(filas));
      fd.set("rooms_json", JSON.stringify(roomsJsonAMedida(filas)));
      fd.set("price_blocks", JSON.stringify(priceBlocksDeFilas(filas)));
    } else {
      fd.set("modality", modality);
    }
    // Precios de las tarjetas del PDF: solo los que tienen valor. Si Nico llenó únicamente
    // pensión, el PDF sale con una sola tarjeta en vez de inventar una comparación con el
    // catálogo (ver migración 0016 y src/lib/quotes/pdf.ts).
    if (esTipo) {
      const blocks: Record<string, number> = {};
      for (const { slug } of rateSlots) {
        const v = numOrNull(rates[slug] ?? "");
        if (v != null && v > 0) blocks[slug] = v;
      }
      fd.set("price_blocks", Object.keys(blocks).length > 0 ? JSON.stringify(blocks) : "");
    }
    if (customMode && !custom.name.trim()) {
      setError("La ruta personalizada necesita un nombre.");
      return;
    }
    startTransition(async () => {
      // Ruta personalizada: primero se crea la ruta (queda en el catálogo, fuera
      // del cotizador web) y su itinerario, reusando las actions del catálogo.
      if (customMode) {
        const prices: NewRoutePrice[] = CUSTOM_MODALITIES.map((m) => ({
          modality: m.slug,
          price_pilgrim: numOrNull(custom.prices[m.slug].pilgrim),
          price_cs: numOrNull(custom.prices[m.slug].cs),
        }));
        const rRoute = await createRoute({
          name: custom.name.trim(),
          family: custom.family.trim() || null,
          origin: custom.origin.trim() || null,
          destination: custom.destination.trim() || null,
          days: numOrNull(custom.days),
          nights: numOrNull(custom.nights),
          km: numOrNull(custom.km),
          modality: "senderismo",
          difficulty: custom.difficulty.trim() || null,
          description: null,
          web: false,
          prices,
          year: tarifaYear, // las tarifas tecleadas son las del año de esta salida
        });
        if ("error" in rRoute && rRoute.error) {
          setError(rRoute.error);
          return;
        }
        const stages: NewStageInput[] = custom.stages
          .filter((s) => s.from_place.trim() || s.to_place.trim() || s.km.trim() || s.accommodation.trim())
          .map((s) => ({
            from_place: s.from_place.trim() || null,
            to_place: s.to_place.trim() || null,
            km: numOrNull(s.km),
            accommodation: s.accommodation.trim() || null,
          }));
        if (stages.length > 0 && "routeId" in rRoute && rRoute.routeId) {
          const rStages = await createItinerary(rRoute.routeId, stages);
          if (rStages?.error) {
            setError(`La ruta se creó pero el itinerario falló: ${rStages.error}`);
            return;
          }
        }
        fd.set("route_name", custom.name.trim());
        if ("routeId" in rRoute && rRoute.routeId) fd.set("route_id", rRoute.routeId);
      }
      // El `redirect()` del éxito viaja como excepción y lo maneja el framework, no este
      // catch. Lo que sí atrapa es un fallo inesperado de la action: sin él la pantalla se
      // quedaba muda, con el botón otra vez listo y sin decir que no se guardó nada.
      try {
        const r = await createQuote(fd);
        if (r?.error) setError(r.error);
        // En caso éxito, el server hace redirect — no llegamos acá
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String(e.digest).startsWith("NEXT_REDIRECT")) throw e;
        setError("No se pudo guardar la cotización. Revisá la conexión y volvé a intentarlo.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* CLIENTE */}
      <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-display text-lg text-bosque">Cliente</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <label className="block">
            <span className="text-xs text-muted">Teléfono *</span>
            <input
              name="client_phone"
              required
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="+57 ..."
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
            {foundClient === "loading" && <span className="text-[11px] text-muted">Buscando…</span>}
            {foundClient && foundClient !== "loading" && (
              <span className="text-[11px] text-bosque">✓ Cliente existente: {foundClient.full_name}</span>
            )}
            {foundClient === null && clientPhone.length >= 4 && (
              <span className="text-[11px] text-amber-700">Cliente nuevo (se creará al guardar)</span>
            )}
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs text-muted">Nombre completo *</span>
            <input
              name="client_name"
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
          </label>
          <label className="block md:col-span-3">
            <span className="text-xs text-muted">Email (opcional)</span>
            <input
              name="client_email"
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
          </label>
        </div>

        {/* Empresa contratante (opcional). Los campos de arriba se quedan: son el contacto
            humano. Esto es quién firma el contrato y a quién se le factura. */}
        <div className="border border-border rounded-lg bg-crema/40">
          <label className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer">
            <input type="checkbox" checked={conEmpresa} onChange={(e) => setConEmpresa(e.target.checked)} />
            <span className="font-medium text-bosque">Contrata una empresa</span>
            <span className="text-muted">
              — el contrato sale a nombre de la empresa, uno solo para todo el grupo, y lo firma su representante legal
            </span>
          </label>
          {conEmpresa && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-3 pb-3 text-sm">
              <label className="block">
                <span className="text-xs text-muted">Razón social</span>
                <input name="company_legal_name" placeholder="COLEGIO SAN JOSÉ S.A.S." className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white" />
              </label>
              <label className="block">
                <span className="text-xs text-muted">NIT</span>
                <input name="company_nit" placeholder="900.123.456-7" className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white" />
              </label>
              <label className="block">
                <span className="text-xs text-muted">Correo de notificaciones</span>
                <input name="company_email" type="email" className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white" />
              </label>
              <label className="block">
                <span className="text-xs text-muted">Dirección de notificaciones</span>
                <input name="company_address" placeholder="Calle 100 # 15-20, of. 401" className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white" />
              </label>
              <label className="block">
                <span className="text-xs text-muted">Ciudad</span>
                <input name="company_city" placeholder="Bogotá D.C." className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white" />
              </label>
              <label className="block">
                <span className="text-xs text-muted">Teléfono de la empresa</span>
                <input name="company_phone" className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white" />
              </label>
              <label className="block">
                <span className="text-xs text-muted">Representante legal</span>
                <input name="company_rep_name" className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white" />
              </label>
              <label className="block">
                <span className="text-xs text-muted">Tipo de documento</span>
                <select name="company_rep_document_type" defaultValue="Cédula de ciudadanía" className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white">
                  <option>Cédula de ciudadanía</option>
                  <option>Cédula de extranjería</option>
                  <option>Pasaporte</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted">Documento del representante</span>
                <input name="company_rep_document_number" className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white" />
              </label>
              <p className="md:col-span-3 text-[11px] text-muted">
                Se identifica por el NIT: si la empresa ya cotizó antes, se actualiza su ficha en vez de duplicarla.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* RUTA + MODALIDAD + PRECIOS */}
      <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-display text-lg text-bosque">Ruta y precios</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <label className="block">
            <span className="text-xs text-muted">Camino</span>
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            >
              <option value="">— Elegí un Camino —</option>
              {families.map((f) => <option key={f} value={f}>{f}</option>)}
              <option value={RUTA_CUSTOM}>+ Ruta personalizada (crear nueva)</option>
            </select>
          </label>
          {customMode ? (
            <div className="block md:col-span-2 self-end">
              <span className="text-[11px] text-bosque inline-block pb-2.5">
                Ruta nueva: completá nombre, días, etapas y tarifas abajo. Se guarda en el catálogo junto con la cotización.
              </span>
            </div>
          ) : (
            <label className="block md:col-span-2">
              <span className="text-xs text-muted">Desde</span>
              <select
                name="route_name"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                disabled={!family}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{family ? "— Elegí desde dónde —" : "Primero elegí un Camino"}</option>
                {familyRoutes.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}{r.days ? ` · ${r.days} días` : ""}{r.km ? ` · ${r.km} km` : ""}
                  </option>
                ))}
              </select>
              {selectedRoute && (
                <span className="text-[11px] text-bosque mt-0.5 inline-block">
                  {selectedRoute.days} días · {selectedRoute.km} km · etapas oficiales cargadas
                </span>
              )}
            </label>
          )}

          {customMode && (
            <CustomRoutePanel value={custom} onChange={setCustom} families={families.filter((f) => f !== SIN_FAMILIA)} />
          )}

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
              {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              {EXTRA_MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-[11px] text-muted mt-0.5 inline-block">
              {esTipo
                ? people === 1
                  ? "1 persona → habitación individual."
                  : `Reparto automático: ${dobles} hab. ${dobles === 1 ? "doble" : "dobles"}${individuales > 0 ? " + 1 individual" : ""} para ${people} personas.`
                : aMedida
                  ? `Reparto tecleado abajo: ${roomTotals.habitaciones} hab. para ${roomTotals.personas} ${roomTotals.personas === 1 ? "persona" : "personas"}.`
                  : "Elegí Pensión u Hotel y la plataforma reparte las habitaciones sola (pares en dobles, el impar en individual). Si el grupo va mezclado (dobles + triples, una cuádruple…), elegí \"Habitaciones a medida\" y poné el precio de cada habitación."}
            </span>
          </label>
          <label className="block">
            <span className="text-xs text-muted">Estado inicial</span>
            <select
              name="status"
              defaultValue={DEFAULT_STATUS}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            >
              {/* `sin_enviar` primero y por defecto: crear la cotización no es mandarla.
                  Pasa sola a "Enviada" al mandar el correo desde el expediente. Las otras
                  dos siguen aquí para el caso de cargar algo que ya se gestionó aparte. */}
              <option value="sin_enviar">{STATUS_LABELS.sin_enviar}</option>
              <option value="enviada">{STATUS_LABELS.enviada}</option>
              <option value="aceptada">{STATUS_LABELS.aceptada}</option>
            </select>
          </label>
        </div>

        {/* Bloque precios */}
        <div className="bg-taupe/30 border border-border rounded-lg p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoLink}
                onChange={(e) => setAutoLink(e.target.checked)}
                className="rounded border-border"
              />
              <span>Auto-cargar precios del catálogo</span>
            </label>
            <div className="space-y-1">
              {ratesOk ? (
                <div className="text-bosque">
                  Catálogo {tarifaYear}:{" "}
                  {dobles > 0 && `${dobles * 2} pers. en doble × ${(catalogBySlug[`${modality}_doble` as ModalitySlug]?.price_cs ?? 0).toFixed(2)}€`}
                  {dobles > 0 && individuales > 0 && " + "}
                  {individuales > 0 && `1 individual × ${(catalogBySlug[`${modality}_single` as ModalitySlug]?.price_cs ?? 0).toFixed(2)}€`}
                  {" "}· costo Pilgrim {(dobles * 2 * (catalogBySlug[`${modality}_doble` as ModalitySlug]?.price_pilgrim ?? 0) + individuales * (catalogBySlug[`${modality}_single` as ModalitySlug]?.price_pilgrim ?? 0)).toFixed(2)}€
                </div>
              ) : aMedida ? (
                <div className="text-bosque">
                  Reparto a medida: la base y el costo Pilgrim salen de las habitaciones de abajo.
                </div>
              ) : routeName && modality && !yearHasRates ? (
                <div className="text-amber-700 font-medium">
                  ⚠ No hay tarifas {tarifaYear} cargadas para esta ruta — ingresá los precios a mano.
                </div>
              ) : routeName && modality ? (
                <div className="text-amber-700 italic">Sin precio {tarifaYear} en catálogo para este reparto de habitaciones</div>
              ) : (
                <div className="text-muted">Elegí ruta y alojamiento para ver el catálogo</div>
              )}
              {season.type !== "regular" && (
                <div className="text-dorado-oscuro font-medium">
                  ⚡ {season.label}: +{season.surcharge_per_person_cs}€/persona (costo Pilgrim +{season.surcharge_per_person_pilgrim}€/persona)
                </div>
              )}
            </div>
          </div>
          {/* Reparto a medida: una fila por tipo de habitación, con su precio de venta y su
              costo Pilgrim. Reemplaza tanto al reparto automático como a las tarifas por
              slot de abajo — acá cada habitación ya trae su propio precio. */}
          {aMedida && (
            <RoomsPanel rows={roomRows} onChange={setRoomRows} people={people} />
          )}

          {/* Precios POR PERSONA del reparto automático. Los del tipo elegido arman la base
              del grupo (mi precio) y el costo Pilgrim; los del otro tipo son opcionales y
              solo salen como tarjeta comparativa del PDF. Vacía = no se dibuja esa tarjeta. */}
          {esTipo && rateSlots.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-muted">
                <strong className="text-fg">Todos los precios son por persona</strong>, sin suplemento. La base del
                grupo se calcula sola: personas de cada habitación × precio. Dejá en blanco el
                alojamiento que no querés ofrecer en el PDF.
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {rateSlots.map((slot) => {
                  const elegido = slot.tipo === modality;
                  const personasSlot = slot.slug.endsWith("_doble") ? dobles * 2 : individuales;
                  const cs = numOrNull(rates[slot.slug] ?? "") ?? 0;
                  const pil = numOrNull(pilgrimRates[slot.slug] ?? "") ?? 0;
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

          {/* Alojamiento libre ("Doble + Triple", "Personalizada" o sin elegir): un precio por
              persona para todo el grupo. Si el grupo va mezclado de verdad, lo correcto es
              "Habitaciones a medida", que le pone precio a cada habitación. */}
          {libre && (
            <div className="space-y-2">
              <div className="text-xs text-muted">
                <strong className="text-fg">Precio por persona</strong> para las {people} {people === 1 ? "persona" : "personas"} del grupo, sin
                suplemento. La base se calcula sola. Si cada habitación tiene un precio distinto, elegí
                &quot;Habitaciones a medida&quot;.
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
              <div className="text-xs text-muted">Base grupo € (sin suplemento) · calculado</div>
              <div className="text-bosque font-medium text-base tabular-nums">{eurPP(baseEur)}</div>
              {season.type !== "regular" && (
                <div className="text-[10px] text-muted">+ {eurPP(seasonSuppCs)} suplemento {season.label.toLowerCase()} → total cliente {eurPP(baseEur + seasonSuppCs)}</div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted">Costo Pilgrim grupo € · calculado</div>
              <div className="text-fg font-medium text-base tabular-nums">{eurPP(costBaseEur)}</div>
              {season.type !== "regular" && costBaseEur > 0 && (
                <div className="text-[10px] text-muted">+ {eurPP(seasonSuppPilgrim)} suplemento → {eurPP(costBaseEur + seasonSuppPilgrim)}</div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted">Utilidad proyectada</div>
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

          {/* La nota interna que se guarda con la cotización cuando el precio no salió del
              catálogo: quien abra el expediente después sabe que la cifra es por persona. */}
          {notaPrecio && (
            <div className="rounded-md border border-dorado-oscuro/40 bg-dorado-oscuro/10 px-3 py-2 text-xs">
              <div className="font-medium text-dorado-oscuro mb-0.5">Nota interna que queda en la cotización (no sale en el PDF)</div>
              <div className="text-fg">{notaPrecio}</div>
            </div>
          )}
        </div>
      </section>

      {/* FECHAS Y NOTAS */}
      <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-display text-lg text-bosque">Fechas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <label className="block">
            <span className="text-xs text-muted">Fecha inicio</span>
            <input
              name="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">
              Fecha fin
              {effectiveDays && endAuto ? (
                <span className="text-bosque ml-1">· auto ({effectiveDays} días)</span>
              ) : null}
            </span>
            <input
              name="end_date"
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setEndAuto(false); }}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
            {!endAuto && effectiveDays ? (
              <button
                type="button"
                onClick={() => setEndAuto(true)}
                className="text-[10px] text-bosque hover:underline mt-0.5"
              >
                Restaurar cálculo automático
              </button>
            ) : null}
          </label>
          <label className="block">
            <span className="text-xs text-muted">Válida hasta</span>
            <input
              name="valid_until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
          </label>
          <label className="block md:col-span-3">
            <span className="text-xs text-muted">Notas</span>
            <textarea
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Cualquier detalle: pedidos especiales, vuelos, etc."
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
          </label>
        </div>
      </section>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>}

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 rounded-md bg-bosque text-white font-medium hover:bg-bosque-medio disabled:opacity-50 transition"
        >
          {pending ? "Creando…" : "Crear cotización"}
        </button>
      </div>
    </form>
  );
}
