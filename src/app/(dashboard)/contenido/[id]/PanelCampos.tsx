"use client";

import type { DefinicionPlantilla } from "@/lib/contenido/tipos";

export type PanelCamposProps = {
  definicion: DefinicionPlantilla;
  valores: Record<string, string>;
  onCambio: (campoId: string, valor: string) => void;
};

/**
 * El formulario del editor NO se escribe a mano: se GENERA a partir de
 * `registry[plantilla].campos`. Por eso agregar una plantilla nueva es agregar un
 * archivo, sin tocar ni una pantalla.
 */
export default function PanelCampos({ definicion, valores, onCambio }: PanelCamposProps) {
  return (
    <div className="flex flex-col gap-4">
      {definicion.campos.map((campo) => {
        const valor = valores[campo.id] ?? "";
        const excedido = campo.maxLargo != null && valor.length > campo.maxLargo;

        return (
          <label key={campo.id} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between">
              <span className="text-xs text-fg">
                {campo.etiqueta}
                {campo.requerido && <span className="text-dorado-oscuro"> *</span>}
              </span>
              {campo.maxLargo != null && (
                <span className={excedido ? "text-[10px] text-dorado-oscuro" : "text-[10px] text-muted"}>
                  {valor.length}/{campo.maxLargo}
                </span>
              )}
            </span>

            {campo.tipo === "textarea" ? (
              <textarea
                value={valor}
                rows={3}
                onChange={(e) => onCambio(campo.id, e.target.value)}
                className="px-3 py-2 rounded-md border border-border bg-bg-card text-sm resize-y focus:outline-none focus:border-bosque"
              />
            ) : campo.tipo === "select" ? (
              <select
                value={valor}
                onChange={(e) => onCambio(campo.id, e.target.value)}
                className="px-3 py-2 rounded-md border border-border bg-bg-card text-sm focus:outline-none focus:border-bosque"
              >
                <option value="">—</option>
                {(campo.opciones ?? []).map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={campo.tipo === "numero" ? "number" : "text"}
                value={valor}
                onChange={(e) => onCambio(campo.id, e.target.value)}
                className="px-3 py-2 rounded-md border border-border bg-bg-card text-sm focus:outline-none focus:border-bosque"
              />
            )}

            {campo.ayuda && <span className="text-[11px] text-muted leading-snug">{campo.ayuda}</span>}
            {excedido && (
              <span className="text-[11px] text-dorado-oscuro leading-snug">
                Se pasa del largo recomendado. No se bloquea, pero puede salirse del lienzo.
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
