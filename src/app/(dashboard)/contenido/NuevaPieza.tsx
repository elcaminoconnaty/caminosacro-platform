"use client";

import { useState, useTransition } from "react";
import { FORMATOS_LISTA, FORMATO_POR_DEFECTO } from "@/lib/contenido/formatos";
import { crearPieza } from "./actions";

/**
 * El alta va por componente cliente y no por `<form action={serverAction}>` porque la
 * acción devuelve `{error}` cuando algo sale mal —convención del repo— y un `action`
 * nativo exige que la acción no devuelva nada. Es el mismo patrón del Wizard de
 * cotizaciones.
 */
export default function NuevaPieza() {
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          iniciar(async () => {
            const r = await crearPieza(fd);
            // En el camino feliz `crearPieza` redirige, así que esto solo corre si falló.
            if (r && "error" in r && r.error) setAviso(r.error);
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">Título</span>
          <input
            name="titulo"
            placeholder="Francés desde Sarria"
            className="px-3 py-2 rounded-md border border-border bg-bg-card text-sm w-52 focus:outline-none focus:border-bosque"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">Formato</span>
          <select
            name="formato"
            defaultValue={FORMATO_POR_DEFECTO}
            className="px-3 py-2 rounded-md border border-border bg-bg-card text-sm focus:outline-none focus:border-bosque"
          >
            {FORMATOS_LISTA.map((f) => (
              <option key={f.id} value={f.id}>
                {f.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pendiente}
          className="px-4 py-2 rounded-md bg-bosque text-white text-sm hover:bg-bosque-medio transition disabled:opacity-50"
        >
          {pendiente ? "Creando…" : "Nueva pieza"}
        </button>
      </form>
      {aviso && <span className="text-[11px] text-dorado-oscuro">{aviso}</span>}
    </div>
  );
}
