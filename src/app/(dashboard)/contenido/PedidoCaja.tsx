"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { encargarPedido, recogerPedido } from "./pedidoActions";
import {
  TIPOS_PEDIDO,
  CANTIDADES,
  MAX_LARGO_PEDIDO,
  type TipoPedidoId,
  type CantidadPedido,
} from "@/lib/contenido/pedidoOpciones";

/**
 * "Pídelo tú": escribes la idea que se te ocurrió y sale el post entero.
 *
 * Es el hermano abierto del botón "Sugerir ideas" que tiene encima. Aquel propone lo que
 * los datos sostienen; este hace lo que le pidas. Comparten cola, worker y bandeja: lo que
 * salga de aquí aparece como una tarjeta más, marcada como tuya.
 */

/** Cada cuánto se pregunta si el pedido ya está. Mismo ritmo que las sugerencias. */
const ESPERA_MS = 3000;

export default function PedidoCaja({ workerEncendido }: { workerEncendido: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [texto, setTexto] = useState("");
  const [cantidad, setCantidad] = useState<CantidadPedido>("auto");
  const [tipo, setTipo] = useState<TipoPedidoId>("auto");
  const [aviso, setAviso] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);
  const sondeo = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (sondeo.current) clearTimeout(sondeo.current); }, []);

  function sondear(trabajoId: number, textoPedido: string, tipoPedido: TipoPedidoId) {
    if (sondeo.current) clearTimeout(sondeo.current);
    sondeo.current = setTimeout(() => {
      void (async () => {
        const r = await recogerPedido(trabajoId, textoPedido, tipoPedido);
        if ("esperando" in r && r.esperando) {
          sondear(trabajoId, textoPedido, tipoPedido);
          return;
        }
        setEsperando(false);
        if ("error" in r && r.error) {
          setAviso(r.error);
          return;
        }
        // El pedido ya es una tarjeta en la bandeja: la caja se vacía para el siguiente.
        setTexto("");
        router.refresh();
      })();
    }, ESPERA_MS);
  }

  const listo = texto.trim().length > 0 && !pendiente && !esperando;

  return (
    <div className="px-5 py-4 border-b border-border bg-taupe/15 flex flex-col gap-2">
      <div>
        <span className="text-xs text-fg font-medium">Pídelo tú</span>
        <span className="block text-[11px] text-muted leading-snug mt-0.5">
          Escribe la idea que se te ocurrió y sale el post armado, slide por slide.
        </span>
      </div>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, MAX_LARGO_PEDIDO))}
        rows={3}
        placeholder="Un carrusel que explique qué es el Año Jacobeo"
        className="w-full px-3 py-2 rounded-md border border-border bg-bg-card text-xs leading-relaxed resize-y focus:outline-none focus:border-bosque"
      />

      <div className="flex items-end gap-2 flex-wrap">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">Cuántos</span>
          <select
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value as CantidadPedido)}
            className="px-2 py-1.5 rounded-md border border-border bg-bg-card text-[11px] focus:outline-none focus:border-bosque"
          >
            {CANTIDADES.map((c) => (
              <option key={c} value={c}>
                {c === "auto" ? "Como diga el pedido" : c === "1" ? "1 post" : `${c} posts`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 flex-1 min-w-32">
          <span className="text-[10px] text-muted">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoPedidoId)}
            className="w-full px-2 py-1.5 rounded-md border border-border bg-bg-card text-[11px] focus:outline-none focus:border-bosque"
          >
            {(Object.keys(TIPOS_PEDIDO) as TipoPedidoId[]).map((id) => (
              <option key={id} value={id}>
                {TIPOS_PEDIDO[id].etiqueta}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={!listo}
          onClick={() =>
            iniciar(async () => {
              setAviso(null);
              const r = await encargarPedido(texto, cantidad, tipo);
              if ("error" in r && r.error) {
                setAviso(r.error);
                return;
              }
              if (!("trabajoId" in r) || r.trabajoId == null) return;
              setEsperando(true);
              sondear(r.trabajoId, r.texto, r.tipo);
            })
          }
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-dorado text-bosque text-xs hover:bg-dorado-oscuro transition disabled:opacity-40"
        >
          <Wand2 size={13} />
          {esperando ? "Escribiendo…" : pendiente ? "Pidiendo…" : "Crear el post"}
        </button>
      </div>

      {/* La ayuda del tipo elegido, para no tener que adivinar qué significa cada uno. */}
      <span className="text-[10px] text-muted leading-snug">{TIPOS_PEDIDO[tipo].ayuda}</span>

      {esperando && (
        <p className="text-[11px] text-muted leading-snug">
          {workerEncendido
            ? "Escribiéndolo en tu computador. Suele tardar unos segundos."
            : "Pedido encolado. Esperando a que el computador esté encendido; el post aparecerá solo aquí abajo."}
        </p>
      )}

      {aviso && <p className="text-[11px] text-dorado-oscuro leading-snug">{aviso}</p>}
    </div>
  );
}
