"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { ESTADOS_PIEZA, ESTADO, type EstadoPiezaId } from "@/lib/contenido/estados";
import { cambiarEstado } from "./actions";

/**
 * Mover la pieza de borrador a publicada.
 *
 * La acción `cambiarEstado` existía desde el primer día pero **nunca se conectó a ninguna
 * pantalla**: se podía filtrar la bandeja por estado y no había forma de cambiarlo. Todas
 * las piezas se quedaban en "borrador" para siempre.
 */
export default function SelectorEstado({
  piezaId,
  estadoInicial,
}: {
  piezaId: string;
  estadoInicial: EstadoPiezaId;
}) {
  const [estado, setEstado] = useState<EstadoPiezaId>(estadoInicial);
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1" role="group" aria-label="Estado de la pieza">
        {ESTADOS_PIEZA.map((e) => (
          <button
            key={e}
            type="button"
            disabled={pendiente}
            title={ESTADO[e].ayuda}
            aria-label={`Marcar como ${ESTADO[e].etiqueta}`}
            aria-pressed={estado === e}
            onClick={() =>
              iniciar(async () => {
                const anterior = estado;
                // Optimista: el cambio se ve al instante y se revierte si falla, en vez de
                // dejar el botón muerto mientras viaja la petición.
                setEstado(e);
                setAviso(null);
                const r = await cambiarEstado(piezaId, e);
                if ("error" in r && r.error) {
                  setEstado(anterior);
                  setAviso(r.error);
                }
              })
            }
            className={cn(
              "px-2.5 py-1.5 rounded-md text-[11px] transition disabled:opacity-60",
              estado === e ? ESTADO[e].clase : "border border-border text-muted hover:bg-taupe/40",
            )}
          >
            {ESTADO[e].etiqueta}
          </button>
        ))}
      </div>
      {aviso && <span className="text-[11px] text-dorado-oscuro">{aviso}</span>}
    </div>
  );
}
