"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  addCustomOptional,
  deleteCustomOptional,
  guardarOpcionalesExtra,
  toggleQuoteOptional,
  updateCustomOptional,
  updateQuoteLineQuantity,
} from "./actions";
import { MAX_DESC_OPCIONAL } from "@/lib/quotes/opcionalLibre";
import type { OpcionalExtra } from "@/lib/quotes/opcionalesExtra";
import { cantidadPorDefecto, explicarCantidad } from "@/lib/quotes/cantidadOpcional";

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
  dias,
  quoteYear,
  extrasGrupo = [],
}: {
  quoteId: string;
  catalog: OptionalCatalog[];
  selected: OptionalLine[];
  baseEur: number;
  totalEur: number;
  seasonSupplementEur: number;
  people: number | null;
  /** Noches del viaje: los opcionales "por persona y día" se multiplican por esto. */
  dias?: number | null;
  /** Año de salida de la cotización: es el que manda para elegir el precio del opcional. */
  quoteYear: number;
  /** Ofrecidos en el PDF sin sumar al total (condiciones_json.opcionales_extra). */
  extrasGrupo?: OpcionalExtra[];
}) {
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Copia local de las líneas: el clic se ve AL INSTANTE y el servidor confirma detrás.
  // Antes cada casilla esperaba a que el servidor re-renderizara la página entera, y mientras
  // tanto TODA la tarjeta quedaba deshabilitada (un solo `pending` para todo): se sentía
  // bloqueada. Cuando llegan las líneas reales del servidor, reemplazan a la copia.
  const [lineas, setLineas] = useState<OptionalLine[]>(selected);
  const [lineasServidor, setLineasServidor] = useState(selected);
  if (selected !== lineasServidor) {
    setLineasServidor(selected);
    setLineas(selected);
  }
  // Opcionales con una operación en vuelo: solo ESA casilla se deshabilita.
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const marcar = (id: string, on: boolean) =>
    setOcupados((prev) => {
      const n = new Set(prev);
      if (on) n.add(id); else n.delete(id);
      return n;
    });

  const selectedByRef = new Map(lineas.filter((l) => l.reference_id).map((l) => [l.reference_id!, l]));
  // Sin `reference_id` = servicio a la medida de esta cotización, tecleado acá abajo.
  const libres = lineas.filter((l) => !l.reference_id);
  const sumOptionals = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0);
  // Lo que estos opcionales le cuestan a Pilgrim: es la parte que antes no entraba
  // al costo y por eso la utilidad salía inflada.
  const sumOptionalsCost = lineas.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost_unit) || 0), 0);
  // El total se recalcula acá con la copia local, para que cambie con el clic.
  const totalVivo = (Number(baseEur) || 0) + (Number(seasonSupplementEur) || 0) + sumOptionals;
  void totalEur;

  function onToggle(it: OptionalCatalog, on: boolean) {
    setError(null);
    const antes = lineas;
    if (on) {
      const qty = cantidadPorDefecto(it.unit, people, dias);
      setLineas((prev) => [
        ...prev,
        { id: `tmp-${it.id}`, reference_id: it.id, description: it.name, quantity: qty, unit_price: it.price_cs, total: qty * it.price_cs, cost_unit: it.price_pilgrim },
      ]);
    } else {
      setLineas((prev) => prev.filter((l) => l.reference_id !== it.id));
    }
    marcar(it.id, true);
    startTransition(async () => {
      try {
        const r = await toggleQuoteOptional(quoteId, it.id, on, people);
        if (r?.error) { setError(r.error); setLineas(antes); }
      } catch {
        setError("No se pudo guardar el opcional. Revisá la conexión e intentá de nuevo.");
        setLineas(antes);
      } finally {
        marcar(it.id, false);
      }
    });
  }

  // La cantidad se guarda medio segundo después de dejar de teclear: antes cada tecla
  // ("1", "12") disparaba un guardado y un re-render completo de la página.
  const relojes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  function onQty(line: OptionalLine, qty: number) {
    if (qty < 1) return;
    setLineas((prev) => prev.map((l) => (l.id === line.id ? { ...l, quantity: qty, total: qty * (Number(l.unit_price) || 0) } : l)));
    if (line.id.startsWith("tmp-")) return; // todavía no existe en la base; se guarda al confirmar
    const previo = relojes.current.get(line.id);
    if (previo) clearTimeout(previo);
    relojes.current.set(line.id, setTimeout(() => {
      relojes.current.delete(line.id);
      startTransition(async () => {
        try {
          const r = await updateQuoteLineQuantity(quoteId, line.id, qty);
          if (r?.error) setError(r.error);
        } catch {
          setError("No se pudo guardar la cantidad. Revisá la conexión e intentá de nuevo.");
        }
      });
    }, 500));
  }

  // Opcionales que no tienen precio del año de salida y usan uno anterior. Se nombran:
  // el aviso genérico se leía como "no hay NINGÚN precio de ese año", y casi todos sí lo tienen.
  const faltantes = catalog.filter((o) => o.isFallback);
  const aniosDeReferencia = [...new Set(faltantes.map((o) => o.priceYear))].sort();

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
          {faltantes.length > 0 && (
            <p className="text-xs text-amber-700 mt-1">
              {faltantes.length} de {catalog.length} opcionales todavía no tienen precio {quoteYear} y usan el de{" "}
              {aniosDeReferencia.join(" / ")}: {faltantes.map((o) => o.name).join(", ")}.{" "}
              <a href={`/catalogo?year=${quoteYear}`} className="underline">Cargarlos en el catálogo {quoteYear}</a>.
            </p>
          )}
        </div>
        <div className="text-right text-xs">
          <div className="text-muted">Base ruta: <span className="font-medium text-fg">{eur(Number(baseEur) || 0)}</span></div>
          {Number(seasonSupplementEur) > 0 && (
            <div className="text-muted">+ Suplemento temporada: <span className="font-medium text-fg">{eur(Number(seasonSupplementEur))}</span></div>
          )}
          <div className="text-muted">+ Opcionales: <span className="font-medium text-fg">{eur(sumOptionals)}</span></div>
          <div className="font-display text-lg text-bosque mt-0.5">Total: {eur(totalVivo)}</div>
          {sumOptionalsCost > 0 && (
            <div className="text-muted mt-1">
              Opcionales le cuestan a Pilgrim: <span className="font-medium text-fg">{eur(sumOptionalsCost)}</span>
            </div>
          )}
        </div>
      </div>

      {error && <div role="alert" className="px-5 py-2 text-sm text-red-800 bg-red-50 border-b border-red-200">{error}</div>}

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
                        onChange={(e) => onToggle(it, e.target.checked)}
                        disabled={ocupados.has(it.id)}
                        className="rounded border-border w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{it.name}</span>
                        <span className="text-xs text-muted ml-2">{it.unit}</span>
                        {(() => {
                          // La cuenta con la que se marca (y con la que se sugiere cambiarla).
                          const cuenta = explicarCantidad(it.unit, people, dias);
                          if (!cuenta) return null;
                          const sugerida = cantidadPorDefecto(it.unit, people, dias);
                          const distinta = checked && line && Number(line.quantity) !== sugerida;
                          return (
                            <span className={`text-[10px] ml-2 ${distinta ? "text-amber-700" : "text-muted"}`}>
                              {distinta ? `sugerido ${sugerida}: ${cuenta}` : `= ${cuenta}`}
                            </span>
                          );
                        })()}
                        {it.isFallback && (
                          <span className="text-[10px] text-amber-700 ml-2">precio {it.priceYear}</span>
                        )}
                      </div>
                      {checked && line && (
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => onQty(line, Number(e.target.value) || 1)}
                          disabled={line.id.startsWith("tmp-")}
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
        <ExtrasGrupo quoteId={quoteId} inicial={extrasGrupo} />
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

      {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}

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

      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}

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

/**
 * Servicios que el PDF ofrece en "Servicios opcionales" pero que NO suman al total: por
 * ejemplo el vehículo de apoyo de un grupo cuando la inversión se presenta sin él. Se edita
 * la lista completa y se guarda de una vez.
 */
function ExtrasGrupo({ quoteId, inicial }: { quoteId: string; inicial: OpcionalExtra[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [items, setItems] = useState(() => inicial.map((o) => ({ ...o, precio: String(o.precio) })));
  const [base, setBase] = useState(inicial);
  if (inicial !== base) {
    setBase(inicial);
    setItems(inicial.map((o) => ({ ...o, precio: String(o.precio) })));
  }
  const cambia = JSON.stringify(items.map((o) => ({ ...o, precio: Number(o.precio) || 0 }))) !== JSON.stringify(inicial);

  function cambiar(i: number, campo: "nombre" | "unidad" | "precio", v: string) {
    setOk(false);
    setItems((prev) => prev.map((o, j) => (j === i ? { ...o, [campo]: v } : o)));
  }
  function guardar() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await guardarOpcionalesExtra(quoteId, items.map((o) => ({ nombre: o.nombre, unidad: o.unidad, precio: Number(o.precio) || 0 })));
        if (r?.error) setError(r.error);
        else setOk(true);
      } catch {
        setError("No se pudo guardar. Revisá la conexión e intentá de nuevo.");
      }
    });
  }

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[11px] uppercase tracking-wider text-muted">Ofrecidos sin sumar al total</h3>
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, { nombre: "", unidad: "por grupo", precio: "" }])}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition"
        >
          <Plus size={13} /> Agregar
        </button>
      </div>
      <p className="text-xs text-muted mb-2">
        Salen en el PDF en «Servicios opcionales · Servicios para este grupo» con su precio, pero no entran a la inversión.
      </p>
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((o, i) => (
            <li key={i} className="grid grid-cols-[1fr_7rem_6rem_auto] gap-2 items-center">
              <input
                value={o.nombre}
                onChange={(e) => cambiar(i, "nombre", e.target.value)}
                placeholder="Vehículo de apoyo con conductor…"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-sm"
              />
              <input
                value={o.unidad}
                onChange={(e) => cambiar(i, "unidad", e.target.value)}
                placeholder="por grupo"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-sm"
              />
              <input
                type="number"
                min={0}
                step="1"
                value={o.precio}
                onChange={(e) => cambiar(i, "precio", e.target.value)}
                placeholder="€"
                className="px-2 py-1.5 rounded-md border border-bosque bg-white text-sm text-right font-medium text-bosque"
              />
              <button
                type="button"
                onClick={() => { setOk(false); setItems((prev) => prev.filter((_, j) => j !== i)); }}
                title="Quitar"
                className="p-1 text-muted hover:text-red-600 transition"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
      <div className="mt-2 flex items-center justify-end gap-3">
        {ok && !cambia && <span className="text-xs text-bosque">Guardado. El PDF se actualiza en unos segundos.</span>}
        {cambia && (
          <button
            type="button"
            onClick={guardar}
            disabled={pending}
            className="text-xs px-4 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        )}
      </div>
    </div>
  );
}
