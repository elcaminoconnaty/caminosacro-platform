"use client";

import { useState } from "react";

export type RouteWithStages = {
  id: string;
  name: string;
  family: string | null;
  origin: string | null;
  destination: string | null;
  days: number | null;
  km: number | null;
  stages: { day: number; from_place: string | null; to_place: string | null; km: number | null; accommodation: string | null }[];
};

export default function RouteStagesList({ routes }: { routes: RouteWithStages[] }) {
  // Agrupar por familia
  const byFamily = new Map<string, RouteWithStages[]>();
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

function RouteCard({ route }: { route: RouteWithStages }) {
  const [open, setOpen] = useState(false);
  const stages = [...route.stages].sort((a, b) => a.day - b.day);

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
            {stages.length > 0 ? ` · ${stages.length} etapas` : " · sin etapas cargadas"}
          </div>
        </div>
        <span className={`text-muted ml-3 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && stages.length > 0 && (
        <div className="border-t border-border bg-crema">
          <table className="w-full text-xs">
            <thead className="text-muted">
              <tr>
                <th className="text-left px-5 py-2 w-14">Día</th>
                <th className="text-left px-2 py-2">Etapa</th>
                <th className="text-right px-2 py-2 w-20">km</th>
                <th className="text-left px-2 py-2 pr-5 w-40">Alojamiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stages.map((s) => (
                <tr key={s.day}>
                  <td className="px-5 py-1.5 font-medium tabular-nums">{s.day}</td>
                  <td className="px-2 py-1.5">
                    {s.from_place && s.to_place
                      ? `${s.from_place} → ${s.to_place}`
                      : s.to_place || s.from_place || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{s.km ?? "—"}</td>
                  <td className="px-2 py-1.5 pr-5 text-muted">{s.accommodation || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && stages.length === 0 && (
        <div className="border-t border-border px-5 py-3 text-xs text-muted bg-crema">
          Esta ruta aún no tiene etapas cargadas.
        </div>
      )}
    </div>
  );
}
