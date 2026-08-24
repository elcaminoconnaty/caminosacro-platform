"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/client";
import { rutaPiezaJpg, sinBucket } from "@/lib/storage/paths";
import { FORMATOS, type FormatoId } from "@/lib/contenido/formatos";
import { hashSlide } from "@/lib/contenido/hashSlide";
import type { Slide } from "@/lib/contenido/tipos";
import { registrarExport } from "./exportActions";

export type ExportarProps = {
  piezaId: string;
  titulo: string;
  formato: FormatoId;
  slides: Slide[];
  /** true si hay algo escrito sin guardar: exportar ahora daría la versión vieja. */
  hayPendiente: boolean;
};

const BUCKET = "contenido-piezas";
const CALIDAD_JPEG = 0.92;

/**
 * Convierte el PNG del endpoint a JPEG usando un <canvas> del navegador.
 *
 * Por qué acá y no en el servidor: `ImageResponse` solo sabe emitir PNG, y una pieza con
 * foto pesa 2.6 MB. El canvas la deja en ~250 KB sin instalar `sharp` ni ningún binario
 * nativo. Y JPEG es además lo único que acepta la Graph API de Instagram, así que la
 * fase 2 ya queda resuelta de paso.
 *
 * El <img> es del mismo origen, así que el canvas no queda "contaminado" y toBlob puede
 * leerlo.
 */
function pngAJpeg(url: string, w: number, h: number): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return rechazar(new Error("El navegador no dio contexto de canvas."));
      // Fondo blanco: el JPEG no tiene transparencia y sin esto los bordes salen negros.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolver(blob) : rechazar(new Error("El canvas no devolvió imagen."))),
        "image/jpeg",
        CALIDAD_JPEG,
      );
    };
    img.onerror = () => rechazar(new Error("No se pudo cargar el slide desde el servidor."));
    img.src = url;
  });
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function nombreArchivo(titulo: string, n: number): string {
  const limpio = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return `${limpio || "pieza"}-${String(n + 1).padStart(2, "0")}.jpg`;
}

export default function Exportar({ piezaId, titulo, formato, slides, hayPendiente }: ExportarProps) {
  const [estado, setEstado] = useState<{ hechas: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const f = FORMATOS[formato];

  async function exportar() {
    setAviso(null);
    setListo(null);
    setEstado({ hechas: 0, total: slides.length });

    const supabase = createPublicClient();
    const rutas: string[] = [];

    try {
      for (let i = 0; i < slides.length; i++) {
        // Tamaño real, no el 0.5 del preview: esto es el archivo que va a Instagram.
        const url = `/api/contenido/piezas/${piezaId}/${i}?v=${hashSlide(slides[i], formato)}`;
        const jpeg = await pngAJpeg(url, f.w, f.h);

        descargar(jpeg, nombreArchivo(titulo, i));

        const rutaConBucket = rutaPiezaJpg(piezaId, i);
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(sinBucket(rutaConBucket), jpeg, { contentType: "image/jpeg", upsert: true });

        // Que falle la subida no debe arruinar la descarga: el usuario ya tiene su archivo.
        if (error) setAviso(`Se descargó todo, pero no se pudo archivar en Storage: ${error.message}`);
        else rutas.push(rutaConBucket);

        setEstado({ hechas: i + 1, total: slides.length });
      }

      if (rutas.length) {
        const r = await registrarExport(piezaId, rutas);
        if ("error" in r && r.error) setAviso(r.error);
      }
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
