import type { ContractVariables } from "./template";

/** "2.340" (formato es-ES del contrato) → 2340. */
function numeroDelContrato(texto: string | undefined): number {
  return Number(String(texto ?? "").replace(/\./g, "").replace(",", ".")) || 0;
}

/**
 * Las cifras del recuadro de solidaridad del contrato conjunto: el total del plan y la
 * cuota de cada uno, en la moneda en que pagan, y con quién se firma.
 *
 * Vive aparte porque la usan las dos orillas y tienen que decir EXACTAMENTE lo mismo: la
 * página de firma para mostrar el recuadro y el consentimiento, y el servidor para archivar
 * ese consentimiento palabra por palabra junto a la firma.
 */
export function cifrasConjunto(v: ContractVariables, yo: string) {
  const n = v.partes?.length || Number(v.num_personas) || 1;
  const enPesos = v.moneda === "COP" && numeroDelContrato(v.valor_total_cop) > 0;
  const total = enPesos ? numeroDelContrato(v.valor_total_cop) : numeroDelContrato(v.valor_total_eur);
  const fmt = (x: number) =>
    enPesos
      ? `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(x)} COP`
      : `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(x)} €`;
  return {
    total: fmt(total),
    cuota: fmt(total / n),
    otros: (v.partes ?? []).map((p) => p.nombre).filter((nombre) => nombre !== yo),
    n,
  };
}
