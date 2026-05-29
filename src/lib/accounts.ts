// Cuentas bancarias de Camino Sacro — fuente única de verdad.
// El slug se guarda en client_payments.account y provider_payments.account.

export const ACCOUNTS = [
  { slug: "bancolombia_naty", label: "Bancolombia Naty", currency: "COP" },
  { slug: "bancolombia_camino", label: "Bancolombia El Camino", currency: "COP" },
  { slug: "santander", label: "Santander", currency: "EUR" },
] as const;

export type AccountSlug = (typeof ACCOUNTS)[number]["slug"];
export type AccountCurrency = (typeof ACCOUNTS)[number]["currency"];

export function accountLabel(slug: string | null | undefined): string {
  if (!slug) return "Sin cuenta";
  return ACCOUNTS.find((a) => a.slug === slug)?.label ?? slug;
}

export function accountCurrency(slug: string | null | undefined): AccountCurrency | null {
  return ACCOUNTS.find((a) => a.slug === slug)?.currency ?? null;
}
