"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createQuote, findClientByPhone, type ClientLite } from "./actions";
import { detectSeason, type SeasonSupplements } from "@/lib/seasons";

type PricingRow = {
  route_id: string;
  route_name: string;
  modality_slug: string;
  price_pilgrim: number;
  price_cs: number;
};

const MODALITY_DISPLAY = [
  { slug: "pension_doble", label: "Pensión doble" },
  { slug: "pension_single", label: "Pensión single" },
  { slug: "hotel_doble", label: "Hotel doble" },
  { slug: "hotel_single", label: "Hotel single" },
] as const;

const EXTRA_MODALITIES = ["Doble + Triple", "Personalizada"];

function modalityToSlug(label: string | null): string | null {
  if (!label) return null;
  const m = MODALITY_DISPLAY.find((x) => x.label === label);
  return m?.slug ?? null;
}

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

  // Match en catálogo
  const catalogMatch = useMemo(() => {
    const slug = modalityToSlug(modality);
    if (!slug || !routeName) return null;
    return pricing.find((p) => p.route_name === routeName && p.modality_slug === slug) || null;
  }, [routeName, modality, pricing]);

  // Detección de temporada según fecha de inicio + fin
  const season = useMemo(
    () => detectSeason(startDate || null, endDate || null, seasonConfig),
    [startDate, endDate, seasonConfig],
  );

  // Auto-fill cuando cambian ruta/modalidad/personas y autoLink activo.
  // El total/costo del bloque editable es la BASE sin suplemento de temporada.
  // El suplemento se desglosa al guardar (ver onSubmit) y aparece como línea aparte en el PDF.
  useEffect(() => {
    if (!autoLink || !catalogMatch) return;
    setTotalEur((catalogMatch.price_cs * people).toFixed(2));
    setCostEur((catalogMatch.price_pilgrim * people).toFixed(2));
  }, [catalogMatch, people, autoLink]);

  // Ruta seleccionada (para días)
  const selectedRoute = useMemo(
    () => routes.find((r) => r.name === routeName) || null,
    [routes, routeName],
  );

  // Familias disponibles + rutas filtradas
  const families = useMemo(() => {
    const set = new Set<string>();
    routes.forEach((r) => { if (r.family) set.add(r.family); });
    return [...set].sort();
  }, [routes]);

  const familyRoutes = useMemo(
    () => routes.filter((r) => r.family === family).sort((a, b) => (b.days || 0) - (a.days || 0)),
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

  // Auto-calcular fecha fin = inicio + (días de la ruta - 1)
  const [endAuto, setEndAuto] = useState(true);
  useEffect(() => {
    if (!endAuto) return;
    if (!startDate || !selectedRoute?.days) return;
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(start.getTime() + (selectedRoute.days - 1) * 24 * 60 * 60 * 1000);
    setEndDate(end.toISOString().slice(0, 10));
  }, [startDate, selectedRoute, endAuto]);

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
    startTransition(async () => {
      const r = await createQuote(fd);
      if (r?.error) setError(r.error);
      // En caso éxito, el server hace redirect — no llegamos acá
    });
  }

  const allModalities = [...MODALITY_DISPLAY.map((m) => m.label), ...EXTRA_MODALITIES];

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
            </select>
          </label>
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
                  {r.origin} ({r.days} días, {r.km} km)
                </option>
              ))}
            </select>
            {selectedRoute && (
              <span className="text-[11px] text-bosque mt-0.5 inline-block">
                {selectedRoute.days} días · {selectedRoute.km} km · etapas oficiales cargadas
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs text-muted">Personas</span>
            <input
              type="number"
              min={1}
              value={people}
              onChange={(e) => setPeople(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs text-muted">Alojamiento</span>
            <select
              name="modality"
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            >
              <option value="">—</option>
              {allModalities.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-[11px] text-muted mt-0.5 inline-block">
              Si el cliente quiere algo distinto (mezcla pensión + hotel, habitación triple, etc.) elegí "Personalizada" y describilo en las notas.
            </span>
          </label>
          <label className="block">
            <span className="text-xs text-muted">Estado inicial</span>
            <select
              name="status"
              defaultValue="borrador"
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            >
              <option value="borrador">borrador</option>
              <option value="enviada">enviada</option>
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
              {catalogMatch ? (
                <div className="text-bosque">
                  Catálogo: Pilgrim {catalogMatch.price_pilgrim.toFixed(2)}€ · CS {catalogMatch.price_cs.toFixed(2)}€ por persona
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
              {selectedRoute?.days && endAuto && (
                <span className="text-bosque ml-1">· auto ({selectedRoute.days} días)</span>
              )}
            </span>
            <input
              name="end_date"
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setEndAuto(false); }}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
            {!endAuto && selectedRoute?.days && (
              <button
                type="button"
                onClick={() => setEndAuto(true)}
                className="text-[10px] text-bosque hover:underline mt-0.5"
              >
                Restaurar cálculo automático
              </button>
            )}
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
