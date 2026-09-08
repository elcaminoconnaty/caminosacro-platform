/**
 * Precio POR PERSONA: la única forma de teclear plata a mano en una cotización.
 *
 * Pilgrim cotiza siempre por pasajero, y Nico pone su precio también por pasajero. Hasta
 * ahora el asistente y el editor tenían dos campos —"Base ruta + alojamiento" y "Costo
 * Pilgrim"— que eran TOTALES DEL GRUPO y se tecleaban a mano cuando el catálogo no
 * alcanzaba. Un 520 tecleado ahí para cuatro personas quedaba como 520 € por todo el
 * grupo, y nadie que abriera el expediente después podía saber si esa cifra era por
 * persona o por grupo.
 *
 * Desde acá, la regla es una sola y vale en las dos pantallas:
 *
 *   1. Lo que se teclea es POR PERSONA, siempre. La base del grupo y el costo Pilgrim se
 *      calculan solos: personas de cada habitación × precio por persona.
 *   2. Cuando el precio no salió del catálogo, la cotización guarda una NOTA interna
 *      (`quotes.manual_price_note`) que dice, en palabras, qué precio por persona se puso y
 *      cómo se llegó al total. Es la misma nota que Pilgrim pone en sus cotizaciones para
 *      que los demás comerciales lo sepan.
 *
 * Este módulo vive fuera de "server-only" a propósito: lo usan el asistente y el editor
 * (componentes de cliente) y las actions que guardan.
 */

import { MODALITY_LABELS, type ModalitySlug } from "@/lib/pricing/year";
import { personasDeFila, roomRowLabel, type RoomRow } from "@/lib/quotes/rooms";

export type TipoAlojamiento = "pension" | "hotel";

/** Un renglón del precio por persona: qué habitación, cuánta gente y los dos precios. */
export type RenglonPersona = {
  /** "Pensión doble", "Hotel individual", "Pensión triple"… */
  etiqueta: string;
  personas: number;
  /** Mi precio por persona (el que ve el cliente). */
  cs: number;
  /** Costo Pilgrim por persona (interno). 0 = todavía sin dato. */
  pilgrim: number;
};

export type TotalesGrupo = {
  personas: number;
  /** Ruta + alojamiento, sin suplemento de temporada ni opcionales. */
  baseEur: number;
  costBaseEur: number;
};

/** La plata del grupo: personas × precio por persona, renglón por renglón. */
export function totalesDeRenglones(renglones: RenglonPersona[]): TotalesGrupo {
  let personas = 0;
  let baseEur = 0;
  let costBaseEur = 0;
  for (const r of renglones) {
    const p = Math.max(0, Math.round(r.personas) || 0);
    personas += p;
    baseEur += p * (Number(r.cs) || 0);
    costBaseEur += p * (Number(r.pilgrim) || 0);
  }
  return { personas, baseEur: redondear(baseEur), costBaseEur: redondear(costBaseEur) };
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Reparto automático (el de `tarifar.ts` y el cotizador web): pares en doble y el impar
 * en individual, salvo que todo el grupo vaya en individual.
 */
export function repartoAutomatico(personas: number, todosIndividuales = false): { dobles: number; individuales: number } {
  const gente = Math.max(0, Math.round(personas) || 0);
  const dobles = todosIndividuales ? 0 : Math.floor(gente / 2);
  return { dobles, individuales: gente - dobles * 2 };
}

/** Etiqueta que refleja el reparto REAL de habitaciones, no la modalidad pedida. */
export function etiquetaReparto(tipo: TipoAlojamiento, dobles: number, individuales: number): string {
  const tipoNombre = tipo === "hotel" ? "Hotel" : "Pensión";
  if (individuales === 0) return `${tipoNombre}, habitación doble`;
  if (dobles === 0) return `${tipoNombre}, habitación individual`;
  return `${tipoNombre} · ${dobles} ${dobles === 1 ? "doble" : "dobles"} + ${individuales} individual${individuales === 1 ? "" : "es"}`;
}

/** Slugs que un reparto automático necesita tarifados, en orden doble → individual. */
export function slotsDelReparto(tipo: TipoAlojamiento, dobles: number, individuales: number): ModalitySlug[] {
  const out: ModalitySlug[] = [];
  if (dobles > 0) out.push(`${tipo}_doble`);
  if (individuales > 0) out.push(`${tipo}_single`);
  return out;
}

/**
 * Los renglones del reparto automático, leyendo los precios por persona tecleados (o
 * autocargados) por slug. Un slot sin precio de venta sale con `cs: 0`: quien llama decide
 * si eso es un error (al guardar) o solo un aviso (mientras se teclea).
 */
export function renglonesDelReparto(
  tipo: TipoAlojamiento,
  dobles: number,
  individuales: number,
  cs: Record<string, number | string | null | undefined>,
  pilgrim: Record<string, number | string | null | undefined>,
): RenglonPersona[] {
  const num = (v: unknown) => {
    const n = Number(String(v ?? "").trim().replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const out: RenglonPersona[] = [];
  if (dobles > 0) {
    const slug: ModalitySlug = `${tipo}_doble`;
    out.push({ etiqueta: MODALITY_LABELS[slug], personas: dobles * 2, cs: num(cs[slug]), pilgrim: num(pilgrim[slug]) });
  }
  if (individuales > 0) {
    const slug: ModalitySlug = `${tipo}_single`;
    out.push({ etiqueta: MODALITY_LABELS[slug], personas: individuales, cs: num(cs[slug]), pilgrim: num(pilgrim[slug]) });
  }
  return out;
}

/** Los renglones de un reparto a medida (ver @/lib/quotes/rooms). */
export function renglonesDeFilas(filas: RoomRow[]): RenglonPersona[] {
  return filas
    .filter((f) => personasDeFila(f) > 0)
    .map((f) => ({
      etiqueta: roomRowLabel(f),
      personas: personasDeFila(f),
      cs: Number(f.precio_cs) || 0,
      pilgrim: Number(f.precio_pilgrim) || 0,
    }));
}

/** Un solo precio para todo el grupo (alojamiento de texto libre: "Doble + Triple", "Personalizada"). */
export function renglonLibre(etiqueta: string, personas: number, cs: number, pilgrim: number): RenglonPersona[] {
  return [{ etiqueta: etiqueta || "Alojamiento", personas, cs: Number(cs) || 0, pilgrim: Number(pilgrim) || 0 }];
}

/** "520,00 €" — con decimales siempre, porque acá se cuadra plata. */
export function eurPP(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

export type OrigenPrecio =
  /** Reparto automático con precios tecleados (o corregidos) a mano. */
  | "a_mano"
  /** Reparto de habitaciones a medida: cada habitación con su precio. */
  | "a_medida"
  /** Alojamiento de texto libre con un solo precio por persona para todo el grupo. */
  | "libre";

/**
 * La nota interna que se guarda en `quotes.manual_price_note`.
 *
 * Se escribe en palabras y con las cifras completas a propósito: la lee alguien que abre
 * el expediente meses después (o BayMax, que la devuelve tal cual), y tiene que entender
 * sin abrir nada más que el precio que está viendo es POR PERSONA y cómo se llegó a la base.
 * El suplemento de temporada y los opcionales quedan fuera porque se suman aparte y ya
 * salen desglosados en el resumen.
 */
export function notaPrecioPorPersona(opts: { renglones: RenglonPersona[]; origen: OrigenPrecio; year: number }): string {
  const vivos = opts.renglones.filter((r) => r.personas > 0 && r.cs > 0);
  const tot = totalesDeRenglones(vivos);
  const cabeza =
    opts.origen === "a_medida"
      ? "PRECIO POR PERSONA — reparto de habitaciones a medida, tecleado a mano."
      : `PRECIO PUESTO A MANO, POR PERSONA — no sale del catálogo ${opts.year}.`;
  const renglones = vivos.map((r) => {
    const pilgrim = r.pilgrim > 0 ? `Pilgrim ${eurPP(r.pilgrim)}/persona` : "Pilgrim sin dato";
    return `${r.etiqueta}: ${eurPP(r.cs)}/persona (${pilgrim}) × ${r.personas} ${r.personas === 1 ? "persona" : "personas"}`;
  });
  const cierre = `Base del grupo ${eurPP(tot.baseEur)} · costo Pilgrim ${eurPP(tot.costBaseEur)} (${tot.personas} ${tot.personas === 1 ? "persona" : "personas"}). Suplemento de temporada y opcionales van aparte.`;
  return [cabeza, renglones.join("; ") + ".", cierre].join(" ");
}
