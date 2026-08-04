"use client";

import { useState, useTransition } from "react";
import { Save, X } from "lucide-react";
import { createRoute, type NewRoutePrice } from "./actions";

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const MODALITIES = [
  { slug: "pension_doble", label: "Pensión doble" },
  { slug: "pension_single", label: "Pensión single" },
  { slug: "hotel_doble", label: "Hotel doble" },
  { slug: "hotel_single", label: "Hotel single" },
];

const DIFFICULTIES = ["Media", "Media-Alta", "Alta"];

type PriceState = Record<string, { pilgrim: string; cs: string }>;

const emptyPrices: PriceState = Object.fromEntries(MODALITIES.map((m) => [m.slug, { pilgrim: "", cs: "" }]));

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function CreateRoutePanel({ families, onClose, year }: { families: string[]; onClose: () => void; year: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [family, setFamily] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [days, setDays] = useState("");
  const [nights, setNights] = useState("");
  const [km, setKm] = useState("");
  const [modality, setModality] = useState("senderismo");
  const [difficulty, setDifficulty] = useState("Media");
  const [description, setDescription] = useState("");
  const [web, setWeb] = useState(false);
  const [prices, setPrices] = useState<PriceState>(emptyPrices);

  function setPrice(slug: string, field: "pilgrim" | "cs", value: string) {
    setPrices((p) => ({ ...p, [slug]: { ...p[slug], [field]: value } }));
  }

  function onSave() {
    setError(null);
    if (!name.trim()) {
      setError("El nombre de la ruta es obligatorio.");
      return;
    }
    const priceRows: NewRoutePrice[] = MODALITIES.map((m) => ({
      modality: m.slug,
      price_pilgrim: numOrNull(prices[m.slug].pilgrim),
      price_cs: numOrNull(prices[m.slug].cs),
    }));
    startTransition(async () => {
      const r = await createRoute({
        name: name.trim(),
        family: family.trim() || null,
        origin: origin.trim() || null,
        destination: destination.trim() || null,
        days: numOrNull(days),
        nights: numOrNull(nights),
        km: numOrNull(km),
        modality,
        difficulty: difficulty.trim() || null,
        description: description.trim() || null,
        web,
        prices: priceRows,
        year,
      });
      if (r?.error) setError(r.error);
      else window.location.reload();
    });
  }

  const inputCls =
    "w-full px-2.5 py-1.5 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-1 focus:ring-bosque/40 focus:border-bosque";

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg text-bosque">Crear ruta</h3>
        <button onClick={onClose} className="text-muted hover:text-bosque transition" title="Cerrar"><X size={18} /></button>
      </div>

      {/* Datos de la ruta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="text-xs text-muted sm:col-span-2 lg:col-span-1">
          Nombre *
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Camino Francés — Sarria a Santiago" className={inputCls} />
        </label>
        <label className="text-xs text-muted">
          Familia (Camino)
          <input list="route-families" value={family} onChange={(e) => setFamily(e.target.value)} placeholder="Francés" className={inputCls} />
          <datalist id="route-families">
            {families.map((f) => <option key={f} value={f} />)}
          </datalist>
        </label>
        <label className="text-xs text-muted">
          Modalidad
          <select value={modality} onChange={(e) => setModality(e.target.value)} className={inputCls}>
            <option value="senderismo">Senderismo</option>
            <option value="bici">Bici</option>
            <option value="mixto">Mixto</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Origen
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Sarria" className={inputCls} />
        </label>
        <label className="text-xs text-muted">
          Destino
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Santiago de Compostela" className={inputCls} />
        </label>
        <label className="text-xs text-muted">
          Dificultad
          <input list="route-difficulties" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={inputCls} />
          <datalist id="route-difficulties">
            {DIFFICULTIES.map((d) => <option key={d} value={d} />)}
          </datalist>
        </label>
        <label className="text-xs text-muted">
          Días
          <input type="number" step="1" value={days} onChange={(e) => setDays(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-muted">
          Noches
          <input type="number" step="1" value={nights} onChange={(e) => setNights(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-muted">
          Km
          <input type="number" step="1" value={km} onChange={(e) => setKm(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-muted sm:col-span-2 lg:col-span-3">
          Descripción
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" className={inputCls} />
        </label>
        <label className="text-xs text-muted sm:col-span-2 lg:col-span-3 inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} className="rounded border-border" />
          <span>Visible en el cotizador web (caminosacro.com). Para cotizar al instante necesita las 4 tarifas cargadas.</span>
        </label>
      </div>

      {/* Precios por modalidad con margen en vivo */}
      <div>
        <p className="text-xs text-muted mb-2">Precios por modalidad — dejá en blanco las que no apliquen. El margen se calcula solo.</p>
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">Modalidad</th>
                <th className="text-right px-3 py-2 w-32">Precio Pilgrim €</th>
                <th className="text-right px-3 py-2 w-32">Mi precio €</th>
                <th className="text-right px-3 py-2">Margen €</th>
                <th className="text-right px-3 py-2">Margen %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MODALITIES.map((m) => {
                const pilgrim = numOrNull(prices[m.slug].pilgrim) ?? 0;
                const cs = numOrNull(prices[m.slug].cs) ?? 0;
                const margenEur = cs - pilgrim;
                const margenPct = cs > 0 ? (margenEur / cs) * 100 : 0;
                const hasValues = prices[m.slug].pilgrim !== "" || prices[m.slug].cs !== "";
                return (
                  <tr key={m.slug} className="hover:bg-taupe/20">
                    <td className="px-3 py-2 text-muted">{m.label}</td>
                    <td className="px-2 py-1.5 text-right">
                      <input type="number" step="1" value={prices[m.slug].pilgrim} onChange={(e) => setPrice(m.slug, "pilgrim", e.target.value)}
                        className="w-full text-right px-2 py-1 rounded border border-border bg-white focus:outline-none focus:ring-1 focus:ring-bosque/40 focus:border-bosque" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input type="number" step="1" value={prices[m.slug].cs} onChange={(e) => setPrice(m.slug, "cs", e.target.value)}
                        className="w-full text-right font-medium text-bosque px-2 py-1 rounded border border-border bg-white focus:outline-none focus:ring-1 focus:ring-bosque/40 focus:border-bosque" />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{hasValues ? eur(margenEur) : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${!hasValues ? "text-muted" : margenPct >= 20 ? "text-bosque" : margenPct > 0 ? "text-amber-700" : "text-red-700"}`}>
                      {hasValues ? `${margenPct.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && <div className="px-4 py-2 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{error}</div>}

      <div className="flex items-center justify-end gap-2">
        <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">Cancelar</button>
        <button onClick={onSave} disabled={pending} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50">
          <Save size={14} /> {pending ? "Guardando…" : "Guardar ruta"}
        </button>
      </div>
    </div>
  );
}
