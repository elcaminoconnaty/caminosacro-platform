"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { updateQuote } from "./actions";
import { detectSeason, type SeasonSupplements } from "@/lib/seasons";

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
  cost_eur: number | string | null;
  status: string | null;
  valid_until: string | null;
  notes: string | null;
  season_supplement_eur?: number | string | null;
  season_kind?: string | null;
};

type PricingRow = {
  route_id: string;
  route_name: string;
  modality_slug: string;
  price_pilgrim: number;
  price_cs: number;
};

const STATUS_OPTIONS = ["borrador", "enviada", "aceptada", "en_pago", "pagada", "viajada", "cancelada"];

// Display ↔ slug
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
  const [costEur, setCostEur] = useState<string>(quote.cost_eur != null ? String(Number(quote.cost_eur)) : "");
  const [autoLink, setAutoLink] = useState(true); // true = recalcular cuando cambian ruta/modalidad/personas

  // Detección de temporada según fechas actuales — se recalcula al cambiar start/end/people
  const season = useMemo(
    () => detectSeason(startDate || null, endDate || null, seasonConfig),
    [startDate, endDate, seasonConfig],
  );
  const seasonSuppCs = season.surcharge_per_person_cs * people;
  const seasonSuppPilgrim = season.surcharge_per_person_pilgrim * people;

  // Buscar precio del catálogo para la combinación actual
  const catalogMatch = useMemo(() => {
    const slug = modalityToSlug(modality);
    if (!slug || !routeName) return null;
    return pricing.find((p) => p.route_name === routeName && p.modality_slug === slug) || null;
  }, [routeName, modality, pricing]);

  const recomputeFromCatalog = () => {
    if (!catalogMatch) return;
    setTotalEur((catalogMatch.price_cs * people).toFixed(2));
    setCostEur((catalogMatch.price_pilgrim * people).toFixed(2));
  };

  // Auto-fill cuando cambian ruta/modalidad/personas y autoLink está activo
  useEffect(() => {
    if (!autoLink) return;
    if (!catalogMatch) return;
    setTotalEur((catalogMatch.price_cs * people).toFixed(2));
    setCostEur((catalogMatch.price_pilgrim * people).toFixed(2));
  }, [catalogMatch, people, autoLink]);

  const utilidadPreview = useMemo(() => {
    const cliente = (Number(totalEur) || 0) + seasonSuppCs;
    const proveedor = (Number(costEur) || 0) + seasonSuppPilgrim;
    return cliente - proveedor;
  }, [totalEur, costEur, seasonSuppCs, seasonSuppPilgrim]);

  async function onSubmit(formData: FormData) {
    setError(null);
    // Aseguramos que los campos controlados se envíen
    formData.set("total_eur", totalEur);
    formData.set("cost_eur", costEur);
    formData.set("people", String(people));
    formData.set("route_name", routeName);
    formData.set("modality", modality);
    formData.set("start_date", startDate);
    formData.set("end_date", endDate);
    formData.set("season_supplement_eur", seasonSuppCs.toFixed(2));
    formData.set("season_kind", season.type);
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
          <Field label="Costo Pilgrim €" v={quote.cost_eur != null ? Number(quote.cost_eur).toFixed(2) : null} />
          <Field label="Estado" v={quote.status} />
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
          <select name="status" defaultValue={quote.status ?? "borrador"} className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white">
            {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
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
            value={people}
            onChange={(e) => setPeople(Math.max(1, Number(e.target.value) || 1))}
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
                    Catálogo: Pilgrim {catalogMatch.price_pilgrim.toFixed(2)}€ · CS {catalogMatch.price_cs.toFixed(2)}€ por persona
                  </div>
                ) : isCustomModality ? (
                  <div className="text-muted italic">Modalidad custom — sin precio en catálogo</div>
                ) : !routeName || !modality ? (
                  <div className="text-muted">Elegí ruta y alojamiento para ver el catálogo</div>
                ) : (
                  <div className="text-amber-700">Sin precio en catálogo para esta combinación</div>
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
              <span className="text-xs text-muted">Costo Pilgrim € (total grupo)</span>
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
            </label>
            <div className="text-xs self-end pb-2">
              <div className="text-muted">Utilidad proyectada</div>
              <div className="text-bosque font-medium text-base">€{utilidadPreview.toFixed(2)}</div>
              {matchesCatalog && (
                <div className="text-[10px] text-bosque">Coincide con catálogo</div>
              )}
            </div>
          </div>
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
