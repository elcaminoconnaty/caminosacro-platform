/**
 * Único lugar que decide DÓNDE vive cada documento en Supabase Storage.
 *
 * Estructura: cada bucket se organiza por año y código de cotización, de modo
 * que todo lo de un cliente queda junto y navegable desde el explorador de
 * Supabase:
 *
 *   comercial-quotes/2026/CS-2026-034/CS-2026-034_Amalia_Matallana_Frances.pdf
 *   comercial-contracts/2026/CS-2026-034/Contrato-CS-2026-034.pdf
 *   comercial-contracts/2026/CS-2026-034/Contrato-CS-2026-034-firmado.pdf
 *   comercial-passports/2026/CS-2026-034/Pasaporte-CS-2026-034-1784908489714.jpg
 *   comercial-receipts/2026/CS-2026-034/REC-CS-2026-034-1_Amalia.pdf
 *   comercial-hotels/2026/CS-2026-034/CS-2026-034_hoteles_Amalia.pdf
 *
 * Las rutas se guardan en la BD SIEMPRE con el bucket adelante ("bucket/ruta/archivo"),
 * que es lo que esperan getSignedUrl / getResourceUrl / removeStoragePath.
 *
 * Los lectores parten la ruta con split("/") y rehacen el resto con join("/"),
 * así que soportan subcarpetas sin cambios.
 *
 * Este módulo no importa nada del runtime de Next (ni "server-only"): también lo
 * usa scripts/reorganize_storage.ts, que corre con tsx fuera de la app.
 */

function sanitizeFilenamePart(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Nombre de archivo determinista: "{code}_{cliente}_{ruta}.pdf", sin tildes ni signos. */
export function buildPdfFilename(code: string, clientName: string | null, routeName: string | null): string {
  const parts = [code, sanitizeFilenamePart(clientName), sanitizeFilenamePart(routeName)].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}

/** "CS-2026-034" → "2026". Si el código no trae año, cae en el año actual. */
export function anioDeCodigo(code: string): string {
  const m = /(\d{4})/.exec(code || "");
  return m ? m[1] : String(new Date().getFullYear());
}

/** Carpeta común de todos los documentos de una cotización: "2026/CS-2026-034". */
export function carpetaCotizacion(code: string): string {
  return `${anioDeCodigo(code)}/${code}`;
}

export function rutaCotizacion(code: string, cliente: string | null, ruta: string | null): string {
  return `comercial-quotes/${carpetaCotizacion(code)}/${buildPdfFilename(code, cliente, ruta)}`;
}

export function rutaHoteles(code: string, cliente: string | null, ruta: string | null): string {
  return `comercial-hotels/${carpetaCotizacion(code)}/${buildPdfFilename(`${code}_hoteles`, cliente, ruta)}`;
}

/** El recibo vive en la carpeta de SU cotización, aunque el archivo se llame REC-... */
export function rutaRecibo(
  receiptNumber: string,
  code: string,
  cliente: string | null,
  ruta: string | null,
): string {
  return `comercial-receipts/${carpetaCotizacion(code)}/${buildPdfFilename(receiptNumber, cliente, ruta)}`;
}

export function rutaContrato(code: string, firmado = false): string {
  const archivo = firmado ? `Contrato-${code}-firmado.pdf` : `Contrato-${code}.pdf`;
  return `comercial-contracts/${carpetaCotizacion(code)}/${archivo}`;
}

export function rutaPasaporte(code: string, ext: string, marca = Date.now()): string {
  return `comercial-passports/${carpetaCotizacion(code)}/Pasaporte-${code}-${marca}.${ext}`;
}

/** Quita el prefijo del bucket para las llamadas de Storage, que reciben la ruta relativa. */
export function sinBucket(storagePath: string): string {
  const [, ...rest] = storagePath.split("/");
  return rest.join("/");
}
