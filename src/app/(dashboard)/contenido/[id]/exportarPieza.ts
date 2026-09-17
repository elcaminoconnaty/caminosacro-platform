import { FORMATOS, type FormatoId } from "@/lib/contenido/formatos";
import type { Slide } from "@/lib/contenido/tipos";
import { hashPieza } from "@/lib/contenido/hashSlide";
import { archivarSlide, registrarExport } from "./exportActions";

/**
 * El bucle de exportación, compartido por el botón "Exportar" (descarga + archiva) y por
 * "Aprobar y programar" (solo archiva: nadie quiere seis descargas para programar un
 * post). Corre en el navegador: es quien convierte el PNG a JPEG con canvas.
 */

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
 * JPEG es además lo único que acepta la Graph API de Instagram.
 */
export async function pngAJpeg(
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

/** El JPEG viaja a la Server Action como base64: es lo que acepta un argumento serializable. */
function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      const s = String(lector.result);
      // `data:image/jpeg;base64,XXXX` → solo la parte de datos.
      resolver(s.slice(s.indexOf(",") + 1));
    };
    lector.onerror = () => rechazar(new Error("No se pudo leer el JPEG."));
    lector.readAsDataURL(blob);
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

export type OpcionesExportar = {
  piezaId: string;
  titulo: string;
  formato: FormatoId;
  slides: Slide[];
  /** true = además de archivar en el bucket, descarga cada JPG al computador. */
  descargar: boolean;
  onProgreso?: (hechas: number, total: number) => void;
};

/**
 * Renderiza, convierte y archiva cada slide; al final deja constancia en la pieza con la
 * huella de lo exportado. Devuelve los avisos no fatales (un slide que no se pudo
 * archivar) y lanza solo si no se pudo ni dibujar.
 */
export async function exportarPieza(o: OpcionesExportar): Promise<{ rutas: string[]; avisos: string[] }> {
  const f = FORMATOS[o.formato];
  const rutas: string[] = [];
  const avisos: string[] = [];

  for (let i = 0; i < o.slides.length; i++) {
    // Tamaño real, no el del preview: esto es el archivo que va a Instagram.
    const jpeg = await pngAJpeg({ slide: o.slides[i], formato: o.formato }, f.w, f.h);
    if (o.descargar) descargar(jpeg, nombreArchivo(o.titulo, i));

    // El archivado va por el servidor: la subida desde el navegador fallaba en silencio
    // y el bucket quedaba vacío. Ver la cabecera de exportActions.ts.
    const b64 = await blobABase64(jpeg);
    const r = await archivarSlide(o.piezaId, i, b64);
    if ("error" in r && r.error) avisos.push(r.error);
    else if ("ruta" in r && r.ruta) rutas.push(r.ruta);

    o.onProgreso?.(i + 1, o.slides.length);
  }

  if (rutas.length) {
    // La huella solo vale si TODOS los slides quedaron archivados: con uno de menos, la
    // publicación diría "hay N slides pero N-1 imágenes" y no saldría, que es lo correcto.
    const completa = rutas.length === o.slides.length;
    const r = await registrarExport(o.piezaId, rutas, completa ? hashPieza(o.slides, o.formato) : undefined);
    if ("error" in r && r.error) avisos.push(r.error);
  }
  return { rutas, avisos };
}
