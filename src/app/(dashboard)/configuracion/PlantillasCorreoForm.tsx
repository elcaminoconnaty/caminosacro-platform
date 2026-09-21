"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { savePlantillaCorreo } from "./actions";

/**
 * Las plantillas del correo al cliente (`comercial.email_templates`).
 *
 * Hasta ahora se cambiaban con un UPDATE a mano —así estaba escrito en la GUIA—, y eso
 * significaba que el texto que lee un cliente dependía de que alguien abriera el SQL
 * editor de Supabase sin equivocarse de fila.
 *
 * El interruptor "activa" importa más de lo que parece: `cotizacion_enviada` apagada hace
 * que la tarjeta del expediente caiga en un texto mínimo de respaldo, que no es el mensaje
 * de la agencia. Por eso se avisa en pantalla en vez de ser un booleano a secas.
 */

export type PlantillaCorreo = {
  slug: string;
  subject: string;
  body_md: string;
  active: boolean;
};

/** Qué es cada plantilla y qué variables acepta. El renderizador ignora las que no conoce. */
const FICHA: Record<string, { nombre: string; donde: string; variables: string[] }> = {
  cotizacion_enviada: {
    nombre: "Cotización al cliente",
    donde: "Expediente → tarjeta «Correo para el cliente»",
    variables: [
      "nombre", "nombre_completo", "code", "ruta", "ruta_descripcion", "duracion",
      "dias_camino", "fechas", "fechas_largas", "personas", "alojamiento_descripcion",
      "precio_total", "total_eur", "total_cop", "trm", "validez",
    ],
  },
  recordatorio_pago: {
    nombre: "Recordatorio de pago",
    donde: "Correo de saldo pendiente",
    variables: ["nombre", "code", "total_eur", "pagado_eur", "saldo_eur", "fechas", "validez"],
  },
};

export default function PlantillasCorreoForm({ plantillas }: { plantillas: PlantillaCorreo[] }) {
  const [filas, setFilas] = useState(plantillas);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<Record<string, { ok: boolean; texto: string }>>({});

  function editar(slug: string, campo: "subject" | "body_md" | "active", valor: string | boolean) {
    setFilas((prev) => prev.map((f) => (f.slug === slug ? { ...f, [campo]: valor } : f)));
    setMsg((prev) => ({ ...prev, [slug]: { ok: true, texto: "" } }));
  }

  function guardar(slug: string) {
    const fila = filas.find((f) => f.slug === slug);
    if (!fila) return;
    startTransition(async () => {
      const r = await savePlantillaCorreo(fila);
      setMsg((prev) => ({
        ...prev,
        [slug]: r.ok
          ? { ok: true, texto: "✓ Guardada" }
          : { ok: false, texto: r.error ?? "No se pudo guardar." },
      }));
    });
  }

  if (filas.length === 0) return null;

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="font-display text-lg text-bosque">Correos al cliente</h2>
        <p className="text-xs text-muted mt-0.5">
          El asunto y el cuerpo que se le proponen a quien escribe desde el expediente. Se
          pueden retocar antes de cada envío; esto es de lo que se parte.
        </p>
      </div>

      <div className="divide-y divide-border">
        {filas.map((f) => {
          const ficha = FICHA[f.slug];
          const open = abierto === f.slug;
          const estado = msg[f.slug];
          return (
            <div key={f.slug}>
              <button
                type="button"
                onClick={() => setAbierto(open ? null : f.slug)}
                aria-expanded={open}
                className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-taupe/20 transition"
              >
                {open ? <ChevronDown size={16} className="text-muted shrink-0" /> : <ChevronRight size={16} className="text-muted shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fg">{ficha?.nombre ?? f.slug}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {ficha?.donde ?? <span className="font-mono">{f.slug}</span>}
                  </div>
                </div>
                {!f.active && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold shrink-0">
                    apagada
                  </span>
                )}
              </button>

              {open && (
                <div className="px-5 pb-5 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-fg" htmlFor={`${f.slug}-subject`}>Asunto</label>
                    <input
                      id={`${f.slug}-subject`}
                      value={f.subject}
                      onChange={(e) => editar(f.slug, "subject", e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-crema text-sm focus:outline-none focus:border-bosque"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-fg" htmlFor={`${f.slug}-body`}>Cuerpo</label>
                    <textarea
                      id={`${f.slug}-body`}
                      value={f.body_md}
                      onChange={(e) => editar(f.slug, "body_md", e.target.value)}
                      rows={12}
                      className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-crema text-sm leading-relaxed focus:outline-none focus:border-bosque resize-y"
                    />
                  </div>
                  {ficha && (
                    <p className="text-[11px] text-muted">
                      Variables:{" "}
                      {ficha.variables.map((v) => (
                        <code key={v} className="font-mono text-[10px] bg-taupe/40 rounded px-1 py-0.5 mr-1">
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={f.active}
                        onChange={(e) => editar(f.slug, "active", e.target.checked)}
                        className="rounded border-border"
                      />
                      Activa
                      {!f.active && (
                        <span className="text-red-700">
                          — apagada, el expediente cae en un texto mínimo de respaldo.
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-3">
                      {estado?.texto && (
                        <span aria-live="polite" className={`text-sm ${estado.ok ? "text-bosque" : "text-red-800"}`}>
                          {estado.texto}
                        </span>
                      )}
                      <button
                        onClick={() => guardar(f.slug)}
                        disabled={pending}
                        className="px-4 py-2 rounded-md bg-bosque text-white text-sm font-medium hover:bg-bosque-medio disabled:opacity-50 transition"
                      >
                        {pending ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
