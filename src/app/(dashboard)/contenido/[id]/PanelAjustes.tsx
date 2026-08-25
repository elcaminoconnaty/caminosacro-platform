"use client";

import { RotateCcw } from "lucide-react";
import { CONTROLES_AJUSTE, AJUSTES_POR_DEFECTO, type AjustesSlide } from "@/lib/contenido/ajustes";

export type PanelAjustesProps = {
  ajustes: Partial<AjustesSlide> | undefined;
  /** Si esta plantilla lleva foto: sin foto, acercar y velar no significan nada. */
  usaFoto: boolean;
  /** Si esta plantilla dibuja la franja verde inferior. */
  tieneFranja: boolean;
  onCambio: (ajustes: Partial<AjustesSlide>) => void;
};

/**
 * Las cuatro perillas de diseño del slide.
 *
 * Deliberadamente son perillas y no un lienzo libre: se mueven en segundos y dejan la pieza
 * imposible de romper. Ver la cabecera de `src/lib/contenido/ajustes.ts` para el porqué.
 */
export default function PanelAjustes({ ajustes, usaFoto, tieneFranja, onCambio }: PanelAjustesProps) {
  const a = { ...AJUSTES_POR_DEFECTO, ...(ajustes ?? {}) };
  const tocado = Object.keys(ajustes ?? {}).length > 0;

  const visibles = CONTROLES_AJUSTE.filter((c) => {
    if ("soloConFoto" in c && c.soloConFoto && !usaFoto) return false;
    if ("soloConFranja" in c && c.soloConFranja && !tieneFranja) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-fg">Ajustes de diseño</span>
        {tocado && (
          <button
            type="button"
            onClick={() => onCambio({})}
            className="flex items-center gap-1 text-[10px] text-muted hover:text-fg transition"
          >
            <RotateCcw size={10} /> Volver al original
          </button>
        )}
      </div>

      {visibles.map((c) => {
        // `altoBloque` y `velo` pueden venir en null, que significa "lo que diga el formato".
        const bruto = a[c.id];
        const valor = bruto == null ? (c.id === "altoBloque" ? 0.33 : 0.72) : bruto;

        return (
          <label key={c.id} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between">
              <span className="text-[11px] text-muted">{c.etiqueta}</span>
              <span className="text-[10px] text-fg">{c.formato(valor)}</span>
            </span>
            <input
              type="range"
              min={c.min}
              max={c.max}
              step={c.paso}
              value={valor}
              onChange={(e) => onCambio({ ...ajustes, [c.id]: Number(e.target.value) })}
              className="w-full accent-bosque"
            />
          </label>
        );
      })}

      {usaFoto && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">Qué parte de la foto se ve</span>
          <div className="flex gap-1">
            {(["arriba", "centro", "abajo"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onCambio({ ...ajustes, encuadreFoto: p })}
                className={
                  a.encuadreFoto === p
                    ? "flex-1 px-2 py-1.5 rounded-md bg-bosque text-white text-[11px]"
                    : "flex-1 px-2 py-1.5 rounded-md border border-border text-[11px] text-muted hover:bg-taupe/40"
                }
              >
                {p}
              </button>
            ))}
          </div>
        </label>
      )}
    </div>
  );
}
