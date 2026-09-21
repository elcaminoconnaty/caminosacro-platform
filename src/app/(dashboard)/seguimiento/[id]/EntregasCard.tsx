"use client";

import { useState, useTransition } from "react";
import { History, Mail, MessageCircle, FileSignature, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { eur } from "@/lib/format";
import { getSignedUrl } from "./actions";

/**
 * El historial de lo que se le entregó al peregrino (migración 0049).
 *
 * Existe porque el PDF de la cotización vive en una ruta fija y se sobrescribe al
 * regenerar: del documento que alguien recibió el martes no quedaba nada el miércoles. Cada
 * fila de acá es una copia intocable, con las cifras de ese momento.
 *
 * Lo más útil de la tarjeta no es la lista, es el AVISO de arriba: si la cotización cambió
 * desde la última entrega, lo dice con las dos cifras. Porque el enlace que el peregrino ya
 * tiene sigue mostrando lo entregado —no el precio nuevo—, y eso hay que saberlo antes de
 * que llame preguntando.
 */

export type EntregaVista = {
  id: string;
  version: number;
  canal: "correo" | "whatsapp" | "contrato";
  destinatario: string | null;
  pdf_path: string;
  pdf_sha256: string;
  total_eur: number | null;
  created_at: string;
  datos: Record<string, unknown>;
};

const CANAL: Record<EntregaVista["canal"], { etiqueta: string; Icono: typeof Mail; ayuda: string }> = {
  correo: { etiqueta: "Correo", Icono: Mail, ayuda: "Se le envió la cotización por correo, con el PDF adjunto." },
  whatsapp: {
    etiqueta: "WhatsApp",
    Icono: MessageCircle,
    ayuda: "Se abrió el chat con el mensaje escrito. La plataforma no puede saber si se pulsó enviar; lo que sí queda es el documento congelado.",
  },
  contrato: { etiqueta: "Anexo del contrato", Icono: FileSignature, ayuda: "Viajó como Anexo No. 1 con un correo del contrato." },
};

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

export default function EntregasCard({
  entregas,
  totalActual,
}: {
  entregas: EntregaVista[];
  /** El total de HOY, para avisar si la cotización cambió después de entregarla. */
  totalActual: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ultima = entregas[0] ?? null;
  const cambio = ultima && ultima.total_eur != null && Math.abs(Number(ultima.total_eur) - totalActual) > 0.01;

  function ver(path: string) {
    setError(null);
    startTransition(async () => {
      const r = await getSignedUrl(path);
      if (r.url) window.open(r.url, "_blank");
      else setError(r.error ?? "No pude abrir ese PDF.");
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-taupe/20 transition"
      >
        {abierto ? <ChevronDown size={16} className="text-muted shrink-0" /> : <ChevronRight size={16} className="text-muted shrink-0" />}
        <History size={16} className="text-bosque shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg text-bosque">
            Historial de entregas
            {entregas.length > 0 && (
              <span className="ml-2 text-xs align-middle px-2 py-0.5 rounded-full bg-taupe/60 text-muted font-semibold">
                {entregas.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {ultima
              ? `Lo último que recibió: v${ultima.version}, ${fechaHora(ultima.created_at)}.`
              : "Todavía no se le ha entregado nada."}
          </p>
        </div>
        {cambio && (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold shrink-0">
            <AlertTriangle size={11} /> cambió después
          </span>
        )}
      </button>

      {abierto && (
        <div className="px-5 py-4 border-t border-border space-y-3 text-sm">
          {cambio && ultima && (
            <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              La cotización cambió desde la última entrega:{" "}
              <strong>{eur(Number(ultima.total_eur))}</strong> entonces,{" "}
              <strong>{eur(totalActual)}</strong> ahora. El enlace que ya tiene el peregrino
              sigue mostrando lo entregado; vuelve a enviárselo (correo o WhatsApp) para que
              vea lo nuevo.
            </div>
          )}

          {entregas.length === 0 ? (
            <p className="text-xs text-muted">
              Acá va quedando cada vez que la cotización sale: por correo, por WhatsApp o como
              Anexo 1 de un contrato. De cada una se guarda el PDF exacto que recibió, que ya no
              cambia aunque la cotización se regenere.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entregas.map((e, i) => {
                const { etiqueta, Icono, ayuda } = CANAL[e.canal] ?? CANAL.correo;
                // Dos entregas del mismo documento comparten huella: se dice, para que nadie
                // busque diferencias donde no las hay.
                const mismoQueLaSiguiente = entregas[i + 1]?.pdf_sha256 === e.pdf_sha256;
                return (
                  <li key={e.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-xs text-muted w-8 shrink-0">v{e.version}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-fg" title={ayuda}>
                      <Icono size={13} className="text-muted" /> {etiqueta}
                    </span>
                    <span className="text-xs text-muted flex-1 min-w-[180px] truncate" title={e.destinatario ?? ""}>
                      {e.destinatario || "—"}
                    </span>
                    <span className="text-xs text-muted whitespace-nowrap">{fechaHora(e.created_at)}</span>
                    <span className="text-xs font-medium text-fg whitespace-nowrap w-20 text-right">
                      {e.total_eur != null ? eur(Number(e.total_eur)) : "—"}
                    </span>
                    {mismoQueLaSiguiente && (
                      <span className="text-[10px] text-muted" title="El mismo PDF que la entrega anterior">
                        mismo documento
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => ver(e.pdf_path)}
                      disabled={pending}
                      className="text-xs px-3 py-1 rounded-md border border-border hover:bg-taupe/40 disabled:opacity-40 transition whitespace-nowrap"
                    >
                      Ver el PDF que recibió
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </section>
  );
}
