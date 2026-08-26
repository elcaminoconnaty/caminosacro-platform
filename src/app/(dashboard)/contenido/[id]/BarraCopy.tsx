"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, CircleCheck, TriangleAlert } from "lucide-react";
import type { Hallazgo } from "@/lib/contenido/vozLint";
import { encargarCopy, recogerCopy, guardarCopyPieza, revisarCopy } from "./copyActions";

export type BarraCopyProps = {
  piezaId: string;
  captionInicial: string;
  hashtagsIniciales: string;
  /** Si el computador de Nico está encendido y escuchando la cola. */
  workerEncendido: boolean;
};

/** Cada cuánto se pregunta si el encargo ya está listo. */
const ESPERA_MS = 2500;

/**
 * El caption y sus hashtags, con el revisor de voz siempre encendido.
 *
 * El revisor no juzga si el texto es bueno: caza lo que la marca tiene prohibido —
 * markdown, listas, frases cliché, más de un emoji, hashtags fuera de la lista curada.
 * Corre sobre lo que escriba el usuario Y sobre lo que devuelva Claude, sin excepción.
 */
export default function BarraCopy({ piezaId, captionInicial, hashtagsIniciales, workerEncendido }: BarraCopyProps) {
  const [caption, setCaption] = useState(captionInicial);
  const [hashtags, setHashtags] = useState(hashtagsIniciales);
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [esperando, setEsperando] = useState<{ posicion: number } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sondeo = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Se limpia el sondeo si el usuario se va de la página a mitad de un encargo.
  useEffect(() => () => { if (sondeo.current) clearTimeout(sondeo.current); }, []);

  // Guardado y revisión con la misma espera que el resto del editor.
  useEffect(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      void (async () => {
        const r = await revisarCopy(caption, hashtags);
        setHallazgos(r.hallazgos);
        // El resultado se ignoraba: si el guardado fallaba (RLS, red, lo que sea), el
        // caption se quedaba sin persistir y nadie se enteraba — se seguía viendo
        // "escrito" en la pantalla pero un F5 lo perdía. Igual que `guardarSlides` en el
        // editor, el error se muestra en vez de tragárselo.
        const g = await guardarCopyPieza(piezaId, caption, hashtags);
        if ("error" in g && g.error) setAviso(g.error);
      })();
    }, 600);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [caption, hashtags, piezaId]);

  /**
   * Pregunta cada pocos segundos si el encargo ya está. No es un spinner mudo: mientras
   * espera dice si el computador está escuchando o si el encargo quedó en cola esperando
   * a que lo enciendan, que es la diferencia que le importa a quien está mirando.
   */
  function sondear(trabajoId: number) {
    if (sondeo.current) clearTimeout(sondeo.current);
    sondeo.current = setTimeout(() => {
      void (async () => {
        const r = await recogerCopy(piezaId, trabajoId);
        if ("esperando" in r && r.esperando) {
          setEsperando({ posicion: r.posicion ?? 0 });
          sondear(trabajoId);
          return;
        }
        setEsperando(null);
        if ("error" in r && r.error) {
          setAviso(r.error);
          return;
        }
        if ("ok" in r && r.ok) {
          setCaption(r.caption ?? "");
          setHashtags(r.hashtags ?? "");
          setHallazgos(r.hallazgos ?? []);
        }
      })();
    }, ESPERA_MS);
  }

  const errores = hallazgos.filter((h) => h.gravedad === "error");

  return (
    <section className="bg-bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg">Copy del post</span>
        <button
          type="button"
          disabled={pendiente || esperando !== null}
          onClick={() =>
            iniciar(async () => {
              setAviso(null);
              const r = await encargarCopy(piezaId);
              if ("error" in r && r.error) {
                setAviso(r.error);
                return;
              }
              if (!("trabajoId" in r) || r.trabajoId == null) return;
              setEsperando({ posicion: 0 });
              sondear(r.trabajoId);
            })
          }
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-bosque text-white text-xs hover:bg-bosque-medio transition disabled:opacity-50"
        >
          <Sparkles size={12} />
          {esperando ? "Encargado…" : pendiente ? "Encargando…" : "Sugerir copy"}
        </button>
      </div>

      <textarea
        value={caption}
        rows={9}
        placeholder="El caption del post. Escríbelo tú o pídeselo al estudio."
        onChange={(e) => setCaption(e.target.value)}
        className="px-3 py-2 rounded-md border border-border bg-bg text-sm resize-y focus:outline-none focus:border-bosque leading-relaxed"
      />
      <textarea
        value={hashtags}
        rows={2}
        placeholder="#caminodesantiago #caminosacro …"
        onChange={(e) => setHashtags(e.target.value)}
        className="px-3 py-2 rounded-md border border-border bg-bg text-xs resize-y focus:outline-none focus:border-bosque"
      />

      <div className="flex items-center gap-3 text-[11px] text-muted">
        <span>{caption.length} caracteres</span>
        <span>· {(hashtags.match(/#/g) ?? []).length} hashtags</span>
      </div>

      {esperando && (
        <p className="text-[11px] text-muted leading-snug">
          {workerEncendido
            ? esperando.posicion > 0
              ? `En cola, con ${esperando.posicion} encargo(s) por delante. Suele tardar unos segundos.`
              : "Escribiendo en tu computador. Suele tardar unos segundos."
            : "Encargado. Está esperando a que el computador de Nico esté encendido; en cuanto lo esté, el copy aparece solo aquí."}
        </p>
      )}

      {aviso && <p className="text-[11px] text-dorado-oscuro leading-snug">{aviso}</p>}

      {caption.length > 0 &&
        (hallazgos.length === 0 ? (
          <p className="flex items-center gap-1.5 text-[11px] text-bosque-medio">
            <CircleCheck size={12} /> Cumple las reglas de voz de la marca.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {hallazgos.map((h, i) => (
              <li
                key={i}
                className={
                  h.gravedad === "error"
                    ? "flex items-start gap-1.5 text-[11px] text-pink-800 leading-snug"
                    : "flex items-start gap-1.5 text-[11px] text-dorado-oscuro leading-snug"
                }
              >
                <TriangleAlert size={11} className="mt-px shrink-0" />
                <span>
                  <span className="font-medium">{h.regla}:</span> {h.detalle}
                </span>
              </li>
            ))}
            {errores.length > 0 && (
              <li className="text-[10px] text-muted mt-0.5">
                Estas reglas salen de la estrategia que usa el bot que publica a diario.
              </li>
            )}
          </ul>
        ))}
    </section>
  );
}
