// Estados de cotización — fuente única de verdad.
// Debe coincidir con el CHECK de comercial.quotes.status (migración 0003).

export const QUOTE_STATUSES = [
  "enviada",
  "aceptada",
  "pago_parcial",
  "pago_completo",
  "completada",
  "cancelada",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const DEFAULT_STATUS: QuoteStatus = "enviada";

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  enviada: "Enviada",
  aceptada: "Aceptada",
  pago_parcial: "Pago parcial",
  pago_completo: "Pago completo",
  completada: "Completada",
  cancelada: "Cancelada",
};

// Clases Tailwind para el chip/badge de estado.
export const STATUS_COLORS: Record<QuoteStatus, string> = {
  enviada: "bg-blue-100 text-blue-800",
  aceptada: "bg-emerald-100 text-emerald-800",
  pago_parcial: "bg-amber-100 text-amber-800",
  pago_completo: "bg-bosque text-white",
  completada: "bg-dorado/40 text-dorado-oscuro",
  cancelada: "bg-red-100 text-red-700",
};

export function isQuoteStatus(v: unknown): v is QuoteStatus {
  return typeof v === "string" && (QUOTE_STATUSES as readonly string[]).includes(v);
}

export function statusLabel(v: string | null | undefined): string {
  return v && isQuoteStatus(v) ? STATUS_LABELS[v] : (v || "—");
}

export function statusColor(v: string | null | undefined): string {
  return v && isQuoteStatus(v) ? STATUS_COLORS[v] : "bg-zinc-100 text-zinc-700";
}

// Estados que indican pago total (habilitan el PDF de hoteles).
export const FULLY_PAID_STATUSES: readonly QuoteStatus[] = ["pago_completo", "completada"];

export function isFullyPaid(v: string | null | undefined): boolean {
  return !!v && (FULLY_PAID_STATUSES as readonly string[]).includes(v);
}
