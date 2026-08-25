"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FolderOpen, ImageOff, Check } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/client";
import { rutaFotoContenido, sinBucket } from "@/lib/storage/paths";
import { cn } from "@/lib/cn";
import type { FotoDelBanco, FotoSubida } from "@/lib/contenido/fotos";
import type { FotoSlide } from "@/lib/contenido/tipos";
import { registrarSubida } from "./fotoActions";

export type SelectorFotoProps = {
  banco: FotoDelBanco[];
  subidasIniciales: FotoSubida[];
  seleccionada: FotoSlide | null;
  onElegir: (foto: FotoSlide | null) => void;
};

type Pestana = "banco" | "subidas" | "sin";

const BUCKET = "contenido-fotos";

export default function SelectorFoto({
  banco,
  subidasIniciales,
  seleccionada,
  onElegir,
}: SelectorFotoProps) {
  const [pestana, setPestana] = useState<Pestana>(seleccionada?.origen === "subida" ? "subidas" : "banco");
  const [subidas, setSubidas] = useState<FotoSubida[]>(subidasIniciales);
  const [subiendo, setSubiendo] = useState<{ hechas: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const inputArchivos = useRef<HTMLInputElement>(null);
  const inputCarpeta = useRef<HTMLInputElement>(null);

  /**
   * Sube directo del navegador a Supabase Storage. No pasa por Server Action a propósito:
   * el bodySizeLimit es de 15 MB y una carpeta de fotos de cámara lo revienta.
   */
  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    const imagenes = Array.from(archivos).filter((f) => f.type.startsWith("image/"));
    if (imagenes.length === 0) {
      setAviso("No había ninguna imagen en lo que arrastraste.");
      return;
    }

    setAviso(null);
    setSubiendo({ hechas: 0, total: imagenes.length });
    const supabase = createPublicClient();
    const nuevas: FotoSubida[] = [];

    for (let i = 0; i < imagenes.length; i++) {
      const archivo = imagenes[i];
      const rutaConBucket = rutaFotoContenido(archivo.name);
      const ruta = sinBucket(rutaConBucket);

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, archivo, { contentType: archivo.type, upsert: true });

      if (error) {
        setAviso(`No se pudo subir ${archivo.name}: ${error.message}`);
        break;
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
      const r = await registrarSubida({
        storage_path: ruta,
        public_url: data.publicUrl,
        nombre: archivo.name,
        bytes: archivo.size,
      });

      if ("error" in r && r.error) {
        setAviso(r.error);
        break;
      }
      if ("foto" in r && r.foto) nuevas.push(r.foto);
      setSubiendo({ hechas: i + 1, total: imagenes.length });
    }

    if (nuevas.length) {
      setSubidas((prev) => [...nuevas, ...prev]);
      setPestana("subidas");
      // La última que subió es la que uno quiere ver puesta.
      const ultima = nuevas.at(-1);
      if (ultima) iniciar(() => onElegir({ url: ultima.url, origen: "subida" }));
    }
    setSubiendo(null);
  }

  const esActual = (url: string) => seleccionada?.url === url;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 border-b border-border">
        {(
          [
            ["banco", `Banco (${banco.length})`],
            ["subidas", `Mis fotos (${subidas.length})`],
            ["sin", "Sin foto"],
          ] as Array<[Pestana, string]>
        ).map(([id, etiqueta]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPestana(id)}
            className={cn(
              "px-2.5 py-1.5 text-[11px] border-b-2 -mb-px transition",
              pestana === id ? "border-bosque text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputArchivos.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-[11px] text-muted hover:bg-taupe/40"
        >
          <Upload size={12} /> Subir fotos
        </button>
        <button
          type="button"
          onClick={() => inputCarpeta.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-[11px] text-muted hover:bg-taupe/40"
        >
          <FolderOpen size={12} /> Una carpeta
        </button>
      </div>

      <input
        ref={inputArchivos}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void subir(e.target.files);
          e.target.value = "";
        }}
      />
      {/* webkitdirectory permite arrastrar una carpeta entera del disco. */}
      <input
        ref={inputCarpeta}
        type="file"
        multiple
        hidden
        // @ts-expect-error webkitdirectory no está en los tipos de React pero sí en el DOM
        webkitdirectory=""
        onChange={(e) => {
          void subir(e.target.files);
          e.target.value = "";
        }}
      />

      {subiendo && (
        <p className="text-[11px] text-muted">
          Subiendo {subiendo.hechas} de {subiendo.total}…
        </p>
      )}
      {aviso && <p className="text-[11px] text-dorado-oscuro leading-snug">{aviso}</p>}

      {pestana === "sin" ? (
        <button
          type="button"
          onClick={() => onElegir(null)}
          className={cn(
            "flex items-center justify-center gap-2 h-24 rounded-md border border-dashed text-[11px] transition",
            seleccionada === null
              ? "border-bosque bg-bosque/5 text-fg"
              : "border-border text-muted hover:bg-taupe/30",
          )}
        >
          <ImageOff size={14} /> Sin foto — fondo verde de marca
        </button>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-1">
          {(pestana === "banco" ? banco : subidas).map((f) => (
            <li key={`${pestana}-${f.id}`}>
              <button
                type="button"
                onClick={() => onElegir({ url: f.url, origen: pestana === "banco" ? "banco" : "subida" })}
                className={cn(
                  "relative block w-full rounded overflow-hidden border-2 transition",
                  esActual(f.url) ? "border-bosque" : "border-transparent hover:border-taupe",
                )}
                style={{ aspectRatio: "1 / 1" }}
                title={"ruta_tag" in f && typeof f.ruta_tag === "string" ? f.ruta_tag : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                {esActual(f.url) && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-bosque text-white flex items-center justify-center">
                    <Check size={10} />
                  </span>
                )}
                {"usada" in f && f.usada === true && (
                  <span className="absolute bottom-0 inset-x-0 bg-tinta/60 text-white text-[9px] py-0.5">
                    ya publicada
                  </span>
                )}
              </button>
            </li>
          ))}
          {(pestana === "banco" ? banco : subidas).length === 0 && (
            <li className="col-span-3 text-[11px] text-muted py-6 text-center">
              {pestana === "banco"
                ? "El banco está vacío."
                : "Todavía no has subido ninguna foto. Usa los botones de arriba."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
