"use client";

import { useEffect, useState } from "react";
import { FORMATOS, type FormatoId } from "@/lib/contenido/formatos";

export type LienzoProps = {
  piezaId: string;
  formato: FormatoId;
  indice: number;
  /** Huella del slide guardado. Al cambiar, el navegador pide la imagen nueva. */
  version: string;
  /** true mientras el autoguardado está en vuelo: el preview aún muestra lo anterior. */
  guardando: boolean;
  /** Dibuja las guías de zona segura encima del preview. */
  mostrarGuias: boolean;
};

/**
 * El preview del editor es un <img> apuntando AL MISMO endpoint que produce el archivo
 * final. No es una reimplementación en HTML de lo que hace Satori: es el archivo. Por eso
 * lo que se ve acá no puede diferir de lo que se descarga.
 *
 * El endpoint responde `immutable`, así que la URL lleva ?v=<hash>: navegar a un slide ya
 * visto es gratis, y basta con que cambie el contenido para que se pida la imagen nueva.
 */
export default function Lienzo({
  piezaId,
  formato,
  indice,
  version,
  guardando,
  mostrarGuias,
}: LienzoProps) {
  const f = FORMATOS[formato];
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);

  // El preview se pide a media resolución: pesa cuatro veces menos y a tamaño de pantalla
  // no se nota. La exportación sí pide el tamaño real.
  const src = `/api/contenido/piezas/${piezaId}/${indice}?v=${version}&escala=0.5`;

  useEffect(() => {
    setCargando(true);
    setFallo(false);
  }, [src]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative bg-bg-card border border-border rounded-xl overflow-hidden shadow-sm"
        style={{ aspectRatio: `${f.w} / ${f.h}`, width: "100%", maxWidth: 460 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={src}
          alt={`Slide ${indice + 1}`}
          className="w-full h-full object-contain"
          onLoad={() => setCargando(false)}
          onError={() => {
            setCargando(false);
            setFallo(true);
          }}
        />

        {/* Zona segura: dónde puede vivir el texto sin que se lo coma Instagram. */}
        {mostrarGuias && f.zonaSegura && (
          <>
            <div
              className="absolute left-0 right-0 top-0 bg-tinta/45 border-b border-dashed border-dorado/70 pointer-events-none"
              style={{ height: `${(f.zonaSegura.arriba / f.h) * 100}%` }}
            />
            <div
              className="absolute left-0 right-0 bottom-0 bg-tinta/45 border-t border-dashed border-dorado/70 pointer-events-none"
              style={{ height: `${(f.zonaSegura.abajo / f.h) * 100}%` }}
            />
          </>
        )}

        {(cargando || guardando) && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-card/60">
            <span className="text-xs text-muted">{guardando ? "Guardando…" : "Dibujando…"}</span>
          </div>
        )}

        {fallo && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <span className="text-xs text-muted">
              No se pudo dibujar el slide. Revisa que la foto siga disponible.
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span>
          {f.etiqueta} · {f.w}×{f.h}
        </span>
        {f.zonaSegura && mostrarGuias && <span className="text-dorado-oscuro">· {f.zonaSegura.motivo}</span>}
      </div>
    </div>
  );
}
