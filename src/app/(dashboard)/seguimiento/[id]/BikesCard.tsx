"use client";

import { useState, useTransition } from "react";
import { FIANZA_POR_BICI_EUR, type BikeWithPrice } from "@/lib/bikes/catalog";
import { crearCotizacionConBici, toggleQuoteBike, updateBikeQuantity } from "./bikeActions";

/** Una línea `type='bike'` ya guardada en la cotización. */
export type BikeLine = {
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

export default function BikesCard({
  quoteId,
  bikes,
  selected,
  totalEur,
  people,
  quoteYear,
}: {
  quoteId: string;
  /** Las 7 de la flota, ordenadas por `position`, con la tarifa del año de salida ya resuelta. */
  bikes: BikeWithPrice[];
  selected: BikeLine[];
  totalEur: number;
  people: number | null;
  /** Año de SALIDA. Acá la coincidencia es exacta: sin tarifa de ese año, la bici no se cotiza. */
  quoteYear: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // El paso 4 crea una cotización nueva y redirige: se confirma antes, con los números
  // a la vista, porque deshacerlo es borrar una cotización a mano.
  const [confirmando, setConfirmando] = useState(false);

  const selectedByRef = new Map(selected.filter((l) => l.reference_id).map((l) => [l.reference_id!, l]));
  const sumBikes = selected.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const sumBikesCost = selected.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost_unit) || 0), 0);
  // La fianza va por bicicleta física, no por modelo: 3 MTB son 3 fianzas.
  const unidades = selected.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const fianzaTotal = unidades * FIANZA_POR_BICI_EUR;

  // Cantidad por defecto al marcar: las personas de la cotización. Un grupo de 4 casi
  // siempre lleva 4 bicis, y bajarlo es un click.
  const qtyPorDefecto = Math.max(1, people ?? 1);

  function onToggle(bikeId: string, on: boolean) {
    setError(null);
    setConfirmando(false);
    startTransition(async () => {
      const r = await toggleQuoteBike(quoteId, bikeId, on, qtyPorDefecto);
      if (r?.error) setError(r.error);
    });
  }

  function onQty(line: BikeLine, qty: number) {
    if (qty < 1) return;
    setError(null);
    startTransition(async () => {
      const r = await updateBikeQuantity(quoteId, line.id, qty);
      if (r?.error) setError(r.error);
    });
  }

  function onCrear() {
    setError(null);
    const seleccion = selected
      .filter((l) => l.reference_id)
      .map((l) => ({ bikeId: l.reference_id!, qty: Number(l.quantity) || 1 }));
    startTransition(async () => {
      // Si todo sale bien esta acción redirige y nunca devuelve.
      const r = await crearCotizacionConBici(quoteId, seleccion);
      if (r?.error) {
        setError(r.error);
        setConfirmando(false);
      }
    });
  }

  const sinTarifa = bikes.filter((b) => !b.price_cs);

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg text-bosque">Alquiler de bicicleta</h2>
          <p className="text-xs text-muted mt-0.5">
            La primera cotización sale con la flota entera como opción para que el peregrino compare.
            Cuando elija, marcá acá su bici y creá la cotización nueva: ahí sí entra al total.
          </p>
          {sinTarifa.length > 0 && (
            <p className="text-xs text-amber-700 font-medium mt-1">
              ⚠ {sinTarifa.length} {sinTarifa.length === 1 ? "modelo no tiene" : "modelos no tienen"} tarifa {quoteYear} para
              esta ruta. Cargala en{" "}
              <a href={`/catalogo?year=${quoteYear}`} className="underline">el catálogo {quoteYear}</a>.
            </p>
          )}
        </div>
        <div className="text-right text-xs">
          <div className="text-muted">+ Bicicletas: <span className="font-medium text-fg">{eur(sumBikes)}</span></div>
          <div className="font-display text-lg text-bosque mt-0.5">Total: {eur(Number(totalEur) || 0)}</div>
          {sumBikesCost > 0 && (
            <div className="text-muted mt-1">
              Las bicis le cuestan a Pilgrim: <span className="font-medium text-fg">{eur(sumBikesCost)}</span>
            </div>
          )}
        </div>
      </div>

      {error && <div role="alert" className="px-5 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">{error}</div>}

      {/* La fianza es la sorpresa más cara del Camino en bici si nadie la nombró a tiempo:
          va siempre visible, esté marcada o no una bici. */}
      <div className="px-5 py-3 border-b border-border">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">
            Fianza obligatoria: {eur(FIANZA_POR_BICI_EUR)} por bicicleta
            {unidades > 0 && (
              <span className="font-normal">
                {" "}— {unidades} {unidades === 1 ? "bicicleta" : "bicicletas"} ={" "}
                <span className="font-semibold">{eur(fianzaTotal)}</span>
              </span>
            )}
          </p>
          <p className="text-xs mt-1">
            Se deja al recoger la bicicleta y se devuelve en <strong>máximo 20 días</strong> tras la entrega.
            <strong> No forma parte del total de la cotización</strong>: se cobra y se reembolsa aparte, y hay que
            decírselo al peregrino antes de que firme.
          </p>
        </div>
        <div className="mt-2 text-xs text-muted space-y-1">
          <p>
            · Pedile la <strong>estatura de cada viajero</strong>: es lo único con lo que el proveedor asigna la talla.
          </p>
          <p>
            · Lo que se garantiza es la <strong>gama</strong>. El modelo concreto queda sujeto a disponibilidad en la
            fecha y en la talla; puede entregarse otro equivalente.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {bikes.map((b) => {
          const line = selectedByRef.get(b.id);
          const checked = !!line;
          const disponible = !!b.price_cs;
          return (
            <li key={b.id} className={`px-5 py-3 ${disponible ? "" : "bg-amber-50/40"}`}>
              <div className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggle(b.id, e.target.checked)}
                  disabled={pending || !disponible}
                  className="rounded border-border w-4 h-4 mt-1 disabled:opacity-40"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[11px] uppercase tracking-wider text-muted">{b.category_label}</span>
                    {b.electric && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-dorado/30 text-dorado-oscuro uppercase tracking-wide">
                        Eléctrica
                      </span>
                    )}
                  </div>
                  <div className="font-medium">{b.name}</div>
                  {b.tagline && <div className="text-xs text-muted mt-0.5">{b.tagline}</div>}
                  <div className="text-xs text-muted mt-1">
                    Tallas: {b.sizes.length ? b.sizes.join(" · ") : "—"}
                    {b.sizes_note ? ` · ${b.sizes_note}` : ""}
                    {b.days ? ` · ${b.days} días de alquiler` : ""}
                  </div>
                  {!disponible && (
                    <div className="text-xs text-amber-700 font-medium mt-1">
                      Sin tarifa {quoteYear} para esta ruta —{" "}
                      <a href={`/catalogo?year=${quoteYear}`} className="underline">cargala en el catálogo</a>.
                    </div>
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
                    title="Cuántas bicicletas de este modelo"
                  />
                )}
                {checked && line && (
                  <span className="text-xs text-muted w-14 text-right tabular-nums">× {eur(Number(line.unit_price) || 0)}</span>
                )}
                <span
                  className="text-xs w-24 text-right tabular-nums text-muted"
                  title="Lo que esta bicicleta le cuesta a Pilgrim"
                >
                  {checked && line
                    ? `Pilgrim ${eur((Number(line.quantity) || 0) * (Number(line.cost_unit) || 0))}`
                    : disponible
                      ? `Pilgrim ${eur(b.price_pilgrim ?? 0)}`
                      : "Pilgrim —"}
                </span>
                <span className={`text-sm w-20 text-right tabular-nums ${checked ? "font-medium text-bosque" : "text-muted"}`}>
                  {checked && line ? eur(Number(line.total) || 0) : disponible ? eur(b.price_cs ?? 0) : "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="px-5 py-4 border-t border-border bg-crema/40">
        {confirmando ? (
          <div className="rounded-lg border border-border bg-bg-card px-4 py-3 text-sm">
            <p className="font-medium text-bosque">Se va a crear una cotización nueva con:</p>
            <ul className="mt-2 space-y-0.5 text-xs">
              {selected.map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    {l.quantity} × {l.description}
                  </span>
                  <span className="tabular-nums text-muted shrink-0">{eur(Number(l.total) || 0)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 pt-2 border-t border-border text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted">Suman las bicis</span>
                <span className="tabular-nums font-medium">{eur(sumBikes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Total de la cotización nueva</span>
                <span className="tabular-nums font-medium text-bosque">{eur(Number(totalEur) || 0)}</span>
              </div>
              <div className="flex justify-between text-amber-700">
                <span>Fianza aparte (no entra al total)</span>
                <span className="tabular-nums font-medium">{eur(fianzaTotal)}</span>
              </div>
            </div>
            <p className="text-xs text-muted mt-2">
              Se copian el cliente, la ruta, las fechas y los opcionales ya marcados. No se copian el PDF, los correos
              enviados, los contratos, los viajeros ni los pagos: esos son de la cotización de arriba.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={onCrear}
                disabled={pending}
                className="px-4 py-2 rounded-lg bg-bosque text-white text-sm font-medium hover:bg-bosque-medio disabled:opacity-50"
              >
                {pending ? "Creando…" : "Confirmar y crear"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={pending}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-crema disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted max-w-md">
              Ya eligió su bici? Creá la cotización nueva: nace enlazada a esta y con la bicicleta dentro del resumen
              de inversión.
            </p>
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={pending || selected.length === 0}
              className="px-4 py-2 rounded-lg bg-bosque text-white text-sm font-medium hover:bg-bosque-medio disabled:opacity-40 disabled:cursor-not-allowed"
              title={selected.length === 0 ? "Marcá primero la bicicleta que eligió el peregrino" : undefined}
            >
              Crear cotización con la bici elegida
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
