"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { PLANTILLAS, type MensajesGuardados } from "@/lib/mensajes/plantillas";
import { saveMensajes } from "./actions";

/**
 * Los textos de los mensajes que salen de la plataforma, editables sin desplegar.
 *
 * Cada mensaje viene plegado y se abre uno a uno: son tres mensajes con diez piezas cada
 * uno y abiertos todos a la vez la pantalla es ilegible. Dentro, una pieza por campo, con
 * sus variables a la vista y un botón para devolverla a como venía.
 *
 * Solo se guarda lo que se haya cambiado: un campo devuelto a su texto de fábrica sale de
 * `settings.mensajes` en vez de quedar congelado ahí. Así, si algún día se mejora un
 * texto en el código, ese cambio llega a quien no lo había tocado.
 */
export default function MensajesForm({ guardados }: { guardados: MensajesGuardados }) {
  const [valores, setValores] = useState<MensajesGuardados>(guardados);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function textoDe(plantillaId: string, piezaId: string, porDefecto: string): string {
    const propio = valores[plantillaId]?.[piezaId];
    return propio === undefined ? porDefecto : propio;
  }

  function editar(plantillaId: string, piezaId: string, texto: string) {
    setMsg(null);
    setValores((prev) => ({ ...prev, [plantillaId]: { ...(prev[plantillaId] ?? {}), [piezaId]: texto } }));
  }

  function restablecer(plantillaId: string, piezaId: string) {
    setMsg(null);
    setValores((prev) => {
      const resto = { ...(prev[plantillaId] ?? {}) };
      delete resto[piezaId];
      return { ...prev, [plantillaId]: resto };
    });
  }

  function guardar() {
    setMsg(null);
    // Se manda solo lo que difiere del texto de fábrica: lo demás no tiene por qué
    // quedar guardado, y guardado dejaría de actualizarse nunca más.
    const limpio: MensajesGuardados = {};
    for (const p of PLANTILLAS) {
      for (const pieza of p.piezas) {
        const propio = valores[p.id]?.[pieza.id];
        if (propio === undefined) continue;
        if (propio.trim() === pieza.valor.trim() || !propio.trim()) continue;
        limpio[p.id] = { ...(limpio[p.id] ?? {}), [pieza.id]: propio };
      }
    }
    startTransition(async () => {
      const r = await saveMensajes(limpio);
      if (r.ok) {
        setValores(limpio);
        setMsg({ ok: true, texto: "✓ Guardado. Los próximos mensajes salen con estos textos." });
      } else {
        setMsg({ ok: false, texto: r.error ?? "No se pudo guardar." });
      }
    });
  }

  const cambiados = PLANTILLAS.reduce((n, p) => {
    const propios = valores[p.id] ?? {};
    return n + p.piezas.filter((pz) => {
      const v = propios[pz.id];
      return v !== undefined && v.trim() && v.trim() !== pz.valor.trim();
    }).length;
  }, 0);

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">Mensajes</h2>
          <p className="text-xs text-muted mt-0.5">
            Lo que dicen el WhatsApp al peregrino y los correos a Pilgrim. Los datos —el
            viaje, los viajeros, las tarifas— los arma la plataforma y no se tocan acá.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {cambiados > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-dorado-oscuro/15 text-dorado-oscuro font-semibold">
              {cambiados} {cambiados === 1 ? "texto cambiado" : "textos cambiados"}
            </span>
          )}
          <button
            onClick={guardar}
            disabled={pending}
            className="px-4 py-2 rounded-md bg-bosque text-white text-sm font-medium hover:bg-bosque-medio disabled:opacity-50 transition"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {msg && (
        <p
          aria-live="polite"
          className={`px-5 pt-3 text-sm ${msg.ok ? "text-bosque" : "text-red-800"}`}
        >
          {msg.texto}
        </p>
      )}

      <div className="divide-y divide-border">
        {PLANTILLAS.map((p) => {
          const open = abierto === p.id;
          return (
            <div key={p.id}>
              <button
                type="button"
                onClick={() => setAbierto(open ? null : p.id)}
                aria-expanded={open}
                className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-taupe/20 transition"
              >
                {open ? <ChevronDown size={16} className="text-muted shrink-0" /> : <ChevronRight size={16} className="text-muted shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fg">{p.nombre}</div>
                  <div className="text-xs text-muted mt-0.5">{p.donde}</div>
                </div>
              </button>

              {open && (
                <div className="px-5 pb-5 space-y-4">
                  <p className="text-xs text-muted">{p.descripcion}</p>
                  {p.piezas.map((pieza) => {
                    const valor = textoDe(p.id, pieza.id, pieza.valor);
                    const tocado = valor.trim() !== pieza.valor.trim();
                    return (
                      <div key={pieza.id}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <label className="text-xs font-medium text-fg" htmlFor={`${p.id}-${pieza.id}`}>
                            {pieza.etiqueta}
                          </label>
                          {tocado && (
                            <button
                              type="button"
                              onClick={() => restablecer(p.id, pieza.id)}
                              className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-bosque transition"
                            >
                              <RotateCcw size={11} /> Volver al original
                            </button>
                          )}
                        </div>
                        {pieza.filas === 1 ? (
                          <input
                            id={`${p.id}-${pieza.id}`}
                            value={valor}
                            onChange={(e) => editar(p.id, pieza.id, e.target.value)}
                            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-crema text-sm focus:outline-none focus:border-bosque"
                          />
                        ) : (
                          <textarea
                            id={`${p.id}-${pieza.id}`}
                            value={valor}
                            onChange={(e) => editar(p.id, pieza.id, e.target.value)}
                            rows={pieza.filas ?? 3}
                            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-crema text-sm leading-relaxed focus:outline-none focus:border-bosque resize-y"
                          />
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          {pieza.ayuda && <span className="text-[11px] text-muted">{pieza.ayuda}</span>}
                          {(pieza.variables ?? []).length > 0 && (
                            <span className="text-[11px] text-muted">
                              Variables:{" "}
                              {(pieza.variables ?? []).map((v) => (
                                <code key={v} className="font-mono text-[10px] bg-taupe/40 rounded px-1 py-0.5 mr-1">
                                  {`{{${v}}}`}
                                </code>
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
