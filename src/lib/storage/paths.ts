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
 *   comercial-docs/2026/CS-2026-034/Documento-Viaje-CS-2026-034.pdf
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

/** El recibo vive en la carpeta de SU cotización, aunque el archivo se llame REC-... */
export function rutaRecibo(
  receiptNumber: string,
  code: string,
  cliente: string | null,
  ruta: string | null,
): string {
  return `comercial-receipts/${carpetaCotizacion(code)}/${buildPdfFilename(receiptNumber, cliente, ruta)}`;
}

// ---------------------------------------------------------------------------
// Documentación de viaje.
//
// Los cuatro documentos que recibe el peregrino viven juntos en la carpeta de su
// cotización, igual que todo lo demás:
//
//   comercial-docs/2026/CS-2026-034/Documento-Viaje-CS-2026-034.pdf
//   comercial-docs/2026/CS-2026-034/Seguro-Viaje-CS-2026-034.pdf
//   comercial-docs/2026/CS-2026-034/Etiqueta-Equipaje-CS-2026-034.pdf
//
// La Asistencia en Viaje es la excepción: es genérica (no menciona al viajero ni la
// reserva), así que hay UNA sola y vive fuera del árbol de cotizaciones. Así, corregir
// un teléfono vale también para los viajes que ya se enviaron.
// ---------------------------------------------------------------------------

/** Documento de Viaje generado por la plataforma. */
export function rutaDocViaje(code: string, cliente: string | null, ruta: string | null): string {
  return `comercial-docs/${carpetaCotizacion(code)}/${buildPdfFilename(`Documento-Viaje-${code}`, cliente, ruta)}`;
}

/** Póliza del seguro: la emite la aseguradora, la sube Nico. */
export function rutaSeguroViaje(code: string): string {
  return `comercial-docs/${carpetaCotizacion(code)}/Seguro-Viaje-${code}.pdf`;
}

/** Etiqueta del transportista de equipaje: la emite el transportista, la sube Nico. */
export function rutaEtiquetaEquipaje(code: string): string {
  return `comercial-docs/${carpetaCotizacion(code)}/Etiqueta-Equipaje-${code}.pdf`;
}

/**
 * Un documento que nos mandó Pilgrim, en la subcarpeta `pilgrim/` del expediente.
 *
 * Lleva marca de tiempo delante porque acá los nombres se repiten de verdad: Pilgrim
 * manda "Documento_Viaje_A47397.pdf" al confirmar y otra vez corregido dos semanas
 * después, y el segundo no puede pisar al primero — justo esos dos son los que hay que
 * poder comparar.
 */
export function rutaDocumentoPilgrim(code: string, nombreArchivo: string, marca = Date.now()): string {
  const limpio = nombreArchivo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-70) || "documento";
  return `comercial-docs/${carpetaCotizacion(code)}/pilgrim/${marca}-${limpio}`;
}

/** La única Asistencia en Viaje. Ruta fija a propósito: se regenera encima. */
export function rutaAsistencia(): string {
  return "comercial-docs/generico/Asistencia-en-Viaje-Camino-Sacro.pdf";
}

/**
 * Foto de un hotel del catálogo. Van por slug y no por id para que la carpeta se pueda
 * leer desde el explorador de Supabase sin cruzar la tabla.
 *
 * OJO: el bucket es `comercial-hotel-fotos`, no `comercial-hotels`. Ese último es el del
 * PDF viejo de tabla de hoteles y ya no se escribe.
 */
export function rutaFotoHotel(slug: string, posicion: number, ext: string): string {
  const limpio = (ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `comercial-hotel-fotos/${slug}/${posicion + 1}-${Date.now()}.${limpio}`;
}

/**
 * Un viaje de grupo tiene un contrato POR VIAJERO, y todos viven en la carpeta de la
 * misma cotización: sin el sufijo de posición se pisarían el PDF entre ellos.
 * El viajero 1 (el titular) conserva el nombre de siempre, así que los contratos
 * que ya existían siguen apuntando a su archivo.
 */
export function rutaContrato(code: string, firmado = false, posicion?: number | null): string {
  const sufijo = posicion && posicion > 1 ? `-${posicion}` : "";
  const archivo = firmado ? `Contrato-${code}${sufijo}-firmado.pdf` : `Contrato-${code}${sufijo}.pdf`;
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

// ---------------------------------------------------------------------------
// Estudio de Contenido.
//
// Estas piezas NO son de un expediente de cotización, así que no siguen el patrón
// {año}/{código}: se organizan por año y por id de pieza.
//
//   contenido-piezas/2026/<pieza_id>/slide-01.jpg
//   contenido-fotos/2026/08/<marca>-<nombre>.jpg
//
// ⚠️ Nunca escribir en el bucket `fotos-instagram` desde el estudio: esa es la cola del
// bot que publica solo a las 7pm (ver la cabecera de 0023_contenido_estudio.sql).
// ---------------------------------------------------------------------------

/** JPG exportado de un slide. `orden` es base 0; el archivo se numera desde 1. */
export function rutaPiezaJpg(piezaId: string, orden: number, anio = new Date().getFullYear()): string {
  const n = String(orden + 1).padStart(2, "0");
  return `contenido-piezas/${anio}/${piezaId}/slide-${n}.jpg`;
}

/** Foto subida desde el editor. Se le antepone una marca de tiempo para no pisar nombres repetidos. */
export function rutaFotoContenido(nombreArchivo: string, marca = Date.now()): string {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const limpio = nombreArchivo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-60);
  return `contenido-fotos/${anio}/${mes}/${marca}-${limpio}`;
}
