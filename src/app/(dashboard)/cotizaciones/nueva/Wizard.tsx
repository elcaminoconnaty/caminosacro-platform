"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createQuote, findClientByPhone, type ClientLite } from "./actions";
import { createRoute, createItinerary, type NewRoutePrice, type NewStageInput } from "../../catalogo/actions";
import CustomRoutePanel, { emptyCustomRoute, CUSTOM_MODALITIES, type CustomRouteData } from "./CustomRoutePanel";
import { detectSeason, type SeasonSupplements } from "@/lib/seasons";
import { DEFAULT_STATUS, STATUS_LABELS } from "@/lib/quoteStatus";

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
  price_pilgrim: number;
  price_cs: number;
};

// Se elige solo el tipo de alojamiento; el reparto de habitaciones lo hace la
// plataforma con el número de peregrinos (pares en dobles, el impar en individual),
// igual que el cotizador de caminosacro.com (ver webQuote.ts).
const TIPOS = [
  { value: "pension", label: "Pensión" },
  { value: "hotel", label: "Hotel" },
] as const;

const EXTRA_MODALITIES = ["Doble + Triple", "Personalizada"];

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
  const [foundClient, setFoundClient] = useState<ClientLite | null | "loading">(null);

  // Cotización — selección por cascada
  const [family, setFamily] = useState("");
  const [routeName, setRouteName] = useState("");
  // Ruta personalizada creada desde el propio wizard (family === RUTA_CUSTOM)
  const [custom, setCustom] = useState<CustomRouteData>(() => emptyCustomRoute());
  const customMode = family === RUTA_CUSTOM;
  const [modality, setModality] = useState("");
  const [people, setPeople] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [validUntil, setValidUntil] = useState(todayPlus(30));
  const [notes, setNotes] = useState("");


  // Precios (controlados — auto-fill desde catálogo)
  const [autoLink, setAutoLink] = useState(true);
  const [totalEur, setTotalEur] = useState("0");
  const [costEur, setCostEur] = useState("0");

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

  // Tarifas para el tipo elegido (doble y single): del catálogo, o de las tecleadas
  // en el panel de ruta personalizada (aún no existen en la DB al cotizar).
  const catalogRates = useMemo(() => {
    if (!esTipo) return null;
    if (customMode) {
      const mk = (slug: string) => {
        const p = custom.prices[slug];
        const cs = numOrNull(p?.cs ?? "");
        if (cs == null || cs <= 0) return null;
        return { price_cs: cs, price_pilgrim: numOrNull(p?.pilgrim ?? "") ?? 0 };
      };
      return { doble: mk(`${modality}_doble`), single: mk(`${modality}_single`) };
    }
    if (!routeName) return null;
    const doble = pricing.find((p) => p.route_name === routeName && p.modality_slug === `${modality}_doble`) || null;
    const single = pricing.find((p) => p.route_name === routeName && p.modality_slug === `${modality}_single`) || null;
    return { doble, single };
  }, [routeName, modality, pricing, esTipo, customMode, custom.prices]);

  // El catálogo alcanza si tiene la tarifa de cada habitación que el reparto necesita.
  const ratesOk = !!catalogRates &&
    (dobles === 0 || !!catalogRates.doble) &&
    (individuales === 0 || !!catalogRates.single);

  // Detección de temporada según fecha de inicio + fin
  const season = useMemo(
    () => detectSeason(startDate || null, endDate || null, seasonConfig),
    [startDate, endDate, seasonConfig],
  );

  // Auto-fill cuando cambian ruta/modalidad/personas y autoLink activo.
  // El total/costo del bloque editable es la BASE sin suplemento de temporada.
  // El suplemento se desglosa al guardar (ver onSubmit) y aparece como línea aparte en el PDF.
  useEffect(() => {
    if (!autoLink || !ratesOk || !catalogRates) return;
    const enDoble = dobles * 2;
    setTotalEur((enDoble * (catalogRates.doble?.price_cs ?? 0) + individuales * (catalogRates.single?.price_cs ?? 0)).toFixed(2));
    setCostEur((enDoble * (catalogRates.doble?.price_pilgrim ?? 0) + individuales * (catalogRates.single?.price_pilgrim ?? 0)).toFixed(2));
  }, [catalogRates, ratesOk, dobles, individuales, autoLink]);

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
    const cliente = (Number(totalEur) || 0) + seasonSuppCs;
    const proveedor = (Number(costEur) || 0) + seasonSuppPilgrim;
    return cliente - proveedor;
  }, [totalEur, costEur, seasonSuppCs, seasonSuppPilgrim]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("total_eur", totalEur); // base = ruta + alojamiento (sin suplemento ni opcionales)
    fd.set("cost_eur", String(((Number(costEur) || 0) + seasonSuppPilgrim).toFixed(2))); // costo Pilgrim total con suplemento
    fd.set("people", String(people));
    fd.set("season_supplement_eur", seasonSuppCs.toFixed(2));
    fd.set("season_kind", season.type);
    // Etiqueta de modalidad con el reparto real (mismos textos que webQuote.ts).
    if (esTipo) {
      const tipoNombre = modality === "hotel" ? "Hotel" : "Pensión";
      fd.set(
        "modality",
        individuales === 0
          ? `${tipoNombre}, habitación doble`
          : dobles === 0
            ? `${tipoNombre}, habitación individual`
            : `${tipoNombre} · ${dobles} ${dobles === 1 ? "doble" : "dobles"} + 1 individual`,
      );
      // Desglose para el PDF, solo si el total salió de las tarifas del catálogo
      // (con precios editados a mano el desglose no cuadraría con el total).
      if (ratesOk && autoLink) {
        fd.set(
          "rooms_json",
          JSON.stringify({
            tipo: modality,
            dobles,
            individuales,
            tarifa_doble: catalogRates?.doble?.price_cs ?? 0,
            tarifa_single: catalogRates?.single?.price_cs ?? 0,
          }),
        );
      }
    } else {
      fd.set("modality", modality);
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
      }
      const r = await createQuote(fd);
      if (r?.error) setError(r.error);
      // En caso éxito, el server hace redirect — no llegamos acá
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
            <span className="text-xs text-muted">Personas</span>
            <input
              type="number"
              min={1}
              max={30}
              value={people}
              onChange={(e) => setPeople(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
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
                : "Elegí Pensión u Hotel y la plataforma reparte las habitaciones sola (pares en dobles, el impar en individual). Para algo distinto (mezclas, triple, etc.) elegí \"Personalizada\" y describilo en las notas."}
            </span>
          </label>
          <label className="block">
            <span className="text-xs text-muted">Estado inicial</span>
            <select
              name="status"
              defaultValue={DEFAULT_STATUS}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            >
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
              {ratesOk && catalogRates ? (
                <div className="text-bosque">
                  Catálogo:{" "}
                  {dobles > 0 && `${dobles * 2} pers. en doble × ${(catalogRates.doble?.price_cs ?? 0).toFixed(2)}€`}
                  {dobles > 0 && individuales > 0 && " + "}
                  {individuales > 0 && `1 individual × ${(catalogRates.single?.price_cs ?? 0).toFixed(2)}€`}
                  {" "}· costo Pilgrim {(dobles * 2 * (catalogRates.doble?.price_pilgrim ?? 0) + individuales * (catalogRates.single?.price_pilgrim ?? 0)).toFixed(2)}€
                </div>
              ) : routeName && modality ? (
                <div className="text-amber-700 italic">Sin precio en catálogo (modalidad/ruta custom)</div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-xs text-muted">Base ruta + alojamiento € (total grupo, sin suplemento)</span>
              <input
                type="number"
                step="0.01"
                value={totalEur}
                onChange={(e) => { setTotalEur(e.target.value); setAutoLink(false); }}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
              />
              {season.type !== "regular" && (
                <span className="text-[10px] text-muted">+ {seasonSuppCs.toFixed(2)}€ suplemento {season.label.toLowerCase()} → total cliente {((Number(totalEur)||0) + seasonSuppCs).toFixed(2)}€</span>
              )}
            </label>
            <label className="block">
              <span className="text-xs text-muted">Costo Pilgrim € (total grupo)</span>
              <input
                type="number"
                step="0.01"
                value={costEur}
                onChange={(e) => { setCostEur(e.target.value); setAutoLink(false); }}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
              />
            </label>
            <div className="self-end pb-2 text-xs">
              <div className="text-muted">Utilidad proyectada</div>
              <div className="text-bosque font-medium text-base">€{utilidadPreview.toFixed(2)}</div>
            </div>
          </div>
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

      {error && <div className="rounded-md border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>}

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
