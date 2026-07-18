"use client";

import { Plus, Trash2 } from "lucide-react";

// Estado del formulario de ruta personalizada dentro del wizard de cotización.
// El Wizard es el dueño del estado: al crear la cotización orquesta
// createRoute → createItinerary → createQuote con estos datos.

export type CustomStageRow = {
  key: string;
  from_place: string;
  to_place: string;
  km: string;
  accommodation: string;
};

export type CustomPriceState = Record<string, { pilgrim: string; cs: string }>;

export type CustomRouteData = {
  name: string;
  family: string;
  origin: string;
  destination: string;
  days: string;
  nights: string;
  km: string;
  difficulty: string;
  stages: CustomStageRow[];
  prices: CustomPriceState;
};

export const CUSTOM_MODALITIES = [
  { slug: "pension_doble", label: "Pensión doble" },
  { slug: "pension_single", label: "Pensión single" },
  { slug: "hotel_doble", label: "Hotel doble" },
  { slug: "hotel_single", label: "Hotel single" },
];

let stageKeyCounter = 0;
const newStageKey = () => `cs${stageKeyCounter++}`;

export function emptyCustomRoute(): CustomRouteData {
  return {
    name: "",
    family: "",
    origin: "",
    destination: "",
    days: "",
    nights: "",
    km: "",
    difficulty: "Media",
    stages: [
      { key: newStageKey(), from_place: "", to_place: "", km: "", accommodation: "" },
      { key: newStageKey(), from_place: "", to_place: "", km: "", accommodation: "" },
      { key: newStageKey(), from_place: "", to_place: "", km: "", accommodation: "" },
    ],
    prices: Object.fromEntries(CUSTOM_MODALITIES.map((m) => [m.slug, { pilgrim: "", cs: "" }])),
  };
}

const inputCls =
  "mt-1 w-full px-2.5 py-1.5 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-1 focus:ring-bosque/40 focus:border-bosque";
const cellCls =
  "w-full px-2 py-1 rounded border border-border bg-white text-xs focus:outline-none focus:ring-1 focus:ring-bosque/40 focus:border-bosque";

export default function CustomRoutePanel({
  value,
  onChange,
  families,
}: {
  value: CustomRouteData;
  onChange: (v: CustomRouteData) => void;
  families: string[];
}) {
  const set = (patch: Partial<CustomRouteData>) => onChange({ ...value, ...patch });
  const setStage = (key: string, field: keyof Omit<CustomStageRow, "key">, v: string) =>
    set({ stages: value.stages.map((s) => (s.key === key ? { ...s, [field]: v } : s)) });
  const setPrice = (slug: string, field: "pilgrim" | "cs", v: string) =>
    set({ prices: { ...value.prices, [slug]: { ...value.prices[slug], [field]: v } } });

  return (
    <div className="md:col-span-3 bg-taupe/20 border border-border rounded-lg p-4 space-y-4">
      <p className="text-xs text-muted">
        La ruta se crea en el catálogo al guardar la cotización (no aparece en el cotizador web). Precios, etapas y días son editables aquí mismo.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <label className="block col-span-2">
          <span className="text-xs text-muted">Nombre de la ruta *</span>
          <input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="Portugués — Viana do Castelo" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Camino (familia)</span>
          <input list="custom-route-families" value={value.family} onChange={(e) => set({ family: e.target.value })} placeholder="Portugués" className={inputCls} />
          <datalist id="custom-route-families">
            {families.map((f) => <option key={f} value={f} />)}
          </datalist>
        </label>
        <label className="block">
          <span className="text-xs text-muted">Dificultad</span>
          <input value={value.difficulty} onChange={(e) => set({ difficulty: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Origen</span>
          <input value={value.origin} onChange={(e) => set({ origin: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Destino</span>
          <input value={value.destination} onChange={(e) => set({ destination: e.target.value })} placeholder="Santiago de Compostela" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Días</span>
          <input type="number" min={1} value={value.days} onChange={(e) => set({ days: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Noches / Km</span>
          <div className="flex gap-2">
            <input type="number" min={0} value={value.nights} onChange={(e) => set({ nights: e.target.value })} placeholder="Noches" className={inputCls} />
            <input type="number" min={0} value={value.km} onChange={(e) => set({ km: e.target.value })} placeholder="Km" className={inputCls} />
          </div>
        </label>
      </div>

      <div>
        <p className="text-xs text-muted mb-1.5">Itinerario — los días se numeran según el orden. Cada etapa sale en el PDF tal como esté aquí.</p>
        <div className="bg-white border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 w-10 text-left">Día</th>
                <th className="px-2 py-2 text-left">Desde</th>
                <th className="px-2 py-2 text-left">Hasta</th>
                <th className="px-2 py-2 w-20 text-left">Km</th>
                <th className="px-2 py-2 text-left">Alojamiento</th>
                <th className="px-1 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {value.stages.map((s, i) => (
                <tr key={s.key} className="align-top">
                  <td className="px-3 py-1.5 text-muted tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1.5"><input value={s.from_place} onChange={(e) => setStage(s.key, "from_place", e.target.value)} placeholder="Sarria" className={cellCls} /></td>
                  <td className="px-2 py-1.5"><input value={s.to_place} onChange={(e) => setStage(s.key, "to_place", e.target.value)} placeholder="Portomarín" className={cellCls} /></td>
                  <td className="px-2 py-1.5"><input type="number" step="1" value={s.km} onChange={(e) => setStage(s.key, "km", e.target.value)} className={cellCls} /></td>
                  <td className="px-2 py-1.5"><input value={s.accommodation} onChange={(e) => setStage(s.key, "accommodation", e.target.value)} placeholder="Pensión / hotel" className={cellCls} /></td>
                  <td className="px-1 py-1.5 text-right">
                    <button type="button" onClick={() => set({ stages: value.stages.filter((x) => x.key !== s.key) })} title="Quitar etapa" className="text-muted hover:text-red-600 transition">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {value.stages.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted text-xs">Sin etapas. Agregá filas (opcional).</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => set({ stages: [...value.stages, { key: newStageKey(), from_place: "", to_place: "", km: "", accommodation: "" }] })}
          className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
        >
          <Plus size={13} /> Añadir etapa
        </button>
      </div>

      <div>
        <p className="text-xs text-muted mb-1.5">Tarifas por persona (opcional) — con las del tipo elegido, el total se calcula solo con el reparto de habitaciones.</p>
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">Modalidad</th>
                <th className="text-right px-3 py-2 w-32">Precio Pilgrim €</th>
                <th className="text-right px-3 py-2 w-32">Mi precio €</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CUSTOM_MODALITIES.map((m) => (
                <tr key={m.slug} className="hover:bg-taupe/20">
                  <td className="px-3 py-2 text-muted">{m.label}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" step="1" value={value.prices[m.slug].pilgrim} onChange={(e) => setPrice(m.slug, "pilgrim", e.target.value)} className={cellCls + " text-right"} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" step="1" value={value.prices[m.slug].cs} onChange={(e) => setPrice(m.slug, "cs", e.target.value)} className={cellCls + " text-right font-medium text-bosque"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
