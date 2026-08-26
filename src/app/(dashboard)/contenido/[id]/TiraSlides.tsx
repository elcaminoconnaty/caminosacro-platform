"use client";

import { ChevronUp, ChevronDown, Copy, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Slide, DefinicionPlantilla } from "@/lib/contenido/tipos";

export type TiraSlidesProps = {
  slides: Slide[];
  activo: number;
  nombrePlantilla: (id: string) => string;
  plantillasDisponibles: DefinicionPlantilla[];
  onSeleccionar: (i: number) => void;
  onAgregar: (plantillaId: string) => void;
  onDuplicar: (i: number) => void;
  onBorrar: (i: number) => void;
  onMover: (i: number, delta: number) => void;
};

export default function TiraSlides({
  slides,
  activo,
  nombrePlantilla,
  plantillasDisponibles,
  onSeleccionar,
  onAgregar,
  onDuplicar,
  onBorrar,
  onMover,
}: TiraSlidesProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted">
        {slides.length} {slides.length === 1 ? "slide" : "slides"}
      </span>

      <ul className="flex flex-col gap-1.5">
        {slides.map((s, i) => (
          <li key={i}>
            <div
              className={cn(
                "group flex items-center gap-2 px-2.5 py-2 rounded-md border text-left transition",
                i === activo
                  ? "border-bosque bg-bosque text-white"
                  : "border-border bg-bg-card hover:bg-taupe/40",
              )}
            >
              <button
                type="button"
                onClick={() => onSeleccionar(i)}
                className="flex-1 flex items-center gap-2 min-w-0"
              >
                <span
                  className={cn(
                    "shrink-0 w-6 h-6 rounded flex items-center justify-center text-[11px]",
                    i === activo ? "bg-dorado text-bosque" : "bg-taupe text-muted",
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate text-xs">{nombrePlantilla(s.plantilla)}</span>
              </button>

              <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                <button
                  type="button"
                  title="Subir"
                  aria-label="Subir este slide"
                  disabled={i === 0}
                  onClick={() => onMover(i, -1)}
                  className="p-1 rounded hover:bg-white/20 disabled:opacity-25"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  type="button"
                  title="Bajar"
                  aria-label="Bajar este slide"
                  disabled={i === slides.length - 1}
                  onClick={() => onMover(i, 1)}
                  className="p-1 rounded hover:bg-white/20 disabled:opacity-25"
                >
                  <ChevronDown size={13} />
                </button>
                <button
                  type="button"
                  title="Duplicar"
                  aria-label="Duplicar este slide"
                  onClick={() => onDuplicar(i)}
                  className="p-1 rounded hover:bg-white/20"
                >
                  <Copy size={13} />
                </button>
                <button
                  type="button"
                  title="Borrar"
                  aria-label="Borrar este slide"
                  disabled={slides.length === 1}
                  onClick={() => onBorrar(i)}
                  className="p-1 rounded hover:bg-white/20 disabled:opacity-25"
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <details className="mt-1">
        <summary className="flex items-center gap-1.5 px-2.5 py-2 rounded-md border border-dashed border-border text-xs text-muted cursor-pointer hover:bg-taupe/30">
          <Plus size={13} /> Agregar slide
        </summary>

        {/*
          Agrupadas por su papel en el carrusel. Con ocho plantillas una lista plana se
          aguantaba; pasando de diez se vuelve un menú indistinguible donde hay que leerlo
          todo para encontrar "una de cuerpo". El orden es el del carrusel: se abre, se
          desarrolla, se cierra.
        */}
        <div className="mt-1.5 flex flex-col gap-2">
          {(
            [
              ["portada", "Para abrir"],
              ["cuerpo", "Para desarrollar"],
              ["cierre", "Para cerrar"],
            ] as const
          ).map(([rol, titulo]) => {
            const delRol = plantillasDisponibles.filter((p) => p.rol === rol);
            if (delRol.length === 0) return null;
            return (
              <div key={rol} className="flex flex-col gap-0.5">
                <span className="px-2.5 text-[10px] uppercase tracking-wider text-muted">{titulo}</span>
                <ul className="flex flex-col gap-0.5">
                  {delRol.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onAgregar(p.id)}
                        className="w-full text-left px-2.5 py-2 rounded-md hover:bg-taupe/40"
                      >
                        <span className="block text-xs text-fg">{p.nombre}</span>
                        <span className="block text-[11px] text-muted leading-snug">{p.descripcion}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
