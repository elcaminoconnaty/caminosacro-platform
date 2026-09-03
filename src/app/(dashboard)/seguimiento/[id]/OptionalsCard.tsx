"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  addCustomOptional,
  deleteCustomOptional,
  toggleQuoteOptional,
  updateCustomOptional,
  updateQuoteLineQuantity,
} from "./actions";
import { MAX_DESC_OPCIONAL } from "@/lib/quotes/opcionalLibre";

export type OptionalCatalog = {
  id: string;
  category: string;
  name: string;
  unit: string;
  price_cs: number;
  price_pilgrim: number;
  /** Año del que salió este precio (puede no ser el de la salida — ver isFallback). */
  priceYear: number;
  /** true = el año de salida no tiene precios cargados y se está usando uno anterior. */
  isFallback: boolean;
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
  equipo_bici: "Equipamiento de bicicleta",
  noche_extra: "Alojamiento extra en Santiago",
  meal: "Comidas",
  transfer: "Traslados privados desde Santiago",
  tour: "Tours y experiencias",
  gift: "Recuerdos y experiencias gastronómicas",
};
// `equipo_bici` va pegado a los seguros: en el Camino en bici el casco y el seguro de la
// bicicleta se ofrecen en la misma conversación. Sin la categoría acá, los opcionales que
// sembró la migración 0021 quedan invisibles (el render recorre CAT_ORDER, no el catálogo).
const CAT_ORDER = ["seguro", "equipo_bici", "noche_extra", "meal", "transfer", "tour", "gift"];

export default function OptionalsCard({
  quoteId,
  catalog,
  selected,
  baseEur,
  totalEur,
  seasonSupplementEur,
  people,
  quoteYear,
}: {
  quoteId: string;
  catalog: OptionalCatalog[];
  selected: OptionalLine[];
  baseEur: number;
  totalEur: number;
  seasonSupplementEur: number;
  people: number | null;
  /** Año de salida de la cotización: es el que manda para elegir el precio del opcional. */
  quoteYear: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedByRef = new Map(selected.filter((l) => l.reference_id).map((l) => [l.reference_id!, l]));
  // Sin `reference_id` = servicio a la medida de esta cotización, tecleado acá abajo.
  const libres = selected.filter((l) => !l.reference_id);
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

  // Años distintos al de salida de los que se está tomando precio (aviso en ámbar).
  const aniosDeReferencia = [...new Set(catalog.filter((o) => o.isFallback).map((o) => o.priceYear))].sort();

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
          {aniosDeReferencia.length > 0 && (
            <p className="text-xs text-amber-700 font-medium mt-1">
              ⚠ No hay precios {quoteYear} cargados para estos opcionales: se muestran los de{" "}
              {aniosDeReferencia.join(" / ")}. Cargalos en{" "}
              <a href={`/catalogo?year=${quoteYear}`} className="underline">el catálogo {quoteYear}</a>.
            </p>
          )}
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
                        {it.isFallback && !checked && (
                          <span className="text-[10px] text-amber-700 ml-2">precio {it.priceYear}</span>
                        )}
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

        <CustomOptionals quoteId={quoteId} lines={libres} />
      </div>
    </section>
  );
}

/**
 * Servicios que solo existen en esta cotización: un traslado desde un pueblo que nadie más
 * pide, una cena de despedida, una noche suelta en otro hotel. No entran al catálogo.
 *
 * Se piden los DOS precios aunque el cliente solo vea el mío: sin el de Pilgrim, la
 * utilidad del expediente sale inflada, que es exactamente el problema que arregló la
 * migración 0013 para el resto de las líneas.
 */
function CustomOptionals({ quoteId, lines }: { quoteId: string; lines: OptionalLine[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // null = formulario cerrado; "nuevo" = alta; una línea = edición.
  const [form, setForm] = useState<OptionalLine | "nuevo" | null>(null);

  function onDelete(line: OptionalLine) {
    if (!confirm(`¿Quitar «${line.description}» de esta cotización?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteCustomOptional(quoteId, line.id);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-muted">A la medida de esta cotización</h3>
        {form === null && (
          <button
            type="button"
            onClick={() => setForm("nuevo")}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition"
          >
            <Plus size={13} /> Agregar servicio
          </button>
        )}
      </div>

      {lines.length === 0 && form === null && (
        <p className="text-xs text-muted">
          Nada por ahora. Acá va lo que no está en el catálogo: un traslado especial, una cena,
          una noche suelta. Suma al total y al costo Pilgrim como cualquier opcional.
        </p>
      )}

      {lines.length > 0 && (
        <ul className="space-y-1">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 text-sm py-1">
              <span className="w-4 shrink-0 text-center text-muted text-xs">·</span>
              <div className="flex-1 min-w-0">
                <span className="font-medium">{l.description}</span>
                <span className="text-xs text-muted ml-2">a la medida</span>
              </div>
              <span className="text-xs text-muted w-14 text-right tabular-nums">×{l.quantity}</span>
              <span className="text-xs text-muted w-12 text-right tabular-nums">{eur(Number(l.unit_price) || 0)}</span>
              <span className="text-xs w-24 text-right tabular-nums text-muted" title="Lo que este servicio le cuesta a Pilgrim">
                Pilgrim {eur((Number(l.quantity) || 0) * (Number(l.cost_unit) || 0))}
              </span>
              <span className="text-sm w-20 text-right tabular-nums font-medium text-bosque">
                {eur(Number(l.total) || 0)}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setForm(l)}
                  title="Editar"
                  className="p-1 text-muted hover:text-bosque transition"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(l)}
                  disabled={pending}
                  title="Quitar"
                  className="p-1 text-muted hover:text-red-600 transition disabled:opacity-50"
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {form !== null && (
        <CustomOptionalForm
          quoteId={quoteId}
          line={form === "nuevo" ? null : form}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

function CustomOptionalForm({
  quoteId,
  line,
  onClose,
}: {
  quoteId: string;
  line: OptionalLine | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState(line?.description ?? "");
  const [cantidad, setCantidad] = useState(String(line?.quantity ?? 1));
  const [precioCs, setPrecioCs] = useState(line ? String(Number(line.unit_price) || "") : "");
  const [precioPilgrim, setPrecioPilgrim] = useState(line ? String(Number(line.cost_unit) || "") : "");

  const restantes = MAX_DESC_OPCIONAL - descripcion.length;
  const cant = Math.max(1, Math.round(Number(cantidad) || 1));
  const totalCs = cant * (Number(precioCs) || 0);
  const totalPilgrim = cant * (Number(precioPilgrim) || 0);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = {
      descripcion,
      cantidad: cant,
      precioCs: Number(precioCs) || 0,
      precioPilgrim: Number(precioPilgrim) || 0,
    };
    startTransition(async () => {
      const r = line
        ? await updateCustomOptional(quoteId, line.id, datos)
        : await addCustomOptional(quoteId, datos);
      if (r?.error) setError(r.error);
      else onClose();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 bg-taupe/25 border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-bosque">
          {line ? "Editar servicio" : "Nuevo servicio a la medida"}
        </span>
        <button type="button" onClick={onClose} className="text-muted hover:text-bosque transition">
          <X size={15} />
        </button>
      </div>

      <label className="block">
        <span className="text-xs text-muted">
          Descripción — sale tal cual en el PDF y en el contrato
          <span className={`ml-2 ${restantes < 0 ? "text-red-700 font-medium" : "text-muted"}`}>
            {restantes} caracteres
          </span>
        </span>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value.slice(0, MAX_DESC_OPCIONAL))}
          maxLength={MAX_DESC_OPCIONAL}
          required
          placeholder="Traslado privado Sarria → aeropuerto de Santiago"
          className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white text-sm"
        />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs text-muted">Cantidad</span>
          <input
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white text-sm text-right"
          />
        </label>
        <label className="block">
          <span className="text-xs text-bosque font-medium">Mi precio € (unidad)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={precioCs}
            onChange={(e) => setPrecioCs(e.target.value)}
            placeholder="0"
            className="mt-1 w-full px-3 py-2 rounded-md border border-bosque bg-white text-sm text-right font-medium text-bosque"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Precio Pilgrim € (unidad)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={precioPilgrim}
            onChange={(e) => setPrecioPilgrim(e.target.value)}
            placeholder="0"
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white text-sm text-right"
          />
        </label>
      </div>

      <p className="text-xs text-muted">
        Al cliente le suma <span className="font-medium text-bosque">{eur(totalCs)}</span>
        {"  ·  "}
        A Pilgrim le cuesta <span className="font-medium text-fg">{eur(totalPilgrim)}</span>
        {"  ·  "}
        Utilidad <span className="font-medium text-bosque">{eur(totalCs - totalPilgrim)}</span>.
        En el PDF del cliente solo sale tu precio.
      </p>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="text-xs px-4 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
        >
          {pending ? "Guardando…" : line ? "Guardar" : "Agregar"}
        </button>
      </div>
    </form>
  );
}
