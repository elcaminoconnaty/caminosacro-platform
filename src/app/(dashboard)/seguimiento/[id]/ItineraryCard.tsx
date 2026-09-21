"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { guardarItinerarioCotizacion, usarItinerarioDelCatalogo } from "./actions";
import {
  etapasDeFilas,
  fechaFinDeItinerario,
  filaEtapaVacia,
  filasDeEtapas,
  mismoItinerario,
  resumenItinerario,
  type EtapaItinerario,
  type FilaEtapa,
} from "@/lib/quotes/itinerario";

/**
 * El itinerario de esta cotización, editable sin tocar el catálogo.
 *
 * Solo se editan las etapas que se CAMINAN: la llegada del día 1 y el "Fin de servicios" los
 * pinta el PDF solo a partir de estas (ver @/lib/quotes/itinerario).
 */
export default function ItineraryCard({
  quoteId,
  routeName,
  startDate,
  endDate,
  etapasCatalogo,
  etapasPropias,
}: {
  quoteId: string;
  routeName: string | null;
  startDate: string | null;
  endDate: string | null;
  /** El itinerario de la ruta en el catálogo. Vacío = la ruta no tiene etapas cargadas. */
  etapasCatalogo: EtapaItinerario[];
  /** El pactado con este cliente. Vacío = esta cotización usa el del catálogo. */
  etapasPropias: EtapaItinerario[];
}) {
  const propio = etapasPropias.length > 0;
  const base = propio ? etapasPropias : etapasCatalogo;

  const [editing, setEditing] = useState(false);
  const [filas, setFilas] = useState<FilaEtapa[]>(() => filasDeEtapas(base));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const etapas = useMemo(() => etapasDeFilas(filas), [filas]);
  const resumen = useMemo(() => resumenItinerario(etapas), [etapas]);
  const resumenGuardado = useMemo(() => resumenItinerario(base), [base]);
  const nuevoFin = useMemo(() => fechaFinDeItinerario(startDate, etapas), [startDate, etapas]);
  const cambia = !mismoItinerario(etapas, base);

  function abrir() {
    setFilas(filasDeEtapas(base));
    setError(null);
    setAviso(null);
    setEditing(true);
  }

  // Una etapa nueva arranca donde terminó la anterior: es como se encadena un Camino, y
  // ahorra volver a teclear el pueblo en cada fila.
  function insertarDebajo(i: number) {
    setFilas((prev) => {
      const copia = [...prev];
      copia.splice(i + 1, 0, filaEtapaVacia(prev[i]?.to_place ?? ""));
      return copia;
    });
  }
  function borrar(i: number) {
    setFilas((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)));
  }
  function mover(i: number, delta: number) {
    setFilas((prev) => {
      const j = i + delta;
      if (j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }
  function cambiar(i: number, campo: keyof FilaEtapa, valor: string) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  }

  function guardar() {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await guardarItinerarioCotizacion(quoteId, etapas);
      if (r?.error) setError(r.error);
      else {
        setAviso(r.aviso ?? null);
        setEditing(false);
      }
    });
  }

  function volverAlCatalogo() {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await usarItinerarioDelCatalogo(quoteId);
      if (r?.error) setError(r.error);
      else {
        setAviso(r.aviso ?? null);
        setEditing(false);
      }
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-1 gap-3">
        <div>
          <h2 className="font-display text-lg text-bosque">Itinerario de esta cotización</h2>
          <p className="text-xs text-muted mt-0.5">
            {propio ? (
              <>
                Pactado con este cliente · la ruta <span className="text-fg">{routeName ?? "—"}</span> del catálogo
                queda intacta
              </>
            ) : (
              <>Del catálogo · ruta <span className="text-fg">{routeName ?? "—"}</span></>
            )}
          </p>
        </div>
        {!editing && (
          <div className="flex gap-2 shrink-0">
            {propio && (
              <button
                onClick={volverAlCatalogo}
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 disabled:opacity-50 transition inline-flex items-center gap-1.5"
              >
                <RotateCcw size={13} /> Volver al del catálogo
              </button>
            )}
            <button
              onClick={abrir}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
            >
              {propio ? "Editar" : "Personalizar"}
            </button>
          </div>
        )}
      </div>

      {aviso && !editing && (
        <div className="mt-3 rounded-md border border-bosque/30 bg-bosque/5 px-3 py-2 text-xs text-bosque">{aviso}</div>
      )}
      {error && (
        <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      )}

      {!editing ? (
        base.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Esta ruta no tiene etapas cargadas en el catálogo. Podés escribirle el itinerario a esta cotización con
            «Personalizar».
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted text-left">
                    <th className="pb-2 pr-3 font-normal w-12">Día</th>
                    <th className="pb-2 pr-3 font-normal">Etapa</th>
                    <th className="pb-2 pr-3 font-normal w-20 text-right">Km</th>
                    <th className="pb-2 font-normal">Se duerme en</th>
                  </tr>
                </thead>
                <tbody>
                  {filasDeEtapas(base).map((f, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="py-1.5 pr-3 text-muted tabular-nums">{i + 2}</td>
                      <td className="py-1.5 pr-3">
                        {f.from_place && f.to_place ? `${f.from_place} → ${f.to_place}` : f.to_place || f.from_place || "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{f.km || "—"}</td>
                      <td className="py-1.5">{f.accommodation || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">
              {resumenGuardado.etapas} etapas caminadas · {resumenGuardado.dias} días · {resumenGuardado.noches} noches ·{" "}
              {resumenGuardado.km} km. La llegada del día 1 y el fin de servicios los agrega el PDF.
            </p>
          </>
        )
      ) : (
        <div className="mt-4 space-y-2">
          <div className="hidden md:grid grid-cols-[2.2rem_1fr_1fr_5rem_1fr_5.5rem] gap-2 text-xs text-muted px-1">
            <span>Día</span>
            <span>Desde</span>
            <span>Hasta</span>
            <span className="text-right">Km</span>
            <span>Se duerme en</span>
            <span />
          </div>
          {filas.map((f, i) => (
            <div key={i} className="grid grid-cols-2 md:grid-cols-[2.2rem_1fr_1fr_5rem_1fr_5.5rem] gap-2 items-center">
              <span className="text-xs text-muted tabular-nums md:text-center">{i + 2}</span>
              <input
                value={f.from_place}
                onChange={(e) => cambiar(i, "from_place", e.target.value)}
                placeholder="Desde"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-sm"
              />
              <input
                value={f.to_place}
                onChange={(e) => cambiar(i, "to_place", e.target.value)}
                placeholder="Hasta"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-sm"
              />
              <input
                value={f.km}
                onChange={(e) => cambiar(i, "km", e.target.value)}
                inputMode="decimal"
                placeholder="km"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-sm text-right tabular-nums"
              />
              <input
                value={f.accommodation}
                onChange={(e) => cambiar(i, "accommodation", e.target.value)}
                placeholder={f.to_place || "Se duerme en"}
                className="px-2 py-1.5 rounded-md border border-border bg-white text-sm"
              />
              <div className="flex items-center gap-0.5 justify-end">
                <IconBtn title="Subir" onClick={() => mover(i, -1)} disabled={i === 0}><ArrowUp size={13} /></IconBtn>
                <IconBtn title="Bajar" onClick={() => mover(i, 1)} disabled={i === filas.length - 1}><ArrowDown size={13} /></IconBtn>
                <IconBtn title="Agregar etapa debajo" onClick={() => insertarDebajo(i)}><Plus size={13} /></IconBtn>
                <IconBtn title="Borrar etapa" onClick={() => borrar(i)} disabled={filas.length === 1}><Trash2 size={13} /></IconBtn>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => insertarDebajo(filas.length - 1)}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition inline-flex items-center gap-1.5"
          >
            <Plus size={13} /> Agregar etapa al final
          </button>

          <div className="pt-3 border-t border-border text-xs space-y-1">
            <div className="text-fg">
              {resumen.etapas} etapas caminadas · <span className="tabular-nums">{resumen.dias}</span> días ·{" "}
              <span className="tabular-nums">{resumen.noches}</span> noches ·{" "}
              <span className="tabular-nums">{resumen.km}</span> km
            </div>
            {nuevoFin && nuevoFin !== endDate && (
              <div className="text-dorado-oscuro">
                Al guardar, la fecha de fin pasa de {endDate ?? "—"} a {nuevoFin}.
              </div>
            )}
            <div className="text-muted">
              El precio no se mueve solo: una etapa a medida no tiene tarifa en el catálogo, así que ajustalo a mano en
              «Datos de la cotización». Las noches del «Incluye» y los km del encabezado sí salen de acá.
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={guardar}
              disabled={pending || !cambia}
              className="px-4 py-2 rounded-md bg-bosque text-white text-sm font-medium hover:bg-bosque-medio disabled:opacity-50 transition"
            >
              {pending ? "Guardando…" : "Guardar itinerario"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-taupe/40 disabled:opacity-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-md text-muted hover:text-fg hover:bg-taupe/40 disabled:opacity-30 disabled:hover:bg-transparent transition"
    >
      {children}
    </button>
  );
}
