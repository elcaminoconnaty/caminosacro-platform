"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { FORMATOS, type FormatoId } from "@/lib/contenido/formatos";
import type { Slide } from "@/lib/contenido/tipos";
import { exportarPieza } from "./exportarPieza";

export type ExportarProps = {
  piezaId: string;
  titulo: string;
  formato: FormatoId;
  slides: Slide[];
  /** true si hay algo escrito sin guardar: exportar ahora daría la versión vieja. */
  hayPendiente: boolean;
};

/**
 * Descarga los JPG de la pieza y los deja archivados en el bucket. El bucle vive en
 * `exportarPieza.ts`, compartido con "Aprobar y programar", que archiva sin descargar.
 */
export default function Exportar({ piezaId, titulo, formato, slides, hayPendiente }: ExportarProps) {
  const [estado, setEstado] = useState<{ hechas: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const f = FORMATOS[formato];

  async function exportar() {
    setAviso(null);
    setListo(null);
    setEstado({ hechas: 0, total: slides.length });
    try {
      const r = await exportarPieza({
        piezaId, titulo, formato, slides, descargar: true,
        onProgreso: (hechas, total) => setEstado({ hechas, total }),
      });
      if (r.avisos.length) setAviso(r.avisos[r.avisos.length - 1]);
      setListo(`${slides.length} ${slides.length === 1 ? "imagen" : "imágenes"} de ${f.w}×${f.h}`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setEstado(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void exportar()}
        disabled={estado !== null || hayPendiente}
        title={hayPendiente ? "Espera a que termine de guardar" : undefined}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-dorado text-bosque text-xs hover:bg-dorado-oscuro transition disabled:opacity-50"
      >
        <Download size={13} />
        {estado ? `Exportando ${estado.hechas}/${estado.total}…` : "Exportar"}
      </button>
      {listo && <span className="text-[11px] text-muted">Listo: {listo}</span>}
      {aviso && <span className="text-[11px] text-dorado-oscuro max-w-xs text-right leading-snug">{aviso}</span>}
    </div>
  );
}
