"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { updateQuote } from "./actions";
import { detectSeason, type SeasonSupplements } from "@/lib/seasons";
import { QUOTE_STATUSES, STATUS_LABELS, DEFAULT_STATUS, statusLabel } from "@/lib/quoteStatus";
import { quoteYear, ratesForYear } from "@/lib/pricing/year";

type Quote = {
  id: string;
  code: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
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
};

type PricingRow = {
  route_id: string;
  route_name: string;
  modality_slug: string;
  year: number;
  price_pilgrim: number;
  price_cs: number;
};

// Display ↔ slug
const MODALITY_DISPLAY = [
  { slug: "pension_doble", label: "Pensión doble" },
  { slug: "pension_single", label: "Pensión single" },
  { slug: "hotel_doble", label: "Hotel doble" },
  { slug: "hotel_single", label: "Hotel single" },
] as const;

const EXTRA_MODALITIES = ["Doble + Triple", "Personalizada"];

/**
 * La etiqueta de alojamiento es texto libre y convive en varios formatos: "Pensión doble"
 * (catálogo y este editor) y "Pensión, habitación doble" (asistente y cotizador web). Se
 * detectan tipo y habitación por separado, igual que en src/lib/quotes/pdf.ts, para que el
 * catálogo también cargue al editar una cotización creada por el asistente.
 */
function modalityToSlug(label: string | null): string | null {
  const m = (label ?? "").toLowerCase();
  if (!m) return null;
  const tipo = m.includes("hotel") ? "hotel" : (m.includes("pensión") || m.includes("pension")) ? "pension" : null;
  if (!tipo) return null;
  const hasDoble = m.includes("doble");
  const hasSingle = m.includes("single") || m.includes("individual");
  if (hasSingle && !hasDoble) return `${tipo}_single`;
  if (hasDoble && !hasSingle) return `${tipo}_doble`;
  return null; // etiqueta mixta ("Pensión · 2 dobles + 1 individual"): no hay tarifa única
}

export default function QuoteEditor({
  quote,
  routes,
  pricing,
  seasonConfig,
}: {
  quote: Quote;
  routes: { id: string; name: string }[];
  pricing: PricingRow[];
  seasonConfig: SeasonSupplements;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Estado controlado para auto-fill
  const [routeName, setRouteName] = useState(quote.route_name ?? "");
  const [modality, setModality] = useState(quote.modality ?? "");
  const [people, setPeople] = useState<number>(Number(quote.people) || 1);
  const [startDate, setStartDate] = useState<string>(quote.start_date ?? "");
  const [endDate, setEndDate] = useState<string>(quote.end_date ?? "");
  // base_eur = ruta + alojamiento (lo que el usuario controla aquí). El total_eur se recalcula auto sumando suplemento + opcionales.
  const initialBase = quote.base_eur != null ? Number(quote.base_eur) : Number(quote.total_eur) || 0;
  const [totalEur, setTotalEur] = useState<string>(initialBase ? String(initialBase) : "");
  // Espejo del lado cliente: acá se edita la BASE Pilgrim (ruta + alojamiento). El
  // cost_eur total lo arma la BD sumándole suplemento y opcionales.
  const initialCostBase = quote.cost_base_eur != null ? Number(quote.cost_base_eur) : Number(quote.cost_eur) || 0;
  const [costEur, setCostEur] = useState<string>(initialCostBase ? String(initialCostBase) : "");
  const [autoLink, setAutoLink] = useState(true); // true = recalcular cuando cambian ruta/modalidad/personas
  // Precios por persona de las tarjetas del PDF. Vacío = esa tarjeta no se dibuja.
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [slug, v] of Object.entries(quote.price_blocks ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[slug] = n.toFixed(2);
    }
    return out;
  });

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

  // Buscar precio del catálogo del año para la combinación actual
  const catalogMatch = useMemo(() => {
    const slug = modalityToSlug(modality);
    if (!slug || !routeName) return null;
    return yearRates.find((p) => p.route_name === routeName && p.modality_slug === slug) || null;
  }, [routeName, modality, yearRates]);

  // Mismos slots que el asistente: los que el reparto de habitaciones necesita, para los
  // dos tipos de alojamiento.
  const dobles = Math.floor(people / 2);
  const individuales = people % 2;
  const rateSlots = useMemo(() => {
    const slots: Array<{ slug: string; label: string }> = [];
    for (const tipo of ["pension", "hotel"] as const) {
      const nombre = tipo === "hotel" ? "Hotel" : "Pensión";
      if (dobles > 0) slots.push({ slug: `${tipo}_doble`, label: `${nombre} doble` });
      if (individuales > 0) slots.push({ slug: `${tipo}_single`, label: `${nombre} individual` });
    }
    return slots;
  }, [dobles, individuales]);

  // Precarga las tarjetas del PDF con el catálogo del año: la elegida y su comparativa.
  const ratesFromCatalog = () => {
    const next: Record<string, string> = {};
    for (const { slug } of rateSlots) {
      const row = yearRates.find((p) => p.route_name === routeName && p.modality_slug === slug);
      if (row && row.price_cs > 0) next[slug] = row.price_cs.toFixed(2);
    }
    return next;
  };

  const recomputeFromCatalog = () => {
    if (!catalogMatch) return;
    setTotalEur((catalogMatch.price_cs * people).toFixed(2));
    setCostEur((catalogMatch.price_pilgrim * people).toFixed(2));
    setRates(ratesFromCatalog());
  };

  // Auto-fill cuando cambian ruta/modalidad/personas y autoLink está activo
  useEffect(() => {
    if (!autoLink) return;
    if (!catalogMatch) return;
    setTotalEur((catalogMatch.price_cs * people).toFixed(2));
    setCostEur((catalogMatch.price_pilgrim * people).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogMatch, people, autoLink]);

  // Solo ruta + suplemento: los opcionales no se editan acá, así que esta cifra es
  // la utilidad DE LA RUTA. La utilidad completa es el KPI de arriba, que sí los suma.
  const utilidadPreview = useMemo(() => {
    const cliente = (Number(totalEur) || 0) + seasonSuppCs;
    const proveedor = (Number(costEur) || 0) + seasonSuppPilgrim;
    return cliente - proveedor;
  }, [totalEur, costEur, seasonSuppCs, seasonSuppPilgrim]);

  async function onSubmit(formData: FormData) {
    setError(null);
    // Aseguramos que los campos controlados se envíen
    formData.set("total_eur", totalEur);
    formData.set("cost_base_eur", costEur);
    formData.set("people", String(people));
    formData.set("route_name", routeName);
    formData.set("modality", modality);
    formData.set("start_date", startDate);
    formData.set("end_date", endDate);
    formData.set("season_supplement_eur", seasonSuppCs.toFixed(2));
    formData.set("season_supplement_cost_eur", seasonSuppPilgrim.toFixed(2));
    formData.set("season_kind", season.type);
    // Precios de las tarjetas del PDF: solo los que tienen valor. Vacío = volver al catálogo.
    const blocks: Record<string, number> = {};
    for (const { slug } of rateSlots) {
      const v = Number(rates[slug] ?? "");
      if (Number.isFinite(v) && v > 0) blocks[slug] = v;
    }
    formData.set("price_blocks", Object.keys(blocks).length > 0 ? JSON.stringify(blocks) : "");
    startTransition(async () => {
      const r = await updateQuote(quote.id, formData);
      if (r?.error) setError(r.error);
      else setEditing(false);
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
          <Field label="Base ruta €" v={quote.base_eur != null ? Number(quote.base_eur).toFixed(2) : null} />
          <Field
            label="Suplemento temporada €"
            v={
              quote.season_kind && quote.season_kind !== "regular" && Number(quote.season_supplement_eur) > 0
                ? `${Number(quote.season_supplement_eur).toFixed(2)} (${quote.season_kind === "easter" ? "Semana Santa" : "alta"})`
                : null
            }
          />
          <Field label="Total cotización €" v={quote.total_eur != null ? Number(quote.total_eur).toFixed(2) : null} />
          <Field label="Base Pilgrim €" v={quote.cost_base_eur != null ? Number(quote.cost_base_eur).toFixed(2) : null} />
          <Field
            label="Suplemento temporada Pilgrim €"
            v={Number(quote.season_supplement_cost_eur) > 0 ? Number(quote.season_supplement_cost_eur).toFixed(2) : null}
          />
          <Field label="Costo Pilgrim total €" v={quote.cost_eur != null ? Number(quote.cost_eur).toFixed(2) : null} />
          <Field label="Estado" v={statusLabel(quote.status)} />
        </dl>
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
  const allModalities = [...MODALITY_DISPLAY.map((m) => m.label), ...EXTRA_MODALITIES];
  const isCustomModality = modality !== "" && !MODALITY_DISPLAY.some((m) => m.label === modality);
  const matchesCatalog =
    catalogMatch &&
    Math.abs(Number(totalEur) - catalogMatch.price_cs * people) < 0.01 &&
    Math.abs(Number(costEur) - catalogMatch.price_pilgrim * people) < 0.01;

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

        <div className="md:col-span-2">
          <label className="block">
            <span className="text-xs text-muted">Ruta</span>
            <input
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              list="routes-datalist"
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
            />
          </label>
          <datalist id="routes-datalist">
            {routes.map((r) => <option key={r.id} value={r.name} />)}
          </datalist>
        </div>

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
        <label className="block">
          <span className="text-xs text-muted">Alojamiento</span>
          <select
            value={modality}
            onChange={(e) => setModality(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
          >
            <option value="">—</option>
            {allModalities.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <div /> {/* spacer */}

        {/* Bloque precios con auto-fill */}
        <div className="md:col-span-3 bg-taupe/30 border border-border rounded-lg p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
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
                {catalogMatch ? (
                  <div className="text-bosque">
                    Catálogo {tarifaYear}: Pilgrim {catalogMatch.price_pilgrim.toFixed(2)}€ · CS {catalogMatch.price_cs.toFixed(2)}€ por persona
                  </div>
                ) : isCustomModality ? (
                  <div className="text-muted italic">Modalidad custom — sin precio en catálogo</div>
                ) : !routeName || !modality ? (
                  <div className="text-muted">Elegí ruta y alojamiento para ver el catálogo</div>
                ) : !yearHasRates ? (
                  <div className="text-amber-700 font-medium">
                    ⚠ No hay tarifas {tarifaYear} cargadas para esta ruta — ingresá los precios a mano.
                  </div>
                ) : (
                  <div className="text-amber-700">Sin precio {tarifaYear} en catálogo para esta combinación</div>
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
              disabled={!catalogMatch}
              className="text-xs px-3 py-1 rounded-md border border-border bg-white hover:bg-taupe/40 disabled:opacity-40 transition"
            >
              Cargar del catálogo
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-xs text-muted">Base ruta + alojamiento € (sin suplemento ni opcionales)</span>
              <input
                type="number"
                step="0.01"
                value={totalEur}
                onChange={(e) => { setTotalEur(e.target.value); setAutoLink(false); }}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
              />
              {catalogMatch && (
                <span className="text-[10px] text-muted">= {catalogMatch.price_cs.toFixed(2)} × {people}</span>
              )}
              {season.type !== "regular" && (
                <span className="text-[10px] text-dorado-oscuro">+ {seasonSuppCs.toFixed(2)}€ suplemento → total cliente {((Number(totalEur)||0) + seasonSuppCs).toFixed(2)}€</span>
              )}
            </label>
            <label className="block">
              <span className="text-xs text-muted">Costo Pilgrim base — ruta + alojamiento € (sin suplemento ni opcionales)</span>
              <input
                type="number"
                step="0.01"
                value={costEur}
                onChange={(e) => { setCostEur(e.target.value); setAutoLink(false); }}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
              />
              {catalogMatch && (
                <span className="text-[10px] text-muted">= {catalogMatch.price_pilgrim.toFixed(2)} × {people}</span>
              )}
              {season.type !== "regular" && (
                <span className="text-[10px] text-dorado-oscuro">+ {seasonSuppPilgrim.toFixed(2)}€ suplemento → costo Pilgrim {((Number(costEur)||0) + seasonSuppPilgrim).toFixed(2)}€</span>
              )}
            </label>
            <div className="text-xs self-end pb-2">
              <div className="text-muted">Utilidad de ruta (sin opcionales)</div>
              <div className="text-bosque font-medium text-base">€{utilidadPreview.toFixed(2)}</div>
              {matchesCatalog && (
                <div className="text-[10px] text-bosque">Coincide con catálogo</div>
              )}
            </div>
          </div>

          {/* Tarjetas del PDF: un precio por persona por alojamiento. Vacío = esa tarjeta
              no se dibuja, así una cotización vendida solo en pensión no muestra un hotel
              que nadie cotizó (migración 0016). */}
          {rateSlots.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/60 space-y-2">
              <div className="text-xs text-muted">
                Precios que salen en el PDF (€ por persona, sin suplemento). Dejá en blanco el
                alojamiento que no querés ofrecer; si los dejás todos vacíos, el PDF vuelve a
                usar el catálogo.
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {rateSlots.map((slot) => (
                  <label key={slot.slug} className="block">
                    <span className="text-xs text-muted">{slot.label}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={rates[slot.slug] ?? ""}
                      onChange={(e) => setRates((prev) => ({ ...prev, [slot.slug]: e.target.value }))}
                      placeholder="—"
                      className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
                    />
                  </label>
                ))}
              </div>
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

        {error && <div className="md:col-span-3 text-sm text-red-700">{error}</div>}

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
