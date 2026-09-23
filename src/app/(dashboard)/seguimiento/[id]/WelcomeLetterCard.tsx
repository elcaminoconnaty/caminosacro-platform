"use client";

import { useState } from "react";

/**
 * La carta de bienvenida de esta cotización: la misma de siempre, con la ruta y el
 * itinerario de ESTA cotización.
 *
 * No se guarda en ningún lado: el PDF se arma en cada clic (ver ./carta-bienvenida/route.ts).
 * El título y el párrafo de la ruta se pueden corregir antes de abrirla; esos cambios viajan
 * en el enlace y se pierden al recargar, a propósito — la carta sugerida es la de siempre.
 */
export default function WelcomeLetterCard({
  quoteId,
  titulo,
  intro,
  cifras,
  fuente,
  error,
}: {
  quoteId: string;
  titulo: string | null;
  intro: string | null;
  cifras: string | null;
  fuente: "cotizacion" | "catalogo" | null;
  /** Por qué no se puede generar (sin itinerario). */
  error: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const [tit, setTit] = useState(titulo ?? "");
  const [txt, setTxt] = useState(intro ?? "");

  function enlace(descargar: boolean) {
    const p = new URLSearchParams();
    if (tit.trim() && tit.trim() !== titulo) p.set("titulo", tit.trim());
    if (txt.trim() && txt.trim() !== intro) p.set("intro", txt.trim());
    if (descargar) p.set("descargar", "1");
    const q = p.toString();
    return `/seguimiento/${quoteId}/carta-bienvenida${q ? `?${q}` : ""}`;
  }

  const editado = (tit.trim() !== (titulo ?? "") && tit.trim() !== "") || (txt.trim() !== (intro ?? "") && txt.trim() !== "");

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-bosque">Carta de bienvenida</h2>
          <p className="text-xs text-muted mt-0.5 truncate">
            {error
              ? "No se puede generar todavía."
              : `${tit || titulo} · ${cifras} · itinerario ${fuente === "cotizacion" ? "de esta cotización" : "del catálogo"}${editado ? " · textos editados" : ""}`}
          </p>
        </div>
        {!error && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => setEditando((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
            >
              {editando ? "Cerrar textos" : "Editar textos"}
            </button>
            <a
              href={enlace(false)}
              target="_blank"
              rel="noopener"
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
            >
              Ver carta
            </a>
            <a
              href={enlace(true)}
              className="text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition"
            >
              Descargar PDF
            </a>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="px-5 py-3 text-sm text-amber-900 bg-amber-50">{error}</div>
      )}

      {!error && editando && (
        <div className="px-5 py-4 space-y-3 bg-taupe/20 text-sm">
          <label className="block">
            <span className="text-xs text-muted">Título de la ruta</span>
            <input
              value={tit}
              onChange={(e) => setTit(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-white px-3 py-1.5"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Párrafo de &ldquo;Tu ruta&rdquo;</span>
            <textarea
              value={txt}
              onChange={(e) => setTxt(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-border bg-white px-3 py-1.5"
            />
          </label>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>El itinerario y las cifras salen de la tarjeta de Itinerario. Estos cambios no se guardan.</span>
            <button
              onClick={() => {
                setTit(titulo ?? "");
                setTxt(intro ?? "");
              }}
              className="underline hover:text-bosque"
            >
              Volver al texto sugerido
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
