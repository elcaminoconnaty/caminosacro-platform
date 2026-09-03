/**
 * Servicio opcional a la medida de UNA cotización: la forma del dato y su validación.
 *
 * Vive aparte de `optionals.ts` (que es "server-only") porque el formulario del expediente
 * es un componente de cliente y necesita el mismo tope de caracteres y las mismas reglas.
 * Una segunda copia de "cuánto texto cabe" terminaría dejando pasar en pantalla algo que
 * el servidor rechaza, o al revés.
 */

/**
 * Tope de la descripción. No es un límite de la base de datos (la columna es `text`): es
 * el ancho de la columna "Concepto" del resumen del PDF. Más allá de esto el texto se
 * parte en tres renglones y desalinea la tabla del documento que ve el cliente.
 */
export const MAX_DESC_OPCIONAL = 70;

export type OpcionalLibre = {
  descripcion: string;
  cantidad: number;
  /** Precio de venta por unidad. Es el único que ve el cliente. */
  precioCs: number;
  /** Costo Pilgrim por unidad. Solo para el seguimiento y el correo a Pilgrim. */
  precioPilgrim: number;
};

/** Normaliza y valida. Devuelve el dato listo para escribir, o el mensaje para la pantalla. */
export function validarOpcionalLibre(
  datos: OpcionalLibre,
): { error: string } | { ok: OpcionalLibre } {
  const descripcion = datos.descripcion.trim().replace(/\s+/g, " ");
  if (!descripcion) return { error: "El servicio necesita una descripción." };
  if (descripcion.length > MAX_DESC_OPCIONAL) {
    return { error: `La descripción no puede pasar de ${MAX_DESC_OPCIONAL} caracteres (va en el PDF).` };
  }
  const cantidad = Math.max(1, Math.round(datos.cantidad) || 1);
  const precioCs = Number(datos.precioCs) || 0;
  const precioPilgrim = Number(datos.precioPilgrim) || 0;
  if (precioCs < 0 || precioPilgrim < 0) return { error: "Los precios no pueden ser negativos." };
  return { ok: { descripcion, cantidad, precioCs, precioPilgrim } };
}
