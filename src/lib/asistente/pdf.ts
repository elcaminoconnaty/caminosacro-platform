import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Convierte un archivo (PDF de Storage o adjunto de un correo) en algo que el modelo pueda
 * leer: texto si es PDF o texto, imagen si es una foto (pasaportes, comprobantes por
 * pantallazo). Lo demás (Excel, Word) se describe y se avisa que no se puede abrir.
 */

export type Contenido =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

const MAX_TEXTO = 60_000;
const MAX_IMAGEN = 4_500_000; // bytes: por encima, el modelo la rechaza

const IMAGENES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function tipoPorNombre(nombre: string): string | null {
  const ext = nombre.toLowerCase().split(".").pop();
  return (
    { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", txt: "text/plain", csv: "text/csv", html: "text/html" } as Record<string, string>
  )[ext ?? ""] ?? null;
}

export async function leerArchivo(bytes: Uint8Array, nombre: string, mime?: string | null): Promise<Contenido[]> {
  const tipo = (mime && mime !== "application/octet-stream" ? mime : tipoPorNombre(nombre)) ?? "desconocido";
  const kb = Math.round(bytes.byteLength / 1024);

  if (tipo === "application/pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      const paginas = (text as string[]).map((t, i) => `--- Página ${i + 1} ---\n${t.trim()}`).join("\n\n");
      const util = paginas.replace(/--- Página \d+ ---/g, "").trim();
      if (!util) {
        return [{ type: "text", text: `«${nombre}» (${totalPages} págs., ${kb} KB) es un PDF escaneado sin texto seleccionable: no lo puedo leer por dentro. Si es importante, que lo abran en la plataforma.` }];
      }
      const recorte = paginas.length > MAX_TEXTO ? paginas.slice(0, MAX_TEXTO) + "\n… [recortado]" : paginas;
      return [{ type: "text", text: `«${nombre}» — ${totalPages} página(s)\n\n${recorte}` }];
    } catch (e) {
      return [{ type: "text", text: `No pude abrir el PDF «${nombre}»: ${(e as Error).message}` }];
    }
  }

  if (IMAGENES.includes(tipo)) {
    if (bytes.byteLength > MAX_IMAGEN) return [{ type: "text", text: `La imagen «${nombre}» pesa ${kb} KB, demasiado para leerla aquí.` }];
    return [
      { type: "text", text: `Imagen «${nombre}» (${kb} KB):` },
      { type: "image", data: Buffer.from(bytes).toString("base64"), mimeType: tipo },
    ];
  }

  if (tipo.startsWith("text/")) {
    let t = new TextDecoder().decode(bytes);
    if (tipo === "text/html") t = htmlATexto(t);
    return [{ type: "text", text: `«${nombre}»\n\n${t.slice(0, MAX_TEXTO)}` }];
  }

  return [{ type: "text", text: `«${nombre}» es de tipo ${tipo} (${kb} KB): ese formato no lo puedo leer por dentro, solo PDF, imágenes y texto.` }];
}

/** HTML de un correo → texto legible (sin estilos, scripts ni etiquetas). */
export function htmlATexto(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
