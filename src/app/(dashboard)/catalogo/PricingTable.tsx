"use client";

import { useState, useTransition } from "react";
import { applyMarkupRule, copyPricingFromPreviousYear, updatePricing, upsertPricing } from "./actions";

export type Row = {
  id: string | null; // null = fila virtual (la ruta aún no tiene precio en esta modalidad)
  route_id: string;
  modality: string;
  price_pilgrim: number;
  price_cs: number;
  route_name: string;
};

// Clave estable de fila: sobrevive al insert de una fila virtual (que le asigna id).
const keyOf = (r: Pick<Row, "route_id" | "modality">) => `${r.route_id}:${r.modality}`;

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const MODALITY_LABEL: Record<string, string> = {
  pension_doble: "Pensión doble",
  pension_single: "Pensión single",
  hotel_doble: "Hotel doble",
  hotel_single: "Hotel single",
};

export default function PricingTable({ initialRows, year }: { initialRows: Row[]; year: number }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRule, setConfirmRule] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const vacio = rows.every((r) => r.id == null);

  function handleChange(key: string, field: "price_pilgrim" | "price_cs", value: string) {
    const num = value === "" ? 0 : Number(value);
    setRows((rs) => rs.map((r) => (keyOf(r) === key ? { ...r, [field]: num } : r)));
  }

  async function handleBlur(row: Row, field: "price_pilgrim" | "price_cs", original: number) {
    const value = row[field];
    if (value === original) return;
    const key = keyOf(row);
    setSavingId(key);
    setError(null);
    startTransition(async () => {
      const r = row.id
        ? await updatePricing(row.id, field, value)
        : await upsertPricing(row.route_id, row.modality, field, value, year);
      setSavingId(null);
      if (r?.error) {
        setError(r.error);
        setRows((rs) => rs.map((rr) => (keyOf(rr) === key ? { ...rr, [field]: original } : rr)));
      } else if (!row.id && "id" in r && typeof r.id === "string") {
        const newId = r.id;
        setRows((rs) => rs.map((rr) => (keyOf(rr) === key ? { ...rr, id: newId } : rr)));
      }
    });
  }

  async function handleApplyRule() {
    setError(null);
    startTransition(async () => {
      const r = await applyMarkupRule(year);
      setConfirmRule(false);
      if (r?.error) setError(r.error);
      else if (r?.ok) {
        // Recalcular en cliente para reflejar inmediatamente
        setRows((rs) =>
          rs.map((row) =>
            row.price_pilgrim > 0
              ? { ...row, price_cs: Math.round(Math.max(row.price_pilgrim + 100, row.price_pilgrim / 0.85)) }
              : row,
          ),
        );
      }
    });
  }

  // Arranque de un año nuevo: copia el anterior como punto de partida para editar encima.
  // Nunca pisa una tarifa ya cargada; el CRM sigue exigiendo el año exacto al cotizar.
  async function handleCopyYear() {
    setError(null);
    setCopyMsg(null);
    startTransition(async () => {
      const r = await copyPricingFromPreviousYear(year);
      if (r?.error) setError(r.error);
      else if (r?.ok) {
        const total = (r.copied ?? 0) + (r.copiedOptionals ?? 0);
        setCopyMsg(
          total === 0
            ? `No faltaba nada: ${year} ya tiene todos los precios de ${r.from}.`
            : `Se copiaron ${r.copied} tarifas de ruta y ${r.copiedOptionals} precios de opcionales desde ${r.from}. Recargá para verlos y ajustalos con los precios reales de ${year}.`,
        );
      }
    });
  }

  // Agrupado por ruta
  const byRoute = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byRoute.has(r.route_name)) byRoute.set(r.route_name, []);
    byRoute.get(r.route_name)!.push(r);
  }
  const routeNames = [...byRoute.keys()].sort();

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-muted">Tarifas {year}. Click en cualquier precio para editarlo. Se guarda automáticamente al salir del campo. Toda edición queda registrada en histórico.</p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleCopyYear}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg-card hover:bg-taupe/40 transition disabled:opacity-50"
          >
            Copiar tarifas de {year - 1}
          </button>
          <button
            onClick={() => setConfirmRule(true)}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg-card hover:bg-taupe/40 transition disabled:opacity-50"
          >
            Aplicar regla automática
          </button>
        </div>
      </div>

      {vacio && (
        <div className="mb-3 px-4 py-3 rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-900">
          Todavía no hay tarifas {year} cargadas. Mientras estén vacías, el asistente no
          autocarga precios para salidas de {year}: avisa y hay que teclearlos a mano.
        </div>
      )}

      {copyMsg && (
        <div className="mb-3 px-4 py-3 rounded-md border border-bosque/30 bg-bosque/5 text-sm text-bosque">{copyMsg}</div>
      )}

      {confirmRule && (
        <div className="mb-3 px-4 py-3 rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-900 flex items-center justify-between gap-3">
          <span>
            Aplicar <code className="font-mono text-xs">max(Pilgrim+100, Pilgrim÷0.85)</code> a todas las filas {year} con precio Pilgrim. Sobrescribe los precios CS actuales de {year}.
          </span>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setConfirmRule(false)} className="text-xs px-3 py-1 rounded-md border border-amber-300 hover:bg-amber-100">Cancelar</button>
            <button onClick={handleApplyRule} disabled={pending} className="text-xs px-3 py-1 rounded-md bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50">
              {pending ? "Aplicando…" : "Aplicar"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 px-4 py-2 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{error}</div>
      )}

      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Ruta</th>
              <th className="text-left px-4 py-2.5">Modalidad</th>
              <th className="text-right px-4 py-2.5 w-32">Precio Pilgrim €</th>
              <th className="text-right px-4 py-2.5 w-32">Mi precio €</th>
              <th className="text-right px-4 py-2.5">Margen €</th>
              <th className="text-right px-4 py-2.5">Margen %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {routeNames.map((routeName) => {
              const routeRows = byRoute.get(routeName)!;
              return routeRows.map((r, idx) => {
                const margenEur = r.price_cs - r.price_pilgrim;
                const margenPct = r.price_cs > 0 ? (margenEur / r.price_cs) * 100 : 0;
                const isSaving = savingId === keyOf(r);
                const sinPrecio = r.price_pilgrim === 0 && r.price_cs === 0;
                return (
                  <tr key={keyOf(r)} className="hover:bg-taupe/20">
                    <td className="px-4 py-2 align-top">
                      {idx === 0 ? <span className="font-medium">{routeName}</span> : <span className="text-muted">↳</span>}
                    </td>
                    <td className="px-4 py-2 text-muted">{MODALITY_LABEL[r.modality] || r.modality}</td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="1"
                        value={r.price_pilgrim || ""}
                        onChange={(e) => handleChange(keyOf(r), "price_pilgrim", e.target.value)}
                        onBlur={() => handleBlur(r, "price_pilgrim", initialRows.find((x) => keyOf(x) === keyOf(r))?.price_pilgrim ?? 0)}
                        className={`w-full text-right px-2 py-1 rounded border bg-white ${isSaving ? "border-bosque" : "border-transparent hover:border-border focus:border-bosque"} focus:outline-none focus:ring-1 focus:ring-bosque/40`}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="1"
                        value={r.price_cs || ""}
                        onChange={(e) => handleChange(keyOf(r), "price_cs", e.target.value)}
                        onBlur={() => handleBlur(r, "price_cs", initialRows.find((x) => keyOf(x) === keyOf(r))?.price_cs ?? 0)}
                        className={`w-full text-right font-medium text-bosque px-2 py-1 rounded border bg-white ${isSaving ? "border-bosque" : "border-transparent hover:border-border focus:border-bosque"} focus:outline-none focus:ring-1 focus:ring-bosque/40`}
                      />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{sinPrecio ? <span className="text-muted">—</span> : eur(margenEur)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${sinPrecio ? "text-muted" : margenPct >= 20 ? "text-bosque" : margenPct > 0 ? "text-amber-700" : "text-red-700"}`}>
                      {sinPrecio ? "—" : `${margenPct.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              });
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">Sin precios cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
