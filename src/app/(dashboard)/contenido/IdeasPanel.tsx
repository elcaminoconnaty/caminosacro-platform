"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check, X, TriangleAlert } from "lucide-react";
import { generarIdeas, aceptarIdea, descartarIdea } from "./ideasActions";

export type FilaIdea = {
  id: number;
  titular: string;
  pilar: string | null;
  formato: string | null;
  angulo: string | null;
  razon: string;
  ruta_nombre: string | null;
  evidencia: { nota?: string } | null;
};

export default function IdeasPanel({ ideas }: { ideas: FilaIdea[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

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
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              setAviso(null);
              const r = await generarIdeas();
              if ("error" in r && r.error) setAviso(r.error);
              else router.refresh();
            })
          }
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-bosque text-white text-xs hover:bg-bosque-medio transition disabled:opacity-50"
        >
          <Sparkles size={13} />
          {pendiente ? "Pensando…" : "Sugerir ideas"}
        </button>
      </div>

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
