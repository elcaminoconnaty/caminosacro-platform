"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { FORMATOS } from "@/lib/contenido/formatos";
import { duplicarPieza, borrarPieza } from "./actions";

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

const COLOR_ESTADO: Record<string, string> = {
  borrador: "bg-taupe text-muted",
  listo: "bg-dorado text-bosque",
  publicado: "bg-bosque text-white",
  archivado: "bg-taupe/50 text-muted",
};

export default function PiezasGrid({ filas }: { filas: FilaPieza[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

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
    <div className="flex flex-col gap-2">
      {aviso && <p className="text-xs text-dorado-oscuro">{aviso}</p>}
      <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filas.map((p) => {
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
                      p.miniatura ??
                      `/api/contenido/piezas/${p.id}/0?v=${encodeURIComponent(p.actualizado)}&escala=0.2`
                    }
                    alt={p.titulo}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="px-3.5 py-3">
                  <span className="block text-sm text-fg truncate">{p.titulo}</span>
                  <span className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                    <span className={cn("px-1.5 py-0.5 rounded", COLOR_ESTADO[p.estado] ?? "bg-taupe text-muted")}>
                      {p.estado}
                    </span>
                    <span>{f?.etiqueta ?? p.formato}</span>
                    <span>· {p.n_slides} {p.n_slides === 1 ? "slide" : "slides"}</span>
                  </span>
                </div>
              </Link>

              <div className="px-3.5 pb-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
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
