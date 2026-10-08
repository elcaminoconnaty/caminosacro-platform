/**
 * Noches extra en Santiago y tours contratados: lo que alarga el itinerario de una
 * cotización más allá de sus etapas.
 *
 * Salen de las líneas opcionales. Vivía dentro del render del PDF de la cotización; se
 * sacó acá cuando la carta de bienvenida también tuvo que dibujar el itinerario, para que
 * los dos documentos cuenten los mismos días.
 */
import { leerFilasHabitacion } from "@/lib/quotes/rooms";

export type ExtrasItinerario = {
  extraNights: number;
  extraNightTipo: "pension" | "hotel";
  tours: string[];
};

type LineaOpcional = { description: string; quantity: number | string; reference_id: string | null };

/**
 * Cuántas habitaciones ocupa el grupo. La línea de noche extra se cobra como
 * "cantidad = habitaciones × noches", así que de acá sale cuántas noches son.
 */
export function habitacionesDelGrupo(quote: { rooms_json?: unknown; modality?: string | null; people?: number | null }): number {
  const people = Math.max(1, Number(quote.people) || 1);

  const aMedida = leerFilasHabitacion(quote.rooms_json);
  if (aMedida.length > 0) return Math.max(1, aMedida.reduce((a, r) => a + r.habitaciones, 0));

  const rooms = (quote.rooms_json ?? null) as { dobles?: number; individuales?: number } | null;
  const dobles = Number(rooms?.dobles) || 0;
  const individuales = Number(rooms?.individuales) || 0;
  if (dobles > 0 && individuales > 0) return dobles + individuales;

  // Mismo criterio que el `chosenSlug` del PDF: tipo de alojamiento y UNA sola habitación.
  const m = (quote.modality || "").toLowerCase();
  const tipo = m.includes("hotel") || m.includes("pensión") || m.includes("pension");
  const doble = m.includes("doble");
  const single = m.includes("single") || m.includes("individual");
  if (tipo && single && !doble) return people;
  if (tipo && doble && !single) return Math.ceil(people / 2);
  return 1;
}

/** Tipo de alojamiento de la cotización, para rotular la noche incluida en el precio. */
export function tipoAlojamientoDe(quote: { rooms_json?: unknown; modality?: string | null }): "pension" | "hotel" {
  const tipo = (quote.rooms_json as { tipo?: string } | null)?.tipo;
  if (tipo === "hotel" || tipo === "pension") return tipo;
  return /hotel/i.test(quote.modality || "") ? "hotel" : "pension";
}

/**
 * Las líneas opcionales + la categoría de cada servicio → los extras del itinerario.
 *
 * `incluidas` son las noches extra que ya vienen dentro del precio de la ruta
 * (`quotes.noches_extra_incluidas`, migración 0058): alargan el itinerario como una noche
 * contratada, pero no tienen línea ni se cobran.
 */
export function extrasDeLineas(
  lineas: LineaOpcional[],
  categoriaPorId: Map<string, string>,
  habitaciones: number,
  personas?: number | null,
  incluidas?: { noches: number | null | undefined; tipo: "pension" | "hotel" },
): ExtrasItinerario | null {
  const habs = Math.max(1, habitaciones);
  const pers = Math.max(1, Number(personas) || 1);
  let extraNights = 0;
  let extraNightTipo: "pension" | "hotel" = "pension";
  const tours: string[] = [];
  for (const l of lineas) {
    const cat = l.reference_id ? categoriaPorId.get(l.reference_id) : undefined;
    if (cat === "noche_extra") {
      // Desde 2026-09-29 Pilgrim tarifa la noche extra por persona ("por persona y
      // noche"): la cantidad es personas × noches. Las líneas viejas ("por noche") se
      // cobraban por habitación.
      const divisor = /persona/i.test(l.description) ? pers : habs;
      extraNights += Math.round((Number(l.quantity) || 0) / divisor);
      if (/hotel|casa rural/i.test(l.description)) extraNightTipo = "hotel";
    } else if (cat === "tour") {
      // El nombre viene como "Tour X (por persona)"; quito la unidad entre paréntesis.
      tours.push(l.description.replace(/\s*\([^)]*\)\s*$/, "").trim());
    }
  }
  const nochesIncluidas = Math.max(0, Math.round(Number(incluidas?.noches) || 0));
  if (nochesIncluidas > 0) {
    if (extraNights === 0 && incluidas) extraNightTipo = incluidas.tipo;
    extraNights += nochesIncluidas;
  }
  return extraNights > 0 || tours.length > 0 ? { extraNights, extraNightTipo, tours } : null;
}
