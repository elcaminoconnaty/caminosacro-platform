/**
 * Habitaciones a medida: el reparto REAL de un grupo, cuando no es el automático.
 *
 * El reparto automático (pares en doble, el impar en individual) cubre la mayoría de las
 * cotizaciones y lo resuelve `tarifar.ts`. Pero un grupo de verdad llega repartido: cuatro
 * en dos dobles y tres en una triple, o dos dobles en hotel y una cuádruple en pensión.
 * Ahí cada tipo de habitación tiene SU precio de venta y SU costo Pilgrim, y hasta ahora
 * eso no tenía dónde escribirse: la modalidad "Doble + Triple" era texto libre y la base
 * se tecleaba a ojo, sin que quedara registro de de dónde salía la cifra.
 *
 * Este módulo define esas filas y su aritmética. Vive fuera de "server-only" a propósito:
 * lo usan el asistente y el editor (componentes de cliente) además del PDF.
 *
 * Dónde se guarda: `comercial.quotes.rooms_json.filas`. El resto de `rooms_json` (tipo,
 * dobles, individuales, tarifa_doble, tarifa_single) es el formato viejo del reparto
 * automático y se conserva intacto — quien lea `filas` manda, quien no, sigue viendo lo
 * de siempre. Ver `roomsJsonAMedida()` para por qué las claves viejas van en cero.
 */

export type TipoAlojamiento = "pension" | "hotel";

/** Las cuatro habitaciones que Pilgrim tarifa. `cap` es cuánta gente duerme en cada una. */
export const ROOM_KINDS = [
  { key: "single", label: "Individual", plural: "individuales", cap: 1 },
  { key: "doble", label: "Doble", plural: "dobles", cap: 2 },
  { key: "triple", label: "Triple", plural: "triples", cap: 3 },
  { key: "cuadruple", label: "Cuádruple", plural: "cuádruples", cap: 4 },
] as const;

export type RoomKind = (typeof ROOM_KINDS)[number]["key"];

export const ROOM_KIND_KEYS = ROOM_KINDS.map((r) => r.key) as readonly RoomKind[];

/**
 * Cuántas filas caben en una cotización. El tope no es de base de datos sino del PDF: son
 * las tarjetas de precio de la primera página, y a partir de la quinta no queda ancho para
 * que el número siga siendo legible.
 */
export const MAX_ROOM_ROWS = 4;

/** Una fila del reparto: un tipo de habitación, cuántas van, y sus dos precios POR PERSONA. */
export type RoomRow = {
  tipo: TipoAlojamiento;
  hab: RoomKind;
  /** Cuántas habitaciones de este tipo. Las personas salen de multiplicar por la capacidad. */
  habitaciones: number;
  /** Precio de venta por persona (el que sale en el PDF). */
  precio_cs: number;
  /** Costo Pilgrim por persona (interno: nunca se dibuja en el PDF del cliente). */
  precio_pilgrim: number;
};

function roomKind(v: unknown): RoomKind | null {
  const s = String(v ?? "").toLowerCase();
  // "individual" y "single" son la misma habitación con dos nombres en la casa.
  if (s === "individual") return "single";
  return (ROOM_KIND_KEYS as readonly string[]).includes(s) ? (s as RoomKind) : null;
}

export function roomCapacity(hab: RoomKind): number {
  return ROOM_KINDS.find((r) => r.key === hab)?.cap ?? 1;
}

export function tipoLabel(tipo: TipoAlojamiento): string {
  return tipo === "hotel" ? "Hotel" : "Pensión";
}

/** "Pensión doble". Es la etiqueta de la fila en pantalla y la base de la del PDF. */
export function roomRowLabel(row: Pick<RoomRow, "tipo" | "hab">): string {
  const kind = ROOM_KINDS.find((r) => r.key === row.hab);
  return `${tipoLabel(row.tipo)} ${(kind?.label ?? "").toLowerCase()}`;
}

/**
 * Slug de la fila, con la misma nomenclatura de `comercial.pricing.modality`
 * (`pension_doble`, `hotel_single`) extendida a las habitaciones que el catálogo todavía
 * no tarifa (`pension_triple`, `hotel_cuadruple`). Se usa como clave de `price_blocks`.
 */
export function roomRowSlug(row: Pick<RoomRow, "tipo" | "hab">): string {
  return `${row.tipo}_${row.hab}`;
}

export function personasDeFila(row: Pick<RoomRow, "hab" | "habitaciones">): number {
  return Math.max(0, Math.round(row.habitaciones) || 0) * roomCapacity(row.hab);
}

/**
 * Lee `rooms_json.filas` de la base sin confiar en nada: es jsonb, lo escribieron dos
 * pantallas distintas y una cotización vieja no lo tiene. Devuelve `[]` cuando no hay
 * reparto a medida, que es la señal de "seguí con el comportamiento de siempre".
 */
export function leerFilasHabitacion(roomsJson: unknown): RoomRow[] {
  const filas = (roomsJson as { filas?: unknown } | null)?.filas;
  if (!Array.isArray(filas)) return [];
  const out: RoomRow[] = [];
  for (const f of filas.slice(0, MAX_ROOM_ROWS)) {
    if (!f || typeof f !== "object") continue;
    const raw = f as Record<string, unknown>;
    const hab = roomKind(raw.hab);
    if (!hab) continue;
    const habitaciones = Math.max(0, Math.round(Number(raw.habitaciones) || 0));
    if (habitaciones <= 0) continue;
    out.push({
      tipo: String(raw.tipo) === "hotel" ? "hotel" : "pension",
      hab,
      habitaciones,
      precio_cs: Number(raw.precio_cs) || 0,
      precio_pilgrim: Number(raw.precio_pilgrim) || 0,
    });
  }
  return out;
}

export type TotalesHabitacion = {
  habitaciones: number;
  personas: number;
  /** Base de venta del grupo, sin suplemento de temporada ni opcionales. */
  baseEur: number;
  /** Costo Pilgrim del grupo, mismo alcance que `baseEur`. */
  costBaseEur: number;
};

/** La plata del reparto: personas × precio por persona, fila por fila. */
export function totalesHabitacion(rows: RoomRow[]): TotalesHabitacion {
  let habitaciones = 0;
  let personas = 0;
  let baseEur = 0;
  let costBaseEur = 0;
  for (const r of rows) {
    const p = personasDeFila(r);
    habitaciones += Math.max(0, Math.round(r.habitaciones) || 0);
    personas += p;
    baseEur += p * (Number(r.precio_cs) || 0);
    costBaseEur += p * (Number(r.precio_pilgrim) || 0);
  }
  return { habitaciones, personas, baseEur, costBaseEur };
}

/**
 * Etiqueta de alojamiento del reparto: "Pensión · 2 dobles + 1 triple".
 *
 * Va a `quotes.modality`, que es texto libre y lo leen el PDF, los correos y el contrato.
 * Si todas las filas son del mismo tipo, el tipo va una vez adelante; si se mezclan pensión
 * y hotel, cada bloque lo dice ("2 dobles pensión + 1 triple hotel"), porque ahí el tipo es
 * parte de lo que se cotizó y no un detalle.
 */
export function etiquetaHabitaciones(rows: RoomRow[]): string {
  const vivas = rows.filter((r) => personasDeFila(r) > 0);
  if (vivas.length === 0) return "Personalizada";
  const unSoloTipo = vivas.every((r) => r.tipo === vivas[0].tipo);
  const partes = vivas.map((r) => {
    const kind = ROOM_KINDS.find((k) => k.key === r.hab)!;
    const n = Math.round(r.habitaciones);
    const nombre = (n === 1 ? kind.label : kind.plural).toLowerCase();
    return unSoloTipo ? `${n} ${nombre}` : `${n} ${nombre} ${tipoLabel(r.tipo).toLowerCase()}`;
  });
  return unSoloTipo
    ? `${tipoLabel(vivas[0].tipo)} · ${partes.join(" + ")}`
    : `Mixto · ${partes.join(" + ")}`;
}

/**
 * El `rooms_json` que se guarda cuando el reparto es a medida.
 *
 * Las claves viejas (`dobles`, `individuales`, `tarifa_doble`, `tarifa_single`) van en cero
 * a propósito: `pdf.ts` las usa para el resumen mixto del cotizador web, y llenarlas con
 * una aproximación del reparto a medida haría que el PDF dibujara DOS desgloses distintos
 * de la misma plata. `filas` es la fuente de verdad y quien la ve ignora las otras.
 */
export function roomsJsonAMedida(rows: RoomRow[]) {
  const vivas = rows.filter((r) => personasDeFila(r) > 0);
  return {
    modo: "a_medida" as const,
    tipo: vivas[0]?.tipo ?? "pension",
    dobles: 0,
    individuales: 0,
    tarifa_doble: 0,
    tarifa_single: 0,
    filas: vivas.map((r) => ({
      tipo: r.tipo,
      hab: r.hab,
      habitaciones: Math.round(r.habitaciones),
      precio_cs: Number(r.precio_cs) || 0,
      precio_pilgrim: Number(r.precio_pilgrim) || 0,
    })),
  };
}

/** Las tarjetas del PDF: un precio de venta por persona por cada tipo de habitación. */
export function priceBlocksDeFilas(rows: RoomRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (personasDeFila(r) <= 0 || (Number(r.precio_cs) || 0) <= 0) continue;
    // Dos filas del mismo tipo de habitación (raro pero posible: dos precios distintos
    // negociados) colapsan en una sola tarjeta; gana la más cara, que es la que no se
    // puede quedar corta frente al cliente.
    const slug = roomRowSlug(r);
    out[slug] = Math.max(out[slug] ?? 0, Number(r.precio_cs) || 0);
  }
  return out;
}

/** Valor de `quotes.modality` que enciende el modo a medida en el asistente y el editor. */
export const MODALIDAD_A_MEDIDA = "Habitaciones a medida";

/** Una fila vacía para estrenar el panel. */
export function filaVacia(tipo: TipoAlojamiento = "pension", hab: RoomKind = "doble"): RoomRow {
  return { tipo, hab, habitaciones: 1, precio_cs: 0, precio_pilgrim: 0 };
}
