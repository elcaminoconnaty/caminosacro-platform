"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  MAX_ROOM_ROWS,
  ROOM_KINDS,
  filaVacia,
  personasDeFila,
  roomRowLabel,
  totalesHabitacion,
  type RoomKind,
  type RoomRow,
  type TipoAlojamiento,
} from "@/lib/quotes/rooms";

/**
 * El reparto de habitaciones tecleado a mano, con su plata al pie.
 *
 * Lo usan el asistente (crear cotización) y el editor del expediente, con el mismo estado
 * y las mismas cuentas: si el reparto se calculara distinto en las dos pantallas, editar
 * una cotización le cambiaría el total sin que nadie tocara un precio.
 *
 * El dueño del estado es quien lo monta; acá solo se edita la lista y se muestra el
 * cuadre contra el número de personas del grupo.
 */

const inputCls =
  "w-full px-2 py-1.5 rounded border border-border bg-white text-sm focus:outline-none focus:ring-1 focus:ring-bosque/40 focus:border-bosque";

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);

export default function RoomsPanel({
  rows,
  onChange,
  people,
  className = "",
}: {
  rows: RoomRow[];
  onChange: (rows: RoomRow[]) => void;
  /** Personas del grupo, para avisar si el reparto no cuadra. */
  people: number;
  className?: string;
}) {
  const totales = totalesHabitacion(rows);
  const cuadra = totales.personas === people;
  const faltanPrecios = rows.some((r) => personasDeFila(r) > 0 && (Number(r.precio_cs) || 0) <= 0);

  const setRow = (i: number, patch: Partial<RoomRow>) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <div className={`bg-white border border-border rounded-lg p-3 space-y-3 ${className}`}>
      <p className="text-xs text-muted">
        Una fila por tipo de habitación (hasta {MAX_ROOM_ROWS}). Los precios son <strong>por persona</strong>:
        el tuyo sale en el PDF del cliente, el de Pilgrim es solo para el seguimiento. La base
        del grupo y el costo se calculan solos.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-2 py-1.5 w-28">Alojamiento</th>
              <th className="text-left px-2 py-1.5 w-32">Habitación</th>
              <th className="text-right px-2 py-1.5 w-16">Hab.</th>
              <th className="text-right px-2 py-1.5 w-16">Pers.</th>
              <th className="text-right px-2 py-1.5 w-28">Mi precio €</th>
              <th className="text-right px-2 py-1.5 w-28">Pilgrim €</th>
              <th className="text-right px-2 py-1.5 w-24">Subtotal</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const personas = personasDeFila(r);
              return (
                <tr key={i} className="align-middle">
                  <td className="px-2 py-1.5">
                    <select
                      value={r.tipo}
                      onChange={(e) => setRow(i, { tipo: e.target.value as TipoAlojamiento })}
                      className={inputCls}
                    >
                      <option value="pension">Pensión</option>
                      <option value="hotel">Hotel</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={r.hab}
                      onChange={(e) => setRow(i, { hab: e.target.value as RoomKind })}
                      className={inputCls}
                    >
                      {ROOM_KINDS.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.label} ({k.cap} {k.cap === 1 ? "persona" : "personas"})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={r.habitaciones}
                      onChange={(e) => setRow(i, { habitaciones: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
                      className={`${inputCls} text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted tabular-nums">{personas}</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.precio_cs || ""}
                      onChange={(e) => setRow(i, { precio_cs: Number(e.target.value) || 0 })}
                      placeholder="—"
                      className={`${inputCls} text-right font-medium text-bosque border-bosque/50`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.precio_pilgrim || ""}
                      onChange={(e) => setRow(i, { precio_pilgrim: Number(e.target.value) || 0 })}
                      placeholder="—"
                      className={`${inputCls} text-right`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-xs">
                    <div className="text-bosque font-medium">{eur(personas * (Number(r.precio_cs) || 0))}</div>
                    <div className="text-muted">{eur(personas * (Number(r.precio_pilgrim) || 0))}</div>
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onChange(rows.filter((_, k) => k !== i))}
                      title={`Quitar ${roomRowLabel(r)}`}
                      className="text-muted hover:text-red-600 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-xs text-muted">
                  Sin habitaciones. Agregá la primera fila.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={rows.length >= MAX_ROOM_ROWS}
          onClick={() => onChange([...rows, filaVacia(rows[rows.length - 1]?.tipo ?? "pension")])}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={13} /> Añadir habitación
        </button>
        <div className="text-xs text-right space-y-0.5">
          <div className={cuadra ? "text-bosque" : "text-amber-700 font-medium"}>
            {totales.habitaciones} hab. · {totales.personas} personas
            {cuadra ? " ✓ coincide con el grupo" : ` ⚠ el grupo son ${people}`}
          </div>
          <div className="text-muted">
            Base grupo <span className="font-medium text-bosque">{eur(totales.baseEur)}</span>
            {"  ·  "}
            Costo Pilgrim <span className="font-medium text-fg">{eur(totales.costBaseEur)}</span>
            {"  ·  "}
            Utilidad <span className="font-medium text-bosque">{eur(totales.baseEur - totales.costBaseEur)}</span>
          </div>
        </div>
      </div>

      {faltanPrecios && (
        <p className="text-xs text-amber-700">
          ⚠ Hay habitaciones sin tu precio: esas no salen como tarjeta en el PDF y no suman a la base.
        </p>
      )}
      {!cuadra && rows.length > 0 && (
        <p className="text-xs text-amber-700">
          ⚠ El reparto suma {totales.personas} {totales.personas === 1 ? "persona" : "personas"} y el grupo son {people}.
          Ajustá las habitaciones o el número de personas: el total se calcula con el reparto, no con el
          número del grupo.
        </p>
      )}
    </div>
  );
}
