"use client";

import { useState, useTransition } from "react";
import { updateOptionalService } from "./actions";

export type Opt = {
  id: string;
  category: string;
  name: string;
  unit: string | null;
  price_pilgrim: number;
  price_cs: number;
};

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const CAT_LABEL: Record<string, string> = {
  seguro: "Seguros",
  // Casco y seguro de la bici (migración 0021): precio plano, no depende de la
  // ruta, por eso son opcionales normales y no viven en bike_prices.
  equipo_bici: "Equipamiento de bicicleta",
  noche_extra: "Alojamiento extra",
  meal: "Comidas",
  transfer: "Traslados",
  tour: "Tours",
  gift: "Gastronomía",
};

// Orden de los bloques en la tabla. Una categoría desconocida cae al final, en orden
// alfabético, en vez de perderse: un opcional nuevo tiene que verse aunque nadie
// haya pasado por acá a darle su lugar.
const CAT_ORDER = Object.keys(CAT_LABEL);
const catRank = (cat: string) => {
  const i = CAT_ORDER.indexOf(cat);
  return i === -1 ? CAT_ORDER.length : i;
};

type Campo = "price_pilgrim" | "price_cs";

export default function OptionalsTable({ initialRows, year }: { initialRows: Opt[]; year: number }) {
  const [rows, setRows] = useState<Opt[]>(initialRows);
  // Último valor guardado de cada fila: contra esto se decide si hubo cambio al salir de
  // la celda y a esto se vuelve si el guardado falla.
  const [saved, setSaved] = useState<Opt[]>(initialRows);
  const [, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleChange(id: string, field: Campo | "unit", value: string) {
    if (field === "unit") {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, unit: value } : r)));
      return;
    }
    const num = value === "" ? 0 : Number(value);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: num } : r)));
  }

  function handleBlur(id: string, field: Campo | "unit") {
    const row = rows.find((r) => r.id === id);
    const original = saved.find((r) => r.id === id);
    if (!row || !original) return;
    const value = field === "unit" ? (row.unit || "").trim() : row[field];
    if (value === (field === "unit" ? (original.unit || "").trim() : original[field])) return;
    setSavingId(id);
    setError(null);
    startTransition(async () => {
      const r = await updateOptionalService(id, field, field === "unit" ? value || null : value, year);
      setSavingId(null);
      if (r?.error) {
        setError(r.error);
        setRows((rs) => rs.map((rr) => (rr.id === id ? { ...rr, [field]: original[field] } : rr)));
      } else {
        setSaved((ss) => ss.map((sr) => (sr.id === id ? { ...sr, [field]: value } : sr)));
      }
    });
  }

  // Agrupar por categoría
  const byCat = new Map<string, Opt[]>();
  for (const r of rows) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push(r);
  }

  return (
    <>
      {error && (
        <div role="alert" className="mb-3 px-4 py-2 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{error}</div>
      )}
      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Servicio</th>
              <th className="text-left px-4 py-2.5" title="Define cómo se cuenta al marcarlo en la cotización: por persona, por persona y día, por persona y noche, por vehículo (hasta 4 plazas)…">Unidad</th>
              <th className="text-right px-4 py-2.5 w-32">Precio Pilgrim €</th>
              <th className="text-right px-4 py-2.5 w-32">Mi precio €</th>
              <th className="text-right px-4 py-2.5">Margen %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...byCat.entries()]
              .sort(([a], [b]) => catRank(a) - catRank(b) || a.localeCompare(b))
              .map(([cat, items]) => (
                <Section key={cat} cat={cat} items={items} savingId={savingId} handleChange={handleChange} handleBlur={handleBlur} />
              ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted">Sin opcionales cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// OJO: `Section` tiene que vivir FUERA de OptionalsTable. Declarada adentro era un
// componente nuevo en cada render: al teclear el primer dígito React desmontaba la fila,
// el input perdía el foco sin disparar onBlur y el precio nunca se guardaba (2026-09-29).
function Section({ cat, items, savingId, handleChange, handleBlur }: {
  cat: string;
  items: Opt[];
  savingId: string | null;
  handleChange: (id: string, field: Campo | "unit", value: string) => void;
  handleBlur: (id: string, field: Campo | "unit") => void;
}) {
  return (
    <>
      <tr className="bg-crema">
        <td colSpan={5} className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
          {CAT_LABEL[cat] || cat}
        </td>
      </tr>
      {items.map((r) => {
        const margenPct = r.price_cs > 0 ? ((r.price_cs - r.price_pilgrim) / r.price_cs) * 100 : 0;
        const isSaving = savingId === r.id;
        const borde = isSaving ? "border-bosque" : "border-transparent hover:border-border focus:border-bosque";
        return (
          <tr key={r.id} className="hover:bg-taupe/20">
            <td className="px-4 py-2">{r.name}</td>
            <td className="px-2 py-1.5">
              <input
                type="text"
                value={r.unit || ""}
                onChange={(e) => handleChange(r.id, "unit", e.target.value)}
                onBlur={() => handleBlur(r.id, "unit")}
                className={`w-full text-xs text-muted px-2 py-1 rounded border bg-white ${borde} focus:outline-none focus:ring-1 focus:ring-bosque/40`}
              />
            </td>
            <td className="px-2 py-1.5 text-right">
              <input
                type="number"
                step="1"
                value={r.price_pilgrim || ""}
                onChange={(e) => handleChange(r.id, "price_pilgrim", e.target.value)}
                onBlur={() => handleBlur(r.id, "price_pilgrim")}
                className={`w-full text-right px-2 py-1 rounded border bg-white ${borde} focus:outline-none focus:ring-1 focus:ring-bosque/40`}
              />
            </td>
            <td className="px-2 py-1.5 text-right">
              <input
                type="number"
                step="1"
                value={r.price_cs || ""}
                onChange={(e) => handleChange(r.id, "price_cs", e.target.value)}
                onBlur={() => handleBlur(r.id, "price_cs")}
                className={`w-full text-right font-medium text-bosque px-2 py-1 rounded border bg-white ${borde} focus:outline-none focus:ring-1 focus:ring-bosque/40`}
              />
            </td>
            <td className={`px-4 py-2 text-right tabular-nums ${margenPct >= 20 ? "text-bosque" : "text-amber-700"}`}>
              {margenPct.toFixed(1)}%
            </td>
          </tr>
        );
      })}
    </>
  );
}
