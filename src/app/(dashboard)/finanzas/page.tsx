import { createCommercialClient } from "@/lib/supabase/server";
import { eur, cop } from "@/lib/format";
import { ACCOUNTS, accountLabel } from "@/lib/accounts";

type ClientPay = { amount: number | null; currency: string | null; amount_eur: number | null; account: string | null };
type ProviderPay = { amount_eur: number | null; account: string | null };

function money(n: number, currency: string): string {
  if (currency === "EUR") return eur(n);
  if (currency === "COP") return cop(n);
  return new Intl.NumberFormat("es-CO", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

type Agg = { entradas: Record<string, number>; salidas: Record<string, number> };

export default async function FinanzasPage() {
  const supabase = await createCommercialClient();
  const [{ data: cpRaw }, { data: ppRaw }] = await Promise.all([
    supabase.from("client_payments").select("amount,currency,amount_eur,account"),
    supabase.from("provider_payments").select("amount_eur,account"),
  ]);

  const clientPays = (cpRaw ?? []) as ClientPay[];
  const providerPays = (ppRaw ?? []) as ProviderPay[];

  // Totales globales en EUR (denominador común)
  const totalCobradoEur = clientPays.reduce(
    (s, p) => s + (Number(p.amount_eur) || (p.currency === "EUR" ? Number(p.amount) || 0 : 0)),
    0,
  );
  const totalPagadoEur = providerPays.reduce((s, p) => s + (Number(p.amount_eur) || 0), 0);
  const margenCaja = totalCobradoEur - totalPagadoEur;

  // Agregado por cuenta y moneda
  const aggs = new Map<string, Agg>();
  const ensure = (k: string) => {
    let a = aggs.get(k);
    if (!a) { a = { entradas: {}, salidas: {} }; aggs.set(k, a); }
    return a;
  };
  for (const p of clientPays) {
    const a = ensure(p.account || "");
    const cur = p.currency || "EUR";
    a.entradas[cur] = (a.entradas[cur] || 0) + (Number(p.amount) || 0);
  }
  for (const p of providerPays) {
    const a = ensure(p.account || "");
    a.salidas["EUR"] = (a.salidas["EUR"] || 0) + (Number(p.amount_eur) || 0);
  }

  // Orden: las 3 cuentas definidas + "Sin cuenta" si tiene movimientos
  const orderedKeys = [
    ...ACCOUNTS.map((a) => a.slug),
    ...(aggs.has("") ? [""] : []),
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-bosque">Finanzas</h1>
        <p className="text-muted text-sm mt-1">
          Cuánto te han pagado los clientes, cuánto le hemos pagado a Pilgrim y cuánto debe haber en cada cuenta.
        </p>
      </header>

      {/* Resumen global (≈ EUR) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card label="Cobrado de clientes (≈ EUR)" value={eur(totalCobradoEur)} />
        <Card label="Pagado a Pilgrim (EUR)" value={eur(totalPagadoEur)} muted />
        <Card label="Margen en caja (≈ EUR)" value={eur(margenCaja)} accent />
      </section>

      {/* Saldo por cuenta */}
      <section>
        <h2 className="font-display text-xl text-bosque mb-3">Saldo por cuenta</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {orderedKeys.map((key) => {
            const a = aggs.get(key) ?? { entradas: {}, salidas: {} };
            const currencies = Array.from(new Set([...Object.keys(a.entradas), ...Object.keys(a.salidas)]));
            if (currencies.length === 0) currencies.push("COP"); // placeholder vacío
            return (
              <div key={key || "sin"} className="bg-bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <div className="font-medium text-bosque">{accountLabel(key || null)}</div>
                </div>
                <div className="divide-y divide-border">
                  {currencies.map((cur) => {
                    const entr = a.entradas[cur] || 0;
                    const sal = a.salidas[cur] || 0;
                    const saldo = entr - sal;
                    return (
                      <div key={cur} className="px-4 py-3 space-y-1">
                        <Row label="Entradas (clientes)" value={money(entr, cur)} />
                        <Row label="Salidas (Pilgrim)" value={sal > 0 ? `− ${money(sal, cur)}` : money(0, cur)} muted />
                        <div className="flex items-center justify-between pt-1 border-t border-border mt-1">
                          <span className="text-sm font-medium">Saldo</span>
                          <span className={`font-display text-lg ${saldo >= 0 ? "text-bosque" : "text-red-600"}`}>
                            {money(saldo, cur)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted mt-3">
          El saldo de cada cuenta = lo que entró de clientes − lo que salió a Pilgrim, en la moneda de la cuenta.
          Bancolombia se maneja en COP y Santander en EUR. Los pagos sin cuenta asignada aparecen como “Sin cuenta”.
        </p>
      </section>
    </div>
  );
}

function Card({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-display text-2xl mt-1 ${accent ? "text-dorado-oscuro" : muted ? "text-muted" : "text-bosque"}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={muted ? "text-muted" : ""}>{value}</span>
    </div>
  );
}
