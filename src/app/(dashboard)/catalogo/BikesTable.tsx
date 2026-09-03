"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { bikesForRouteYear, type BikePriceRow, type BikeRow } from "@/lib/bikes/catalog";
import { applyBikeRule, updateBikePrice } from "./actions";

/** Una ruta de bici, tal como se pinta en el encabezado de columna. */
export type BikeRouteCol = {
  id: string;
  name: string;
  /** Días de alquiler que cubre la tarifa de esa ruta (5 / 6 / 8). */
  days: number | null;
};

/** Valor editable de una celda. `null` = tarifa sin cargar, distinto de un precio de 0. */
type Cell = { price_pilgrim: number | null; price_cs: number | null };
type Cells = Record<string, Cell>;

// Clave estable de celda. La fila real en bike_prices puede no existir todavía (ruta de
// bici nueva), así que la identidad es el par bici×ruta, nunca el id de la fila.
const keyOf = (bikeId: string, routeId: string) => `${bikeId}:${routeId}`;

/** Margen de agencia sobre precio de venta: 15 %. Ver `applyBikeRule` en actions.ts. */
const COMISION_AGENCIA = 0.85;

/** Celda sin fila en bike_prices: las dos tarifas sin cargar. */
const VACIA: Cell = { price_pilgrim: null, price_cs: null };

function buildCells(prices: BikePriceRow[], year: number): Cells {
  const out: Cells = {};
  for (const p of prices) {
    if (p.year !== year) continue;
    out[keyOf(p.bike_id, p.route_id)] = { price_pilgrim: p.price_pilgrim, price_cs: p.price_cs };
  }
  return out;
}

export default function BikesTable({
  bikes,
  prices,
  routes,
  year,
}: {
  bikes: BikeRow[];
  prices: BikePriceRow[];
  routes: BikeRouteCol[];
  year: number;
}) {
  // Fuente única del orden de filas: el mismo helper que usan el PDF y el catálogo público,
  // con routeId null porque acá las tarifas las resuelve la grilla, no una ruta concreta.
  const modelos = bikesForRouteYear(bikes, prices, null, year);

  const [cells, setCells] = useState<Cells>(() => buildCells(prices, year));
  // Último valor confirmado por la DB. En ref y no en estado porque no se pinta: solo sirve
  // para saber si hubo cambio real al salir del campo y para revertir si el guardado falla.
  const guardado = useRef<Cells>(buildCells(prices, year));
  const [pending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRule, setConfirmRule] = useState(false);

  const get = (bikeId: string, routeId: string): Cell => cells[keyOf(bikeId, routeId)] ?? VACIA;

  // Año sin una sola tarifa: mismo aviso en ámbar que usa el resto del catálogo.
  const vacio = modelos.length > 0 && routes.every((rt) => modelos.every((b) => get(b.id, rt.id).price_pilgrim == null && get(b.id, rt.id).price_cs == null));

  function handleChange(bikeId: string, routeId: string, field: keyof Cell, value: string) {
    // Campo vacío ⇒ null, no 0: "todavía no me pasaron la tarifa" no es "cuesta cero".
    const parsed = Number(value);
    const num = value.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
    const key = keyOf(bikeId, routeId);
    setCells((cs) => ({ ...cs, [key]: { ...(cs[key] ?? VACIA), [field]: num } }));
  }

  function handleBlur(bikeId: string, routeId: string, field: keyof Cell) {
    const key = keyOf(bikeId, routeId);
    const value = get(bikeId, routeId)[field];
    const original = (guardado.current[key] ?? VACIA)[field];
    if (value === original) return;
    setSavingKey(key);
    setError(null);
    startTransition(async () => {
      const r = await updateBikePrice(bikeId, routeId, year, field, value);
      setSavingKey(null);
      if (r?.error) {
        setError(r.error);
        // Revertir a lo último que sí quedó guardado, para no dejar en pantalla un precio
        // que la DB no tiene (que es exactamente el error que se cotizaría después).
        setCells((cs) => ({ ...cs, [key]: { ...(cs[key] ?? VACIA), [field]: original } }));
      } else {
        guardado.current[key] = { ...(guardado.current[key] ?? VACIA), [field]: value };
      }
    });
  }

  function handleApplyRule() {
    setError(null);
    startTransition(async () => {
      const r = await applyBikeRule(year);
      setConfirmRule(false);
      if (r?.error) setError(r.error);
      else if (r?.ok) {
        // Espejo en cliente de lo que acaba de hacer el servidor, para verlo sin recargar.
        setCells((cs) => {
          const next: Cells = { ...cs };
          for (const k of Object.keys(next)) {
            const p = next[k].price_pilgrim;
            if (p != null && p > 0) {
              next[k] = { ...next[k], price_cs: Math.round(p / COMISION_AGENCIA) };
              guardado.current[k] = { ...(guardado.current[k] ?? next[k]), price_cs: next[k].price_cs };
            }
          }
          return next;
        });
      }
    });
  }

  if (routes.length === 0) {
    return (
      <div className="bg-bg-card border border-border rounded-xl px-4 py-10 text-center text-sm text-muted">
        No hay rutas en bici cargadas. Creá una ruta con modalidad <span className="font-mono text-xs">bici</span> y
        acá aparece una columna por ruta para teclear la tarifa de alquiler de cada modelo.
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-muted">
          Tarifas {year}. Click en cualquier precio para editarlo; se guarda al salir del campo y queda en histórico.
          Las celdas en ámbar están <strong className="font-medium text-amber-700">sin cargar</strong>: falta pedirle
          esa tarifa a Pilgrim. Vaciar un campo la devuelve a ese estado.
        </p>
        <div className="flex gap-2 shrink-0">
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
          Todavía no hay tarifas de bicicleta {year} cargadas. Mientras estén vacías, el asistente no
          autocarga precios de alquiler para salidas de {year}: avisa y hay que teclearlos a mano.
        </div>
      )}

      {confirmRule && (
        <div className="mb-3 px-4 py-3 rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-900 flex items-center justify-between gap-3">
          <span>
            Aplicar <code className="font-mono text-xs">Pilgrim ÷ 0,85</code> (comisión de agencia del 15 %) a todas
            las tarifas de bici {year} con precio Pilgrim. Sobrescribe los precios CS actuales de {year}. No es la
            misma regla que las rutas.
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
        <div role="alert" className="mb-3 px-4 py-2 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">{error}</div>
      )}

      <div className="bg-bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th rowSpan={2} className="text-left px-4 py-2.5 align-bottom">Bicicleta</th>
              {routes.map((rt) => (
                <th key={rt.id} colSpan={2} className="text-center px-2 py-2 border-l border-border">
                  <span className="block normal-case text-[13px] tracking-normal text-fg font-medium">{rt.name}</span>
                  {/* Los días explican por qué la misma bici vale distinto en cada ruta. */}
                  <span className="block normal-case tracking-normal text-[11px] font-normal">
                    {rt.days ? `${rt.days} días de alquiler` : "días sin definir"}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {routes.map((rt) => (
                <FragmentCols key={rt.id} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {modelos.map((b) => (
              <tr key={b.id} className="hover:bg-taupe/20">
                <td className="px-4 py-2 align-middle">
                  <span className="block text-[11px] uppercase tracking-wider text-muted">{b.category_label}</span>
                  <span className="font-medium">{b.name}</span>
                </td>
                {routes.map((rt) => {
                  const key = keyOf(b.id, rt.id);
                  const cell = get(b.id, rt.id);
                  const isSaving = savingKey === key;
                  // "Sin cargar" se define por el precio Pilgrim: es el dato que falta pedir.
                  const sinCargar = cell.price_pilgrim == null;
                  const cellCls = sinCargar ? "bg-amber-50/70" : "";
                  const inputCls = (extra: string) =>
                    `w-full text-right px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-bosque/40 ${extra} ${
                      isSaving
                        ? "border-bosque bg-white"
                        : sinCargar
                          ? "bg-white/70 border-amber-200 hover:border-amber-400 focus:border-bosque placeholder:text-amber-700/70"
                          : "bg-white border-transparent hover:border-border focus:border-bosque"
                    }`;
                  return (
                    <FragmentCells
                      key={key}
                      cellCls={cellCls}
                      pilgrim={
                        <input
                          type="number"
                          step="1"
                          placeholder="—"
                          aria-label={`Precio Pilgrim de ${b.name} en ${rt.name}`}
                          value={cell.price_pilgrim ?? ""}
                          onChange={(e) => handleChange(b.id, rt.id, "price_pilgrim", e.target.value)}
                          onBlur={() => handleBlur(b.id, rt.id, "price_pilgrim")}
                          className={inputCls("")}
                        />
                      }
                      cs={
                        <input
                          type="number"
                          step="1"
                          placeholder="—"
                          aria-label={`Mi precio de ${b.name} en ${rt.name}`}
                          value={cell.price_cs ?? ""}
                          onChange={(e) => handleChange(b.id, rt.id, "price_cs", e.target.value)}
                          onBlur={() => handleBlur(b.id, rt.id, "price_cs")}
                          className={inputCls("font-medium text-bosque")}
                        />
                      }
                    />
                  );
                })}
              </tr>
            ))}
            {modelos.length === 0 && (
              <tr>
                <td colSpan={1 + routes.length * 2} className="px-4 py-12 text-center text-muted">
                  No hay bicicletas activas en la flota.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Sub-encabezado de las dos columnas de precio de cada ruta. */
function FragmentCols() {
  return (
    <>
      <th className="text-right px-2 py-1.5 w-28 border-l border-border font-normal">Pilgrim €</th>
      <th className="text-right px-2 py-1.5 w-28 font-normal">Mi precio €</th>
    </>
  );
}

/** Las dos celdas de precio de una ruta, con el fondo compartido de "sin cargar". */
function FragmentCells({ cellCls, pilgrim, cs }: { cellCls: string; pilgrim: ReactNode; cs: ReactNode }) {
  return (
    <>
      <td className={`px-2 py-1.5 border-l border-border ${cellCls}`}>{pilgrim}</td>
      <td className={`px-2 py-1.5 ${cellCls}`}>{cs}</td>
    </>
  );
}
