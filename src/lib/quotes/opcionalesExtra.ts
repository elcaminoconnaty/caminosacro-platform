/**
 * Opcionales propios de UNA cotización que se ofrecen pero NO suman al total
 * (`condiciones_json.opcionales_extra`). El PDF los lista en "Servicios opcionales" bajo
 * "Servicios para este grupo". Caso típico: el vehículo de apoyo de un grupo, cuando el
 * cliente quiere ver la inversión sin él.
 *
 * Distinto de las líneas "a la medida" (`quote_lines` sin `reference_id`): esas SÍ suman.
 */
export type OpcionalExtra = { nombre: string; unidad: string; precio: number };

export const MAX_OPCIONALES_EXTRA = 10;

/** Lee y sanea la lista guardada en `condiciones_json`. */
export function opcionalesExtraDe(condiciones: unknown): OpcionalExtra[] {
  const lista = (condiciones as { opcionales_extra?: unknown } | null)?.opcionales_extra;
  if (!Array.isArray(lista)) return [];
  return lista
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { nombre: String(o.nombre ?? "").trim(), unidad: String(o.unidad ?? "").trim(), precio: Number(o.precio) || 0 };
    })
    .filter((o) => o.nombre);
}
