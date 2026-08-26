"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/client";
import { rutaPiezaJpg, sinBucket } from "@/lib/storage/paths";
import { FORMATOS, type FormatoId } from "@/lib/contenido/formatos";
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
 * Pide el PNG del slide y lo devuelve como JPEG.
 *
 * DOS DECISIONES, LAS DOS POR UN BUG REAL:
 *
 * 1. **Se dibuja desde el estado que hay en pantalla, no desde la base de datos.**
 *    Antes esto pedía `/api/contenido/piezas/<id>/<n>`, que LEE DE LA BASE, con una URL
 *    cacheada `immutable` y un hash calculado del estado del CLIENTE. Si el guardado
 *    automático (800 ms) todavía no había llegado, el servidor devolvía la versión ANTERIOR
 *    y el navegador la guardaba **para siempre** bajo el hash nuevo. Resultado: editabas,
 *    exportabas otra vez y bajaba la exportación vieja, para siempre. Ahora se manda el
 *    slide en el cuerpo al endpoint que no toca la base: lo exportado es, por construcción,
 *    lo que hay en pantalla.
 *
 * 2. **Se descarga el blob y se convierte con `createImageBitmap`, sin pasar por una URL.**
 *    Un `<img src=...>` vuelve a meter la caché del navegador en la ecuación, que es de
 *    donde venía el problema. Sin URL no hay nada que cachear.
 *
 * La conversión a JPEG sigue haciéndose aquí y no en el servidor porque `ImageResponse`
 * solo emite PNG y una pieza con foto pesa 1,5 MB; el canvas la deja en unos 250 KB. Y
 * JPEG es además lo único que acepta la Graph API de Instagram para la fase 2.
 */
async function pngAJpeg(
  cuerpo: { slide: Slide; formato: FormatoId },
  w: number,
  h: number,
): Promise<Blob> {
  const res = await fetch("/api/contenido/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...cuerpo, escala: 1 }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());

  const png = await res.blob();
  const bitmap = await createImageBitmap(png);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no dio contexto de canvas.");
  // Fondo blanco: el JPEG no tiene transparencia y sin esto los bordes salen negros.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return await new Promise<Blob>((resolver, rechazar) =>
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error("El canvas no devolvió imagen."))),
      "image/jpeg",
      CALIDAD_JPEG,
    ),
  );
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
        // Tamaño real, no el del preview: esto es el archivo que va a Instagram.
        const jpeg = await pngAJpeg({ slide: slides[i], formato }, f.w, f.h);

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
