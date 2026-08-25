"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Upload, FolderOpen, ImageOff, Check, X, Images } from "lucide-react";
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

/** Las cuatro fuentes de foto del editor. "subir" y "sin" son solo pestañas de la interfaz. */
type Pestana = "banco" | "subidas" | "subir" | "sin";

const BUCKET = "contenido-fotos";

/**
 * Selector de foto del editor de contenido.
 *
 * Se ve como una miniatura + botón en el panel lateral; al abrir, un modal casi a
 * pantalla completa deja ver la foto elegida entre 177 sin apretujarse en una rejilla
 * de 3 columnas y 256px (T6 — PLAN_CONTENIDO.md).
 */
export default function SelectorFoto({
  banco,
  subidasIniciales,
  seleccionada,
  onElegir,
}: SelectorFotoProps) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>(seleccionada?.origen === "subida" ? "subidas" : "banco");
  const [subidas, setSubidas] = useState<FotoSubida[]>(subidasIniciales);
  const [subiendo, setSubiendo] = useState<{ hechas: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const inputArchivos = useRef<HTMLInputElement>(null);
  const inputCarpeta = useRef<HTMLInputElement>(null);

  // Escape cierra el modal.
  useEffect(() => {
    if (!abierto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto]);

  // El fondo no debe scrollear mientras el modal está abierto: son 177 fotos de scroll propio.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

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

  /** Elegir una foto (o "sin foto") cierra el modal: es la acción que termina el flujo. */
  function elegir(foto: FotoSlide | null) {
    onElegir(foto);
    setAbierto(false);
  }

  const esActual = (url: string) => seleccionada?.url === url;

  const listaActiva = pestana === "banco" ? banco : pestana === "subidas" ? subidas : [];

  return (
    <div className="flex flex-col gap-2">
      {/* Fuera del modal: solo la miniatura elegida y el botón para cambiarla. */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden border border-border bg-taupe/30 flex items-center justify-center">
          {seleccionada ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={seleccionada.url} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageOff size={18} className="text-muted" />
          )}
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-[11px] text-fg hover:bg-taupe/40 w-fit"
          >
            <Images size={12} /> {seleccionada ? "Cambiar foto" : "Elegir foto"}
          </button>
          <span className="text-[11px] text-muted truncate">
            {seleccionada
              ? seleccionada.origen === "banco"
                ? "Del banco"
                : "Foto subida"
              : "Sin foto — fondo verde de marca"}
          </span>
        </div>
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/70 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setAbierto(false)}
        >
          <div
            className="flex flex-col w-full h-full max-w-6xl max-h-[94vh] rounded-xl bg-bg-card border border-border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera: pestañas de fuente + cerrar */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border shrink-0">
              <div className="flex items-center gap-1 overflow-x-auto">
                {(
                  [
                    ["banco", `Banco (${banco.length})`],
                    ["subidas", `Mis fotos (${subidas.length})`],
                    ["subir", "Subir"],
                    ["sin", "Sin foto"],
                  ] as Array<[Pestana, string]>
                ).map(([id, etiqueta]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPestana(id)}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition",
                      pestana === id ? "bg-bosque text-white" : "text-muted hover:bg-taupe/40 hover:text-fg",
                    )}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="p-1.5 rounded-md text-muted hover:bg-taupe/40 hover:text-fg shrink-0"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto p-4">
              {pestana === "sin" && (
                <button
                  type="button"
                  onClick={() => elegir(null)}
                  className={cn(
                    "flex items-center justify-center gap-2 h-40 w-full rounded-md border border-dashed text-sm transition",
                    seleccionada === null
                      ? "border-bosque bg-bosque/5 text-fg"
                      : "border-border text-muted hover:bg-taupe/30",
                  )}
                >
                  <ImageOff size={18} /> Sin foto — fondo verde de marca
                </button>
              )}

              {pestana === "subir" && (
                <div className="flex flex-col gap-3 max-w-md">
                  <p className="text-xs text-muted leading-snug">
                    Sube fotos sueltas o una carpeta entera. Van a tus propias fotos, no al
                    banco del bot.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => inputArchivos.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs text-muted hover:bg-taupe/40"
                    >
                      <Upload size={13} /> Subir fotos
                    </button>
                    <button
                      type="button"
                      onClick={() => inputCarpeta.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs text-muted hover:bg-taupe/40"
                    >
                      <FolderOpen size={13} /> Una carpeta
                    </button>
                  </div>
                  {subiendo && (
                    <p className="text-xs text-muted">
                      Subiendo {subiendo.hechas} de {subiendo.total}…
                    </p>
                  )}
                  {aviso && <p className="text-xs text-dorado-oscuro leading-snug">{aviso}</p>}
                </div>
              )}

              {(pestana === "banco" || pestana === "subidas") && (
                <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {listaActiva.map((f) => (
                    <li key={`${pestana}-${f.id}`}>
                      <button
                        type="button"
                        onClick={() =>
                          elegir({ url: f.url, origen: pestana === "banco" ? "banco" : "subida" })
                        }
                        className={cn(
                          "relative block w-full rounded-lg overflow-hidden border-2 transition",
                          esActual(f.url) ? "border-bosque" : "border-transparent hover:border-taupe",
                        )}
                        style={{ aspectRatio: "1 / 1" }}
                        title={"ruta_tag" in f && typeof f.ruta_tag === "string" ? f.ruta_tag : undefined}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        {esActual(f.url) && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-bosque text-white flex items-center justify-center">
                            <Check size={12} />
                          </span>
                        )}
                        {"usada" in f && f.usada === true && (
                          <span className="absolute bottom-0 inset-x-0 bg-tinta/60 text-white text-[10px] py-0.5">
                            ya publicada
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                  {listaActiva.length === 0 && (
                    <li className="col-span-full text-xs text-muted py-16 text-center">
                      {pestana === "banco"
                        ? "El banco está vacío."
                        : "Todavía no has subido ninguna foto. Usa la pestaña «Subir»."}
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
