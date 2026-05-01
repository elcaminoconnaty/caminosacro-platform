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
  noche_extra: "Alojamiento extra",
  meal: "Comidas",
  transfer: "Traslados",
  tour: "Tours",
  gift: "Gastronomía",
};

export default function OptionalsTable({ initialRows }: { initialRows: Opt[] }) {
  const [rows, setRows] = useState<Opt[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleChange(id: string, field: "price_pilgrim" | "price_cs", value: string) {
    const num = value === "" ? 0 : Number(value);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: num } : r)));
  }

  async function handleBlur(row: Opt, field: "price_pilgrim" | "price_cs", original: number) {
    const value = row[field];
    if (value === original) return;
    setSavingId(row.id);
    setError(null);
    startTransition(async () => {
      const r = await updateOptionalService(row.id, field, value);
      setSavingId(null);
      if (r?.error) {
        setError(r.error);
        setRows((rs) => rs.map((rr) => (rr.id === row.id ? { ...rr, [field]: original } : rr)));
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
        <div className="mb-3 px-4 py-2 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{error}</div>
      )}
      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Servicio</th>
              <th className="text-left px-4 py-2.5">Unidad</th>
              <th className="text-right px-4 py-2.5 w-32">Precio Pilgrim €</th>
              <th className="text-right px-4 py-2.5 w-32">Mi precio €</th>
              <th className="text-right px-4 py-2.5">Margen %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...byCat.entries()].map(([cat, items]) => (
              <Section key={cat} cat={cat} items={items} savingId={savingId} initialRows={initialRows} handleChange={handleChange} handleBlur={handleBlur} />
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted">Sin opcionales cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  function Section({ cat, items, savingId, initialRows, handleChange, handleBlur }: {
    cat: string;
    items: Opt[];
    savingId: string | null;
    initialRows: Opt[];
    handleChange: (id: string, field: "price_pilgrim" | "price_cs", value: string) => void;
    handleBlur: (row: Opt, field: "price_pilgrim" | "price_cs", original: number) => void;
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
          return (
            <tr key={r.id} className="hover:bg-taupe/20">
              <td className="px-4 py-2">{r.name}</td>
              <td className="px-4 py-2 text-muted text-xs">{r.unit}</td>
              <td className="px-2 py-1.5 text-right">
                <input
                  type="number"
                  step="1"
                  value={r.price_pilgrim || ""}
                  onChange={(e) => handleChange(r.id, "price_pilgrim", e.target.value)}
                  onBlur={() => handleBlur(r, "price_pilgrim", initialRows.find((x) => x.id === r.id)!.price_pilgrim)}
                  className={`w-full text-right px-2 py-1 rounded border bg-white ${isSaving ? "border-bosque" : "border-transparent hover:border-border focus:border-bosque"} focus:outline-none focus:ring-1 focus:ring-bosque/40`}
                />
              </td>
              <td className="px-2 py-1.5 text-right">
                <input
                  type="number"
                  step="1"
                  value={r.price_cs || ""}
                  onChange={(e) => handleChange(r.id, "price_cs", e.target.value)}
                  onBlur={() => handleBlur(r, "price_cs", initialRows.find((x) => x.id === r.id)!.price_cs)}
                  className={`w-full text-right font-medium text-bosque px-2 py-1 rounded border bg-white ${isSaving ? "border-bosque" : "border-transparent hover:border-border focus:border-bosque"} focus:outline-none focus:ring-1 focus:ring-bosque/40`}
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
}
