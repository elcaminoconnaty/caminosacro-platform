import type { CSSProperties } from "react";
import { TIPOS_DIA, TIPO_DIA_BG, TIPO_DIA_LABELS, type TipoDia } from "@/lib/quotes/fechasViaje";

/** Rayado encima del color: el viaje tiene pago parcial. */
export const RAYADO_PARCIAL: CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,.3) 0 5px, transparent 5px 10px)",
};

export function LeyendaViaje({ tipos = TIPOS_DIA, parcial = false }: { tipos?: readonly TipoDia[]; parcial?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
      {tipos.map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <i className={`inline-block w-6 h-2.5 rounded-sm ${TIPO_DIA_BG[t]}`} />
          {TIPO_DIA_LABELS[t]}
        </span>
      ))}
      {parcial && (
        <span className="inline-flex items-center gap-1.5">
          <i className={`inline-block w-6 h-2.5 rounded-sm ${TIPO_DIA_BG.camino}`} style={RAYADO_PARCIAL} />
          Pago parcial
        </span>
      )}
    </div>
  );
}
