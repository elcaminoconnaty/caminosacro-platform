"use client";

import { useState, useTransition } from "react";
import { getResourceUrl } from "./actions";

export type Resource = {
  id: string;
  name: string;
  storage_path: string;
  route_name: string | null;
};

export default function ResourcesList({ items }: { items: Resource[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function open(path: string) {
    setError(null);
    startTransition(async () => {
      const r = await getResourceUrl(path);
      if (r.url) window.open(r.url, "_blank");
      else if (r.error) setError(r.error);
    });
  }

  if (items.length === 0) {
    return <p className="text-muted text-sm">Sin recursos cargados.</p>;
  }

  return (
    <>
      {error && <div role="alert" className="mb-3 px-4 py-2 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{error}</div>}
      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <ul className="divide-y divide-border">
          {items.map((r) => (
            <li key={r.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-xs text-muted">
                  {r.route_name ? `Ruta: ${r.route_name}` : "Genérica"}
                </div>
              </div>
              <button
                onClick={() => open(r.storage_path)}
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
              >
                Ver / Descargar
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
