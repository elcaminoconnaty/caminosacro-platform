/**
 * Qué opcionales del catálogo se OFRECEN en la tabla "Servicios opcionales" del PDF.
 *
 * Desde el catálogo Pilgrim 2027 hay ~30 traslados (coche de 4 y furgoneta de 8, desde el
 * aeropuerto a cada inicio de ruta y entre ciudades) y la anulación va por tramos de importe.
 * Todos viven en el CRM para elegirlos por cotización, pero listarlos todos en cada PDF
 * ahogaría la página. Reglas:
 *
 *  - Lo que la cotización ya tiene marcado se ofrece siempre.
 *  - Traslados: los que llegan al inicio de la ruta ("… → Sarria" en una ruta que sale de
 *    Sarria) y los de regreso desde el final ("Santiago centro → SCQ", "Fisterra → SCQ",
 *    "Santiago → Oporto" si se empezó en Oporto). Grupo de hasta 4: coche; de 5 a 8:
 *    furgoneta; más de 8: los dos.
 *  - Anulación ("… · viaje hasta 1.000 €/persona"): solo el tramo del importe por persona.
 *  - El resto de categorías, sin cambios.
 *
 * Sin "server-only": es lógica pura y se prueba con tsx.
 */

export type OpcionalOfrecible = { id: string; category: string; name: string; unit: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/aeropuerto de santiago \(scq\)/g, "scq")
    .replace(/santiago centro|santiago de compostela/g, "santiago")
    .replace(/\boporto\b/g, "porto")
    .replace(/\s*·\s*furgoneta/g, "")
    .trim();

/** "Aeropuerto de Santiago (SCQ) → Sarria" → ["scq", "sarria"]; null si no es un trayecto. */
function tramos(nombre: string): [string, string] | null {
  const partes = nombre.split("→");
  if (partes.length !== 2) return null;
  return [norm(partes[0]), norm(partes[1])];
}

function plazas(unit: string): number {
  const m = unit.toLowerCase().match(/(\d+)\s*plazas/);
  return m ? Number(m[1]) : 4;
}

/** Tope del tramo de anulación ("viaje hasta 3.000 €/persona" → 3000); null si no es por tramos. */
export function topeAnulacion(nombre: string): number | null {
  const m = nombre.match(/hasta\s+([\d.]+)\s*€\s*\/\s*persona/i);
  return m ? Number(m[1].replace(/\./g, "")) : null;
}

export function opcionalesOfrecidos<T extends OpcionalOfrecible>(
  opcionales: T[],
  ctx: {
    origen: string | null | undefined;
    destino: string | null | undefined;
    personas: number | null | undefined;
    /** Importe por persona con el que se elige el tramo de anulación (costo Pilgrim). */
    importePorPersona: number | null | undefined;
    seleccionados: Set<string>;
  },
): T[] {
  const origen = norm(ctx.origen || "");
  const destino = norm(ctx.destino || "santiago");
  const personas = Math.max(1, Math.round(Number(ctx.personas) || 1));

  // Tramo de anulación que corresponde: el tope más bajo que cubre el importe por persona.
  const topes = [...new Set(opcionales.map((o) => (o.category === "seguro" ? topeAnulacion(o.name) : null)).filter((t): t is number => t != null))].sort((a, b) => a - b);
  const importe = Number(ctx.importePorPersona) || 0;
  const topeElegido = topes.find((t) => importe <= t) ?? topes[topes.length - 1];

  return opcionales.filter((o) => {
    if (ctx.seleccionados.has(o.id)) return true;

    if (o.category === "seguro") {
      const tope = topeAnulacion(o.name);
      return tope == null || tope === topeElegido;
    }

    if (o.category === "transfer") {
      const t = tramos(o.name);
      if (!t) return true;
      const [desde, hasta] = t;
      const llegaAlInicio = origen !== "" && hasta === origen;
      const vuelveDelFinal = desde === destino && (hasta === "scq" || (hasta === "porto" && origen === "porto"));
      if (!llegaAlInicio && !vuelveDelFinal) return false;
      const p = plazas(o.unit);
      if (personas <= 4) return p <= 4;
      if (personas <= 8) return p > 4;
      return true;
    }

    return true;
  });
}
