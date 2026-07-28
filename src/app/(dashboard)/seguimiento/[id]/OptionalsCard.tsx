"use client";

import { useState, useTransition } from "react";
import { toggleQuoteOptional, updateQuoteLineQuantity } from "./actions";

export type OptionalCatalog = {
  id: string;
  category: string;
  name: string;
  unit: string;
  price_cs: number;
  price_pilgrim: number;
};

export type OptionalLine = {
  id: string;
  reference_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  cost_unit: number;
};

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const CAT_TITLE: Record<string, string> = {
  seguro: "Seguros",
  noche_extra: "Alojamiento extra en Santiago",
  meal: "Comidas",
  transfer: "Traslados privados desde Santiago",
  tour: "Tours y experiencias",
  gift: "Recuerdos y experiencias gastronómicas",
};
const CAT_ORDER = ["seguro", "noche_extra", "meal", "transfer", "tour", "gift"];

export default function OptionalsCard({
  quoteId,
  catalog,
  selected,
  baseEur,
  totalEur,
  seasonSupplementEur,
  people,
}: {
  quoteId: string;
  catalog: OptionalCatalog[];
  selected: OptionalLine[];
  baseEur: number;
  totalEur: number;
  seasonSupplementEur: number;
  people: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedByRef = new Map(selected.filter((l) => l.reference_id).map((l) => [l.reference_id!, l]));
  const sumOptionals = selected.reduce((s, l) => s + (Number(l.total) || 0), 0);
  // Lo que estos opcionales le cuestan a Pilgrim: es la parte que antes no entraba
  // al costo y por eso la utilidad salía inflada.
  const sumOptionalsCost = selected.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost_unit) || 0), 0);

  async function onToggle(optionalId: string, on: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await toggleQuoteOptional(quoteId, optionalId, on, people);
      if (r?.error) setError(r.error);
    });
  }

  async function onQty(line: OptionalLine, qty: number) {
    if (qty < 1) return;
    startTransition(async () => {
      const r = await updateQuoteLineQuantity(quoteId, line.id, qty);
      if (r?.error) setError(r.error);
    });
  }

  // Agrupar catálogo por categoría
  const byCat = new Map<string, OptionalCatalog[]>();
  for (const o of catalog) {
    if (!byCat.has(o.category)) byCat.set(o.category, []);
    byCat.get(o.category)!.push(o);
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-bosque">Servicios opcionales</h2>
          <p className="text-xs text-muted mt-0.5">
            Marcá los que van con la cotización. Se suman al total y al costo Pilgrim automáticamente.
          </p>
        </div>
        <div className="text-right text-xs">
          <div className="text-muted">Base ruta: <span className="font-medium text-fg">{eur(Number(baseEur) || 0)}</span></div>
          {Number(seasonSupplementEur) > 0 && (
            <div className="text-muted">+ Suplemento temporada: <span className="font-medium text-fg">{eur(Number(seasonSupplementEur))}</span></div>
          )}
          <div className="text-muted">+ Opcionales: <span className="font-medium text-fg">{eur(sumOptionals)}</span></div>
          <div className="font-display text-lg text-bosque mt-0.5">Total: {eur(Number(totalEur) || 0)}</div>
          {sumOptionalsCost > 0 && (
            <div className="text-muted mt-1">
              Opcionales le cuestan a Pilgrim: <span className="font-medium text-fg">{eur(sumOptionalsCost)}</span>
            </div>
          )}
        </div>
      </div>

      {error && <div className="px-5 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">{error}</div>}

      <div className="divide-y divide-border">
        {CAT_ORDER.map((cat) => {
          const items = byCat.get(cat);
          if (!items || items.length === 0) return null;
          return (
            <div key={cat} className="px-5 py-3">
              <h3 className="text-[11px] uppercase tracking-wider text-muted mb-2">{CAT_TITLE[cat] || cat}</h3>
              <ul className="space-y-1">
                {items.map((it) => {
                  const line = selectedByRef.get(it.id);
                  const checked = !!line;
                  return (
                    <li key={it.id} className="flex items-center gap-3 text-sm py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => onToggle(it.id, e.target.checked)}
                        disabled={pending}
                        className="rounded border-border w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{it.name}</span>
                        <span className="text-xs text-muted ml-2">{it.unit}</span>
                      </div>
                      {checked && line && (
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => onQty(line, Number(e.target.value) || 1)}
                          disabled={pending}
                          className="w-14 text-right px-2 py-1 rounded border border-border bg-white text-xs"
                        />
                      )}
                      {checked && line && (
                        <span className="text-xs text-muted w-12 text-right tabular-nums">× {eur(Number(line.unit_price) || 0)}</span>
                      )}
                      <span
                        className="text-xs w-24 text-right tabular-nums text-muted"
                        title="Lo que este servicio le cuesta a Pilgrim"
                      >
                        {checked && line
                          ? `Pilgrim ${eur((Number(line.quantity) || 0) * (Number(line.cost_unit) || 0))}`
                          : `Pilgrim ${eur(it.price_pilgrim)}`}
                      </span>
                      <span className={`text-sm w-20 text-right tabular-nums ${checked ? "font-medium text-bosque" : "text-muted"}`}>
                        {checked && line ? eur(Number(line.total) || 0) : eur(it.price_cs)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
