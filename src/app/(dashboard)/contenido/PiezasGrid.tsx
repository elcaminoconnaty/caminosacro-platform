"use client";

import Link from "next/link";
import { useTransition, useState, useMemo } from "react";
import { Copy, Trash2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { miniatura } from "@/lib/contenido/miniatura";
import { FORMATOS } from "@/lib/contenido/formatos";
import { duplicarPieza, borrarPieza } from "./actions";
import { cambiarEstadoPieza } from "./actions";
import { ESTADOS_PIEZA, ESTADO, type EstadoPiezaId } from "@/lib/contenido/estados";

export type FilaPieza = {
  id: string;
  titulo: string;
  formato: string;
  estado: string;
  n_slides: number;
  actualizado: string;
  /** URL pública del primer JPG exportado, si la pieza ya se exportó alguna vez. */
  miniatura: string | null;
};

/** Quita tildes y baja a minúsculas: buscar "frances" tiene que encontrar "Francés". */
function normalizar(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const ESTADOS = ["todas", "borrador", "listo", "publicado"] as const;
type FiltroEstado = (typeof ESTADOS)[number];

export default function PiezasGrid({ filas }: { filas: FilaPieza[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  // Con un post por cada una de las 27 rutas, la lista sin filtro es un muro: encontrar
  // "el del Primitivo" obligaba a recorrerla entera con los ojos.
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("todas");

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return filas.filter((p) => {
      if (estado !== "todas" && p.estado !== estado) return false;
      if (!q) return true;
      return normalizar(p.titulo).includes(q);
    });
  }, [filas, busqueda, estado]);

  if (filas.length === 0) {
    return (
      <div className="bg-bg-card border border-dashed border-border rounded-xl px-6 py-12 text-center">
        <p className="text-sm text-muted">
          Todavía no hay piezas. Crea la primera y solo tendrás que cambiar los textos.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="relative flex items-center">
          <Search size={13} className="absolute left-2.5 text-muted pointer-events-none" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por título…"
            className="pl-8 pr-3 py-1.5 rounded-md border border-border bg-bg-card text-xs w-56 focus:outline-none focus:border-bosque"
          />
        </label>

        <div className="flex items-center gap-1">
          {ESTADOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEstado(e)}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-[11px] transition",
                estado === e ? "bg-bosque text-white" : "border border-border text-muted hover:bg-taupe/40",
              )}
            >
              {e === "todas" ? "Todas" : e}
            </button>
          ))}
        </div>

        <span className="text-[11px] text-muted ml-auto">
          {visibles.length === filas.length
            ? `${filas.length} ${filas.length === 1 ? "pieza" : "piezas"}`
            : `${visibles.length} de ${filas.length}`}
        </span>
      </div>

      {aviso && <p className="text-xs text-dorado-oscuro">{aviso}</p>}

      {visibles.length === 0 && (
        <p className="bg-bg-card border border-dashed border-border rounded-xl px-6 py-8 text-center text-xs text-muted">
          Ninguna pieza coincide con lo que buscas.
        </p>
      )}

      <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {visibles.map((p) => {
          const f = FORMATOS[p.formato as keyof typeof FORMATOS];
          return (
            <li
              key={p.id}
              className="group bg-bg-card border border-border rounded-xl overflow-hidden hover:border-bosque transition"
            >
              <Link href={`/contenido/${p.id}`} className="block">
                <div
                  className="bg-crema border-b border-border"
                  style={{ aspectRatio: f ? `${f.w} / ${f.h}` : "4 / 5", maxHeight: 240 }}
                >
                  {/*
                    La miniatura sale del JPG ya exportado cuando existe: un archivo
                    estático que Storage sirve directo. Antes cada tarjeta de esta lista
                    disparaba un render completo en el servidor, así que abrir la bandeja
                    con diez piezas eran diez renders — de ahí buena parte de la lentitud.
                    Sin exportar todavía, se cae al render pero a escala 0.2, que basta
                    para una tarjeta.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      p.miniatura
                        ? miniatura(p.miniatura, 320)
                        : `/api/contenido/piezas/${p.id}/0?v=${encodeURIComponent(p.actualizado)}&escala=0.2`
                    }
                    alt={p.titulo}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="px-3.5 py-3">
                  <span className="block text-sm text-fg truncate">{p.titulo}</span>
                  <span className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                    <span className={cn("px-1.5 py-0.5 rounded", ESTADO[p.estado as EstadoPiezaId]?.clase ?? "bg-taupe text-muted")}>
                      {ESTADO[p.estado as EstadoPiezaId]?.etiqueta ?? p.estado}
                    </span>
                    <span>{f?.etiqueta ?? p.formato}</span>
                    <span>· {p.n_slides} {p.n_slides === 1 ? "slide" : "slides"}</span>
                  </span>
                </div>
              </Link>

              <div className="px-3.5 pb-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <select
                  value={p.estado}
                  disabled={pendiente}
                  aria-label={`Estado de ${p.titulo}`}
                  onChange={(e) =>
                    iniciar(async () => {
                      const r = await cambiarEstadoPieza(p.id, e.target.value);
                      if ("error" in r && r.error) setAviso(r.error);
                      else router.refresh();
                    })
                  }
                  className="px-1.5 py-1 rounded border border-border bg-bg-card text-[11px] text-muted"
                >
                  {ESTADOS_PIEZA.map((e) => (
                    <option key={e} value={e}>
                      {ESTADO[e].etiqueta}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await duplicarPieza(p.id);
                      if ("error" in r && r.error) setAviso(r.error);
                      else if ("id" in r) router.push(`/contenido/${r.id}`);
                    })
                  }
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted hover:bg-taupe/40"
                >
                  <Copy size={12} /> Duplicar
                </button>
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await borrarPieza(p.id);
                      if ("error" in r && r.error) setAviso(r.error);
                      else router.refresh();
                    })
                  }
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted hover:bg-taupe/40"
                >
                  <Trash2 size={12} /> Borrar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
