"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check, X, TriangleAlert, Laptop, ChevronDown } from "lucide-react";
import { encargarIdeas, recogerIdeas, aceptarIdea, descartarIdea } from "./ideasActions";
import type { ContextoIdeas } from "@/lib/contenido/ideas";
import { plantilla as buscarPlantilla } from "@/lib/contenido/plantillas/registry";

/** Cada cuánto se pregunta si el encargo ya está listo. */
const ESPERA_MS = 3000;

export type SlideIdea = { plantilla: string; valores: Record<string, string> };

export type FilaIdea = {
  id: number;
  titular: string;
  pilar: string | null;
  formato: string | null;
  angulo: string | null;
  razon: string;
  ruta_nombre: string | null;
  evidencia: { nota?: string } | null;
  slides: SlideIdea[] | null;
  fuente_dato: string | null;
};

/** Etiquetas en español para la chapita de fuente_dato. */
const ETIQUETAS_FUENTE: Record<string, string> = {
  metricas: "métricas",
  catalogo: "catálogo",
  cotizaciones: "cotizaciones",
  calendario: "calendario",
};

/** El titular de un slide: el primer campo de la plantilla que traiga texto. */
function tituloDeSlide(s: SlideIdea): string {
  const def = buscarPlantilla(s.plantilla)?.definicion;
  if (def) {
    for (const campo of def.campos) {
      const v = s.valores[campo.id];
      if (v && v.trim()) return v;
    }
  }
  const primero = Object.values(s.valores).find((v) => v && v.trim());
  return primero ?? "(sin texto)";
}

export default function IdeasPanel({
  ideas,
  workerEncendido,
  workerHace,
}: {
  ideas: FilaIdea[];
  workerEncendido: boolean;
  workerHace: number | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);
  const sondeo = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (sondeo.current) clearTimeout(sondeo.current); }, []);

  function sondear(trabajoId: number, contexto: ContextoIdeas) {
    if (sondeo.current) clearTimeout(sondeo.current);
    sondeo.current = setTimeout(() => {
      void (async () => {
        const r = await recogerIdeas(trabajoId, contexto);
        if ("esperando" in r && r.esperando) {
          sondear(trabajoId, contexto);
          return;
        }
        setEsperando(false);
        if ("error" in r && r.error) setAviso(r.error);
        else router.refresh();
      })();
    }, ESPERA_MS);
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="font-display text-lg text-bosque">Qué publicar</span>
          <span className="block text-[11px] text-muted mt-0.5">
            Ideas cruzadas de las métricas de Instagram, el catálogo y las cotizaciones.
          </span>
        </div>
        <button
          type="button"
          disabled={pendiente || esperando}
          onClick={() =>
            iniciar(async () => {
              setAviso(null);
              const r = await encargarIdeas();
              if ("error" in r && r.error) {
                setAviso(r.error);
                return;
              }
              if (!("trabajoId" in r) || r.trabajoId == null || !r.contexto) return;
              setEsperando(true);
              sondear(r.trabajoId, r.contexto);
            })
          }
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-bosque text-white text-xs hover:bg-bosque-medio transition disabled:opacity-50"
        >
          <Sparkles size={13} />
          {esperando ? "Encargado…" : pendiente ? "Encargando…" : "Sugerir ideas"}
        </button>
      </div>

      <p className="px-5 py-2 border-b border-border flex items-center gap-1.5 text-[11px] text-muted">
        <Laptop size={12} className={workerEncendido ? "text-bosque-medio" : "text-muted"} />
        {workerEncendido
          ? "El computador está conectado: las sugerencias salen en segundos."
          : workerHace != null && workerHace < 86400
            ? `El computador no está escuchando (último latido hace ${Math.round(workerHace / 60)} min). Puedes encargar igual: queda en cola.`
            : "El computador no está escuchando. Puedes encargar igual: queda en cola y se resuelve al encenderlo."}
      </p>

      {esperando && (
        <p className="px-5 py-2 text-[11px] text-muted border-b border-border leading-snug">
          {workerEncendido
            ? "Pensando en tu computador. Suele tardar unos segundos."
            : "Encargado. Esperando a que el computador esté encendido; las ideas aparecerán solas aquí."}
        </p>
      )}

      {aviso && (
        <p className="px-5 py-3 text-[11px] text-dorado-oscuro border-b border-border leading-snug">{aviso}</p>
      )}

      {ideas.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-muted">
          Sin ideas pendientes. Pídelas y saldrán con el dato que las justifica.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {ideas.map((idea) => (
            <li key={idea.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <span className="block text-sm text-fg">{idea.titular}</span>

                  <span className="mt-1 flex items-center gap-1.5 flex-wrap text-[10px] text-muted">
                    {idea.pilar && (
                      <span className="px-1.5 py-0.5 rounded bg-taupe text-muted">{idea.pilar}</span>
                    )}
                    {idea.fuente_dato && (
                      <span className="px-1.5 py-0.5 rounded bg-bosque/10 text-bosque-medio">
                        {ETIQUETAS_FUENTE[idea.fuente_dato] ?? idea.fuente_dato}
                      </span>
                    )}
                    {idea.formato && <span>{idea.formato}</span>}
                    {idea.ruta_nombre && <span>· {idea.ruta_nombre}</span>}
                  </span>

                  {idea.angulo && (
                    <p className="mt-1.5 text-[11px] text-muted leading-snug">{idea.angulo}</p>
                  )}

                  {/* La razón es lo que hace útil a la sugerencia: siempre visible. */}
                  <p className="mt-2 pl-2.5 border-l-2 border-dorado text-[11px] text-fg leading-snug">
                    {idea.razon}
                  </p>

                  {idea.evidencia?.nota && (
                    <p className="mt-1.5 flex items-start gap-1 text-[10px] text-muted leading-snug">
                      <TriangleAlert size={11} className="mt-px shrink-0" />
                      {idea.evidencia.nota}
                    </p>
                  )}

                  {idea.slides && idea.slides.length > 0 && (
                    <details className="mt-2 group">
                      <summary className="flex items-center gap-1 text-[10px] text-bosque-medio cursor-pointer select-none list-none">
                        <ChevronDown size={11} className="transition group-open:rotate-180" />
                        Ver los {idea.slides.length} slides
                      </summary>
                      <ol className="mt-1.5 flex flex-col gap-1 pl-2.5 border-l-2 border-border">
                        {idea.slides.map((s, i) => (
                          <li key={i} className="text-[10px] text-muted leading-snug">
                            <span className="text-fg">{i + 1}.</span>{" "}
                            <span className="text-fg">{buscarPlantilla(s.plantilla)?.definicion.nombre ?? s.plantilla}</span>
                            {" — "}
                            {tituloDeSlide(s)}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await aceptarIdea(idea.id);
                        if (r && "error" in r && r.error) setAviso(r.error);
                      })
                    }
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-dorado text-bosque text-[11px] hover:bg-dorado-oscuro transition"
                  >
                    <Check size={11} /> Armar
                  </button>
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await descartarIdea(idea.id);
                        if ("error" in r && r.error) setAviso(r.error);
                        else router.refresh();
                      })
                    }
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-muted hover:bg-taupe/40 transition"
                  >
                    <X size={11} /> Descartar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
