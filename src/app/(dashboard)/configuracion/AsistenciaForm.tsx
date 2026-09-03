"use client";

// Asistencia en Viaje: la guía genérica de "a quién llamo si pasa algo".
//
// Es UNA sola para todos los viajes (el PDF de Pilgrim tampoco lleva datos del viajero:
// lo verifiqué página por página). Se guarda en comercial-docs/generico y se sobrescribe,
// así que corregir un teléfono acá arregla también los viajes ya enviados: la página
// pública del cliente sirve siempre el archivo vigente.

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, FileText, Plus, Trash2 } from "lucide-react";
import { regenerarAsistencia, saveAsistenciaTexts } from "./actions";
import { Area, Campo } from "./TravelDocTextsForm";

type Telefono = { nombre: string; numero: string };

type Seccion = {
  clave?: string;
  titulo: string;
  entradilla?: string | null;
  pasos: string[];
  recuerda?: string | null;
  telefonos_titulo?: string | null;
  telefonos: Telefono[];
};

export type AsistenciaValue = { intro?: string[]; secciones: Seccion[] };

const lineas = (xs?: string[]) => (xs || []).join("\n");
const partir = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);

/** Los teléfonos se editan como "Nombre | +34 600 000 000", uno por línea. */
const telsATexto = (ts: Telefono[]) => (ts || []).map((t) => `${t.nombre} | ${t.numero}`).join("\n");
const textoATels = (t: string): Telefono[] =>
  partir(t).map((l) => {
    const [nombre, ...resto] = l.split("|");
    return { nombre: (nombre || "").trim(), numero: resto.join("|").trim() };
  }).filter((x) => x.numero);

export default function AsistenciaForm({ current, generado }: { current: AsistenciaValue; generado: boolean }) {
  const [v, setV] = useState<AsistenciaValue>(current);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function seccion(i: number, campo: keyof Seccion, valor: unknown) {
    setV((p) => ({ ...p, secciones: p.secciones.map((s, k) => (k === i ? { ...s, [campo]: valor } : s)) }));
    setMsg(null);
  }

  function guardarYGenerar() {
    setMsg(null);
    startTransition(async () => {
      const g = await saveAsistenciaTexts(v);
      if (g.error) { setMsg({ ok: false, texto: g.error }); return; }
      const r = await regenerarAsistencia();
      setMsg(
        r.ok
          ? { ok: true, texto: "✓ Guardado y PDF regenerado. Todos los viajes, también los ya enviados, sirven esta versión." }
          : { ok: false, texto: r.error ?? "Se guardó el texto pero no se pudo generar el PDF." },
      );
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">Asistencia en Viaje</h2>
          <p className="text-xs text-muted mt-0.5">
            Una sola guía para todos los viajes.{" "}
            {generado ? "Ya está generada." : "Todavía no se ha generado: sin ella, el correo del cliente lleva un botón muerto."}
          </p>
        </div>
        <button
          onClick={guardarYGenerar}
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
        >
          <FileText size={13} /> {pending ? "Procesando…" : generado ? "Guardar y regenerar PDF" : "Guardar y generar PDF"}
        </button>
      </div>

      <div className="px-5 py-4 border-b border-border">
        <Area
          label="Portada — un párrafo por línea"
          value={lineas(v.intro)}
          onChange={(x) => { setV((p) => ({ ...p, intro: partir(x) })); setMsg(null); }}
          rows={3}
        />
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-bosque">Apartados</h3>
          <button
            onClick={() =>
              setV((p) => ({
                ...p,
                secciones: [...p.secciones, { titulo: "Nuevo apartado", pasos: [], telefonos: [] }],
              }))
            }
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
          >
            <Plus size={13} /> Agregar apartado
          </button>
        </div>

        <div className="space-y-2">
          {v.secciones.map((s, i) => (
            <div key={i} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-taupe/20">
                <button onClick={() => setAbierta(abierta === i ? null : i)} className="text-muted hover:text-bosque transition">
                  {abierta === i ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                <input
                  value={s.titulo}
                  onChange={(e) => seccion(i, "titulo", e.target.value)}
                  className="flex-1 bg-transparent text-sm font-medium text-bosque"
                />
                <span className="text-[11px] text-muted">{s.telefonos?.[0]?.numero || "sin teléfono"}</span>
                <button
                  onClick={() => setV((p) => ({ ...p, secciones: p.secciones.filter((_, k) => k !== i) }))}
                  title="Quitar apartado"
                  className="text-muted hover:text-red-600 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {abierta === i && (
                <div className="px-3 py-3 space-y-3 text-sm">
                  <Campo label="Entradilla" value={s.entradilla ?? ""} onChange={(x) => seccion(i, "entradilla", x)} />
                  <Area label="Pasos — uno por línea, en orden" value={lineas(s.pasos)} onChange={(x) => seccion(i, "pasos", partir(x))} rows={6} />
                  <Campo label="«Recuerda» (opcional)" value={s.recuerda ?? ""} onChange={(x) => seccion(i, "recuerda", x)} />
                  <Campo label="Título del bloque de teléfonos" value={s.telefonos_titulo ?? ""} onChange={(x) => seccion(i, "telefonos_titulo", x)} />
                  <Area
                    label="Teléfonos — uno por línea"
                    value={telsATexto(s.telefonos)}
                    onChange={(x) => seccion(i, "telefonos", textoATels(x))}
                    rows={4}
                    ayuda="Formato: Nombre del proveedor | +34 600 000 000"
                  />
                </div>
              )}
            </div>
          ))}
          {v.secciones.length === 0 && <p className="text-xs text-muted py-4 text-center">Sin apartados.</p>}
        </div>
      </div>

      {msg && (
        <div aria-live="polite" className={`px-5 py-2 text-sm border-t ${msg.ok ? "text-bosque bg-crema border-border" : "text-red-800 bg-red-50 border-red-200"}`}>
          {msg.texto}
        </div>
      )}
    </section>
  );
}
