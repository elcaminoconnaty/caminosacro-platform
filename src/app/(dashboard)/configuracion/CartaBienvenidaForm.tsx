"use client";

// Textos de la carta de bienvenida: la portada, el párrafo de "Tu ruta" de cada familia de
// camino, los próximos pasos, los tips y el contacto. Es lo que lee
// src/lib/bienvenida/cartaPdf.tsx. Lo que cambia de un cliente a otro (título, cifras,
// itinerario) no está aquí: sale de cada cotización.
//
// Los tips se editan con UN ELEMENTO POR LÍNEA, como en el Documento de Viaje.

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { saveTextosCarta } from "./actions";
import { Area, Campo } from "./TravelDocTextsForm";
import { INTROS, TEXTOS_CARTA_DEFAULT, type IntroId, type TextosCarta } from "@/lib/bienvenida/textos";

const lineas = (xs: string[]) => xs.join("\n");
const partir = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);

export default function CartaBienvenidaForm({ current }: { current: TextosCarta }) {
  const [v, setV] = useState<TextosCarta>(current);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  // Los tips guardan su texto crudo por dentro (ver TipsArea): cuando la lista cambia desde
  // afuera —textos de fábrica, quitar un grupo— se remontan con esto.
  const [version, setVersion] = useState(0);

  function cambiar(f: (p: TextosCarta) => TextosCarta) {
    setV(f);
    setMsg(null);
  }

  function guardar() {
    setMsg(null);
    startTransition(async () => {
      const r = await saveTextosCarta(v);
      setMsg(r.ok ? { ok: true, texto: "✓ Guardado. Las próximas cartas ya salen con estos textos." } : { ok: false, texto: r.error ?? "No se pudo guardar." });
    });
  }

  function fabrica() {
    cambiar(() => TEXTOS_CARTA_DEFAULT);
    setVersion((n) => n + 1);
    setMsg({ ok: true, texto: "Textos de fábrica cargados. Dale a Guardar para quedarte con ellos." });
  }

  const grupo = ({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) => (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto(abierto === id ? null : id)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-taupe/20 text-left text-sm font-medium text-bosque"
      >
        {abierto === id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        {titulo}
      </button>
      {abierto === id && <div className="px-3 py-3 space-y-3 text-sm">{children}</div>}
    </div>
  );

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">Carta de bienvenida — textos</h2>
          <p className="text-xs text-muted mt-0.5">
            Lo fijo de la carta que se genera en cada seguimiento. La ruta, las cifras y el
            itinerario salen de cada cotización.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fabrica}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
          >
            Textos de fábrica
          </button>
          <button
            onClick={guardar}
            disabled={pending}
            className="text-xs px-4 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-2">
        {grupo({
          id: "portada",
          titulo: "Portada",
          children: (
            <Area
              label="Párrafo bajo «¡Bienvenido/a al Camino!»"
              value={v.portada}
              onChange={(x) => cambiar((p) => ({ ...p, portada: x }))}
              rows={3}
            />
          ),
        })}

        {grupo({
          id: "rutas",
          titulo: "Tu ruta — párrafo por camino",
          children: (
            <>
              <p className="text-xs text-muted">
                Usa <code className="font-mono">{"{km}"}</code> y <code className="font-mono">{"{etapas}"}</code>: se
                cambian por los de cada cotización («112 km», «6 etapas»). En cada seguimiento se puede retocar antes
                de abrir la carta.
              </p>
              {INTROS.map(({ id, etiqueta }) => (
                <Area
                  key={id}
                  label={etiqueta}
                  value={v.intros[id]}
                  onChange={(x) => cambiar((p) => ({ ...p, intros: { ...p.intros, [id as IntroId]: x } }))}
                  rows={4}
                />
              ))}
            </>
          ),
        })}

        {grupo({
          id: "pasos",
          titulo: "Próximos pasos",
          children: (
            <>
              {v.pasos.map((paso, i) => (
                <div key={i} className="border border-border rounded-md p-3 space-y-2">
                  <div className="flex items-end gap-2">
                    <Campo
                      label="Título"
                      value={paso.titulo}
                      onChange={(x) => cambiar((p) => ({ ...p, pasos: p.pasos.map((q, k) => (k === i ? { ...q, titulo: x } : q)) }))}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => cambiar((p) => ({ ...p, pasos: p.pasos.filter((_, k) => k !== i) }))}
                      title="Quitar paso"
                      className="mb-2 text-muted hover:text-red-600 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <Area
                    label="Texto"
                    value={paso.texto}
                    onChange={(x) => cambiar((p) => ({ ...p, pasos: p.pasos.map((q, k) => (k === i ? { ...q, texto: x } : q)) }))}
                    rows={3}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => cambiar((p) => ({ ...p, pasos: [...p.pasos, { titulo: `${p.pasos.length + 1}. `, texto: "" }] }))}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
              >
                <Plus size={13} /> Agregar paso
              </button>
            </>
          ),
        })}

        {grupo({
          id: "tips",
          titulo: "Tips para preparar tu Camino",
          children: (
            <>
              {v.tips.map((g, i) => (
                <div key={i} className="border border-border rounded-md p-3 space-y-2">
                  <div className="flex items-end gap-2">
                    <Campo
                      label="Grupo"
                      value={g.titulo}
                      onChange={(x) => cambiar((p) => ({ ...p, tips: p.tips.map((t, k) => (k === i ? { ...t, titulo: x } : t)) }))}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        cambiar((p) => ({ ...p, tips: p.tips.filter((_, k) => k !== i) }));
                        setVersion((n) => n + 1);
                      }}
                      title="Quitar grupo"
                      className="mb-2 text-muted hover:text-red-600 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <TipsArea
                    key={`${version}-${i}`}
                    value={g.items}
                    onChange={(items) => cambiar((p) => ({ ...p, tips: p.tips.map((t, k) => (k === i ? { ...t, items } : t)) }))}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => cambiar((p) => ({ ...p, tips: [...p.tips, { titulo: "Nuevo grupo", items: [] }] }))}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
              >
                <Plus size={13} /> Agregar grupo
              </button>
            </>
          ),
        })}

        {grupo({
          id: "contacto",
          titulo: "¿Dudas? y firma",
          children: (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Campo label="Texto" value={v.contacto.texto} onChange={(x) => cambiar((p) => ({ ...p, contacto: { ...p.contacto, texto: x } }))} className="md:col-span-2" />
              <Campo label="WhatsApp" value={v.contacto.whatsapp} onChange={(x) => cambiar((p) => ({ ...p, contacto: { ...p.contacto, whatsapp: x } }))} />
              <Campo label="Web" value={v.contacto.web} onChange={(x) => cambiar((p) => ({ ...p, contacto: { ...p.contacto, web: x } }))} />
              <Campo label="Firma" value={v.firma.nombres} onChange={(x) => cambiar((p) => ({ ...p, firma: { ...p.firma, nombres: x } }))} />
              <Campo label="Debajo de la firma" value={v.firma.sub} onChange={(x) => cambiar((p) => ({ ...p, firma: { ...p.firma, sub: x } }))} />
            </div>
          ),
        })}
      </div>

      {msg && (
        <div aria-live="polite" className={`px-5 py-2 text-sm border-t ${msg.ok ? "text-bosque bg-crema border-border" : "text-red-800 bg-red-50 border-red-200"}`}>
          {msg.texto}
        </div>
      )}
    </section>
  );
}

/**
 * Los tips de un grupo, uno por línea. Guarda el texto crudo mientras se escribe: si se
 * partiera en cada tecla, un Enter al final se perdería antes de escribir la línea nueva.
 */
function TipsArea({ value, onChange }: { value: string[]; onChange: (items: string[]) => void }) {
  const [texto, setTexto] = useState(lineas(value));
  return (
    <Area
      label="Tips — uno por línea"
      value={texto}
      onChange={(x) => {
        setTexto(x);
        onChange(partir(x));
      }}
      rows={5}
    />
  );
}
