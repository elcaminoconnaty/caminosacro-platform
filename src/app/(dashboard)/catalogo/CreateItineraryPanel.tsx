"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Trash2, Save, X } from "lucide-react";
import { createItinerary, type NewStageInput } from "./actions";

type StageRow = {
  key: string;
  from_place: string;
  to_place: string;
  km: string;
  accommodation: string;
};

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function CreateItineraryPanel({
  routes,
  onClose,
}: {
  routes: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Las 3 filas iniciales usan claves fijas s0..s2; el contador arranca en 3 para las siguientes.
  const keyCounter = useRef(3);
  const emptyRow = (): StageRow => ({ key: `s${keyCounter.current++}`, from_place: "", to_place: "", km: "", accommodation: "" });
  const blankRow = (key: string): StageRow => ({ key, from_place: "", to_place: "", km: "", accommodation: "" });

  const [routeId, setRouteId] = useState("");
  const [rows, setRows] = useState<StageRow[]>(() => [blankRow("s0"), blankRow("s1"), blankRow("s2")]);

  function update(key: string, field: keyof Omit<StageRow, "key">, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function onSave() {
    setError(null);
    if (!routeId) {
      setError("Elegí una ruta.");
      return;
    }
    const stages: NewStageInput[] = rows
      .filter((r) => r.from_place.trim() || r.to_place.trim() || r.km.trim() || r.accommodation.trim())
      .map((r) => ({
        from_place: r.from_place.trim() || null,
        to_place: r.to_place.trim() || null,
        km: numOrNull(r.km),
        accommodation: r.accommodation.trim() || null,
      }));
    startTransition(async () => {
      const r = await createItinerary(routeId, stages);
      if (r?.error) setError(r.error);
      else window.location.reload();
    });
  }

  const cellCls = "w-full px-2 py-1 rounded border border-border bg-white text-xs focus:outline-none focus:ring-1 focus:ring-bosque/40 focus:border-bosque";

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg text-bosque">Crear itinerario</h3>
        <button onClick={onClose} className="text-muted hover:text-bosque transition" title="Cerrar"><X size={18} /></button>
      </div>

      <label className="text-xs text-muted block max-w-md">
        Ruta
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className="w-full px-2.5 py-1.5 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-1 focus:ring-bosque/40 focus:border-bosque">
          <option value="">— Elegí una ruta —</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>

      <p className="text-xs text-muted">Los días se numeran automáticamente según el orden. Reemplaza el itinerario actual de la ruta.</p>

      <div className="bg-white border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 w-12 text-left">Día</th>
              <th className="px-3 py-2 text-left">Desde</th>
              <th className="px-3 py-2 text-left">Hasta</th>
              <th className="px-3 py-2 w-24 text-left">Km</th>
              <th className="px-3 py-2 text-left">Alojamiento</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={r.key} className="align-top">
                <td className="px-3 py-1.5 text-muted tabular-nums">{i + 1}</td>
                <td className="px-2 py-1.5"><input value={r.from_place} onChange={(e) => update(r.key, "from_place", e.target.value)} placeholder="Sarria" className={cellCls} /></td>
                <td className="px-2 py-1.5"><input value={r.to_place} onChange={(e) => update(r.key, "to_place", e.target.value)} placeholder="Portomarín" className={cellCls} /></td>
                <td className="px-2 py-1.5"><input type="number" step="1" value={r.km} onChange={(e) => update(r.key, "km", e.target.value)} className={cellCls} /></td>
                <td className="px-2 py-1.5"><input value={r.accommodation} onChange={(e) => update(r.key, "accommodation", e.target.value)} placeholder="Pensión / hotel" className={cellCls} /></td>
                <td className="px-1 py-1.5 text-right">
                  <button onClick={() => removeRow(r.key)} title="Quitar etapa" className="text-muted hover:text-red-600 transition"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">Sin etapas. Agregá filas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="px-4 py-2 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{error}</div>}

      <div className="flex items-center justify-between gap-2">
        <button onClick={addRow} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
          <Plus size={13} /> Añadir etapa
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">Cancelar</button>
          <button onClick={onSave} disabled={pending} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50">
            <Save size={14} /> {pending ? "Guardando…" : "Guardar itinerario"}
          </button>
        </div>
      </div>
    </div>
  );
}
