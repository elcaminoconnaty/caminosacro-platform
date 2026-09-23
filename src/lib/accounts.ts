// Cuentas bancarias de Camino Sacro — fuente única de verdad.
// El slug se guarda en client_payments.account y provider_payments.account.

export const ACCOUNTS = [
  { slug: "bancolombia_naty", label: "Bancolombia Naty", currency: "COP" },
  { slug: "bancolombia_camino", label: "Bancolombia El Camino", currency: "COP" },
  { slug: "santander", label: "Santander", currency: "EUR" },
  // Global66 guarda saldo en varias monedas a la vez: no tiene una sola contra la cual
  // validar el cobro, así que la moneda la dice el pago y no la cuenta.
  { slug: "global66", label: "Global66", currency: "multimoneda" },
] as const;

export type AccountSlug = (typeof ACCOUNTS)[number]["slug"];
export type AccountCurrency = (typeof ACCOUNTS)[number]["currency"];

export function accountLabel(slug: string | null | undefined): string {
  if (!slug) return "Sin cuenta";
  return ACCOUNTS.find((a) => a.slug === slug)?.label ?? slug;
}

/** La moneda única de la cuenta, o null si no tiene una (sin cuenta, o multimoneda). */
export function accountCurrency(slug: string | null | undefined): Exclude<AccountCurrency, "multimoneda"> | null {
  const c = ACCOUNTS.find((a) => a.slug === slug)?.currency;
  return c && c !== "multimoneda" ? c : null;
}
