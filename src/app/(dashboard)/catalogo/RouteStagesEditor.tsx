"use client";

import { useState, useTransition } from "react";
import { addRouteStage, deleteRouteStage, swapRouteStages, updateRouteStageField, type RouteStageField } from "./actions";

export type Stage = {
  id: string;
  day: number;
  from_place: string | null;
  to_place: string | null;
  km: number | null;
  accommodation: string | null;
};

export type RouteWithStagesEditable = {
  id: string;
  name: string;
  family: string | null;
  origin: string | null;
  destination: string | null;
  days: number | null;
  km: number | null;
  stages: Stage[];
};

export default function RouteStagesEditor({ routes }: { routes: RouteWithStagesEditable[] }) {
  const byFamily = new Map<string, RouteWithStagesEditable[]>();
  for (const r of routes) {
    const fam = r.family || "Sin familia";
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam)!.push(r);
  }
  const families = [...byFamily.keys()].sort();

  return (
    <div className="space-y-6">
      {families.map((fam) => {
        const items = byFamily.get(fam)!.sort((a, b) => (b.days || 0) - (a.days || 0));
        return (
          <div key={fam}>
            <h3 className="font-display text-lg text-bosque mb-2">{fam}</h3>
            <div className="space-y-2">
              {items.map((r) => <RouteCard key={r.id} route={r} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RouteCard({ route }: { route: RouteWithStagesEditable }) {
  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState<Stage[]>([...route.stages].sort((a, b) => a.day - b.day));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const stageMatchesDays = route.days != null && stages.length === route.days;
  const summary = stages.length === 0
    ? "sin etapas cargadas"
    : `${stages.length} etapa${stages.length === 1 ? "" : "s"}${route.days != null && !stageMatchesDays ? ` ⚠ no coincide con ${route.days} días` : ""}`;

  function patchLocal(stageId: string, field: keyof Stage, value: string | number | null) {
    setStages((sts) => sts.map((s) => (s.id === stageId ? { ...s, [field]: value } : s)));
  }

  async function handleBlur(stage: Stage, field: RouteStageField, original: string | number | null) {
    const current = stage[field as keyof Stage];
    if (current === original) return;
    setError(null);
    startTransition(async () => {
      const r = await updateRouteStageField(stage.id, field, current as string | number | null);
      if (r?.error) {
        setError(r.error);
        patchLocal(stage.id, field as keyof Stage, original);
      }
    });
  }

  async function handleAdd() {
    setError(null);
    startTransition(async () => {
      const r = await addRouteStage(route.id);
      if (r?.error) { setError(r.error); return; }
      if (r?.stage) {
        setStages((sts) => [...sts, { id: r.stage.id, day: r.stage.day, from_place: null, to_place: null, km: null, accommodation: null }]);
      }
    });
  }

  async function handleDelete(stage: Stage) {
    setError(null);
    if (!confirm(`¿Eliminar el día ${stage.day}? Las etapas posteriores se renumerarán.`)) return;
    startTransition(async () => {
      const r = await deleteRouteStage(stage.id);
      if (r?.error) { setError(r.error); return; }
      // Recalcular local: filtrar y restar 1 a los days posteriores
      setStages((sts) =>
        sts
          .filter((s) => s.id !== stage.id)
          .map((s) => (s.day > stage.day ? { ...s, day: s.day - 1 } : s))
          .sort((a, b) => a.day - b.day),
      );
    });
  }

  async function handleSwap(stage: Stage, direction: -1 | 1) {
    setError(null);
    const sorted = [...stages].sort((a, b) => a.day - b.day);
    const idx = sorted.findIndex((s) => s.id === stage.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    startTransition(async () => {
      const r = await swapRouteStages(stage.id, swapWith.id);
      if (r?.error) { setError(r.error); return; }
      setStages((sts) =>
        sts.map((s) => {
          if (s.id === stage.id) return { ...s, day: swapWith.day };
          if (s.id === swapWith.id) return { ...s, day: stage.day };
          return s;
        }).sort((a, b) => a.day - b.day),
      );
    });
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-taupe/30 transition text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{route.name}</div>
          <div className="text-xs text-muted mt-0.5">
            {route.origin} → {route.destination || "Santiago"}
            {route.days != null && ` · ${route.days} días`}
            {route.km != null && ` · ${route.km} km`}
            {` · `}
            <span className={!stageMatchesDays && stages.length > 0 ? "text-amber-700" : ""}>{summary}</span>
          </div>
        </div>
        <span className={`text-muted ml-3 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>

      {open && (
        <div className="border-t border-border bg-crema">
          {error && <div role="alert" className="px-5 py-2 text-sm text-red-800 bg-red-50 border-b border-red-200">{error}</div>}

          {stages.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="text-left px-3 py-2 w-20">Día</th>
                  <th className="text-left px-2 py-2">Desde</th>
                  <th className="text-left px-2 py-2">Hasta</th>
                  <th className="text-right px-2 py-2 w-16">km</th>
                  <th className="text-left px-2 py-2 w-44">Alojamiento</th>
                  <th className="px-2 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stages.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-taupe/20">
                    <td className="px-3 py-1.5 font-medium tabular-nums">
                      <div className="flex items-center gap-1">
                        <span>{s.day}</span>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => handleSwap(s, -1)}
                            disabled={pending || idx === 0}
                            className="text-muted hover:text-fg disabled:opacity-30 leading-none"
                            title="Subir"
                          >▲</button>
                          <button
                            type="button"
                            onClick={() => handleSwap(s, 1)}
                            disabled={pending || idx === stages.length - 1}
                            className="text-muted hover:text-fg disabled:opacity-30 leading-none"
                            title="Bajar"
                          >▼</button>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <CellInput
                        value={s.from_place}
                        onChange={(v) => patchLocal(s.id, "from_place", v)}
                        onCommit={() => handleBlur(s, "from_place", route.stages.find((x) => x.id === s.id)?.from_place ?? null)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CellInput
                        value={s.to_place}
                        onChange={(v) => patchLocal(s.id, "to_place", v)}
                        onCommit={() => handleBlur(s, "to_place", route.stages.find((x) => x.id === s.id)?.to_place ?? null)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CellInput
                        type="number"
                        value={s.km != null ? String(s.km) : ""}
                        onChange={(v) => patchLocal(s.id, "km", v === "" ? null : Number(v))}
                        onCommit={() => handleBlur(s, "km", route.stages.find((x) => x.id === s.id)?.km ?? null)}
                        align="right"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <CellInput
                        value={s.accommodation}
                        onChange={(v) => patchLocal(s.id, "accommodation", v)}
                        onCommit={() => handleBlur(s, "accommodation", route.stages.find((x) => x.id === s.id)?.accommodation ?? null)}
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(s)}
                        disabled={pending}
                        className="text-xs text-red-700 hover:underline disabled:opacity-40"
                      >Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-5 py-3 text-xs text-muted">Esta ruta aún no tiene etapas. Añade el primer día abajo.</div>
          )}

          <div className="px-5 py-2 border-t border-border flex justify-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg-card hover:bg-taupe/40 transition disabled:opacity-50"
            >
              + Añadir día
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CellInput({
  value, onChange, onCommit, type = "text", align = "left",
}: {
  value: string | null;
  onChange: (v: string) => void;
  onCommit: () => void;
  type?: "text" | "number";
  align?: "left" | "right";
}) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      className={`w-full px-2 py-1 rounded border border-transparent hover:border-border focus:border-bosque focus:outline-none focus:ring-1 focus:ring-bosque/40 bg-white ${align === "right" ? "text-right tabular-nums" : ""}`}
    />
  );
}
