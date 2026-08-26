"use client";

import { useEffect, useRef, useState } from "react";
import { FORMATOS, type FormatoId } from "@/lib/contenido/formatos";
import type { Slide } from "@/lib/contenido/tipos";

export type LienzoProps = {
  formato: FormatoId;
  /** El slide TAL COMO ESTÁ EN PANTALLA, no el guardado. */
  slide: Slide | null;
  indice: number;
  mostrarGuias: boolean;
};

/**
 * El preview del editor.
 *
 * Dibuja lo que hay en pantalla ahora mismo, no lo que está guardado: manda el slide al
 * endpoint `POST /api/contenido/render`, que no toca la base de datos. Antes el preview
 * esperaba al guardado (escribir → 600 ms → guardar → renderizar → transferir), y eso eran
 * uno o dos segundos por cada tecla. El guardado sigue ocurriendo, pero por su cuenta.
 *
 * Sigue siendo el MISMO motor que produce el archivo final, así que lo que se ve es lo que
 * se descarga. Lo único distinto es la escala.
 */

/** Espera antes de pedir el dibujo. Corta para que se sienta vivo, suficiente para no
 *  disparar una petición por cada letra. */
const ESPERA_MS = 250;

/** Escala del preview. Medido: 0.35 pesa 312 KB contra los 588 KB de 0.5, y va más rápido.
 *  A tamaño de pantalla no se nota la diferencia. */
const ESCALA = 0.35;

export default function Lienzo({ formato, slide, indice, mostrarGuias }: LienzoProps) {
  const f = FORMATOS[formato];
  const [src, setSrc] = useState<string | null>(null);
  const [dibujando, setDibujando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVuelo = useRef<AbortController | null>(null);
  const urlAnterior = useRef<string | null>(null);

  // La huella del contenido: si no cambió, no se vuelve a pedir el dibujo.
  const huella = JSON.stringify({ slide, formato });

  useEffect(() => {
    if (!slide) {
      setSrc(null);
      return;
    }

    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      // Si el usuario siguió escribiendo, la petición anterior ya no sirve: se cancela para
      // no gastar servidor ni pintar un dibujo viejo encima del nuevo.
      enVuelo.current?.abort();
      const control = new AbortController();
      enVuelo.current = control;
      setDibujando(true);

      void (async () => {
        try {
          const res = await fetch("/api/contenido/render", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ slide, formato, escala: ESCALA }),
            signal: control.signal,
          });
          if (!res.ok) throw new Error(await res.text());

          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          // Liberar el blob anterior: si no, cada tecla deja basura en memoria del navegador.
          if (urlAnterior.current) URL.revokeObjectURL(urlAnterior.current);
          urlAnterior.current = url;

          setSrc(url);
          setFallo(null);
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") return;
          setFallo(e instanceof Error ? e.message : "No se pudo dibujar.");
        } finally {
          if (!control.signal.aborted) setDibujando(false);
        }
      })();
    }, ESPERA_MS);

    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
    // `huella` resume slide+formato: es lo único que puede cambiar el dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huella]);

  // Al desmontar, soltar el último blob.
  useEffect(
    () => () => {
      enVuelo.current?.abort();
      if (urlAnterior.current) URL.revokeObjectURL(urlAnterior.current);
    },
    [],
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative bg-bg-card border border-border rounded-xl overflow-hidden shadow-sm"
        style={{ aspectRatio: `${f.w} / ${f.h}`, width: "100%", maxWidth: 460 }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Slide ${indice + 1}`} className="w-full h-full object-contain" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {/*
              Sin slide (pieza con 0 slides) esto decía "Dibujando…" para siempre — daba
              la impresión de que algo se había quedado colgado cuando en realidad no hay
              nada que dibujar. `fallo` tiene su propio mensaje aparte, así que acá solo
              falta cubrir el caso de "no hay slide".
            */}
            <span className="text-xs text-muted">{fallo ? "" : slide ? "Dibujando…" : "Sin slide"}</span>
          </div>
        )}

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

        {/* Un punto discreto mientras redibuja: el dibujo anterior se queda visible, que es
            mucho menos molesto que parpadear en blanco a cada tecla. */}
        {dibujando && src && (
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-dorado animate-pulse" />
        )}

        {fallo && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-bg-card/90">
            {/*
              Antes acá iba un texto fijo ("Revisa que la foto siga disponible") sin
              importar qué hubiera fallado de verdad — el endpoint puede rechazar el
              slide por muchas otras razones (cuerpo inválido, plantilla desconocida,
              un campo corrupto) y decirle al usuario que mire la foto cuando el
              problema es otro es peor que no decir nada. Ahora se muestra el mensaje
              real que devolvió el servidor.
            */}
            <span className="text-xs text-muted leading-snug">No se pudo dibujar el slide: {fallo}</span>
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
