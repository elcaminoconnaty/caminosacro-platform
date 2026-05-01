import { createPublicSchemaClient } from "@/lib/supabase/server";
import { getTokenPricing, pricingFor, costUsd } from "@/lib/tokens";
import { getTRMHoy } from "@/lib/trm";
import { fechaCorta } from "@/lib/format";

type Row = {
  bot: string;
  channel: string | null;
  user_id: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string | null;
};

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("es-CO").format(n);

export default async function TokensPage() {
  const supabase = await createPublicSchemaClient();
  const [{ data, error }, pricing, trmRow] = await Promise.all([
    supabase
      .from("token_usage")
      .select("bot,channel,user_id,input_tokens,output_tokens,created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    getTokenPricing(),
    getTRMHoy().catch(() => null),
  ]);

  const rows = (data ?? []) as Row[];
  const trm = trmRow?.eur_cop ?? null; // EUR→COP; we use approx USD→COP via EUR cross when available

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const isLast = (r: Row, days: number) => r.created_at && now - new Date(r.created_at).getTime() < days * day;

  // Por bot
  const byBot = new Map<string, { events: number; in: number; out: number; usd: number }>();
  for (const r of rows) {
    const p = pricingFor(pricing, r.bot);
    const usd = costUsd(r.input_tokens || 0, r.output_tokens || 0, p);
    const acc = byBot.get(r.bot) || { events: 0, in: 0, out: 0, usd: 0 };
    acc.events++;
    acc.in += r.input_tokens || 0;
    acc.out += r.output_tokens || 0;
    acc.usd += usd;
    byBot.set(r.bot, acc);
  }
  const bots = [...byBot.entries()].sort((a, b) => b[1].usd - a[1].usd);

  // Totales
  const total = rows.reduce(
    (acc, r) => {
      const p = pricingFor(pricing, r.bot);
      const usd = costUsd(r.input_tokens || 0, r.output_tokens || 0, p);
      acc.events++;
      acc.in += r.input_tokens || 0;
      acc.out += r.output_tokens || 0;
      acc.usd += usd;
      if (isLast(r, 1)) acc.usd24h += usd;
      if (isLast(r, 7)) acc.usd7d += usd;
      if (isLast(r, 30)) acc.usd30d += usd;
      return acc;
    },
    { events: 0, in: 0, out: 0, usd: 0, usd24h: 0, usd7d: 0, usd30d: 0 },
  );

  // Por día (últimos 30)
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (!r.created_at) continue;
    if (!isLast(r, 30)) continue;
    const d = r.created_at.slice(0, 10);
    const p = pricingFor(pricing, r.bot);
    byDay.set(d, (byDay.get(d) || 0) + costUsd(r.input_tokens || 0, r.output_tokens || 0, p));
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxDay = Math.max(0, ...days.map((d) => d[1]));

  // Por canal (Clara)
  const byChannel = new Map<string, { events: number; usd: number }>();
  for (const r of rows) {
    if (r.bot !== "clara") continue;
    const ch = r.channel || "—";
    const p = pricingFor(pricing, "clara");
    const acc = byChannel.get(ch) || { events: 0, usd: 0 };
    acc.events++;
    acc.usd += costUsd(r.input_tokens || 0, r.output_tokens || 0, p);
    byChannel.set(ch, acc);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-bosque">Tokens & Costo</h1>
        <p className="text-muted text-sm mt-1">
          Consumo de tokens y costo USD por bot. Precios configurables en Configuración → Tokens.
          {trm && <> · TRM hoy: COP {Math.round(trm).toLocaleString("es-CO")}/EUR</>}
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error.message}</div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Costo total" value={fmtUSD(total.usd)} accent />
        <Card label="Últimas 24h" value={fmtUSD(total.usd24h)} />
        <Card label="Últimos 7 días" value={fmtUSD(total.usd7d)} />
        <Card label="Últimos 30 días" value={fmtUSD(total.usd30d)} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-display text-lg text-bosque">Por bot</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Bot</th>
                <th className="text-right px-4 py-2">Eventos</th>
                <th className="text-right px-4 py-2">Input</th>
                <th className="text-right px-4 py-2">Output</th>
                <th className="text-right px-4 py-2">USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bots.map(([bot, b]) => {
                const p = pricingFor(pricing, bot);
                return (
                  <tr key={bot}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{bot}</div>
                      <div className="text-[10px] text-muted">{p.model}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">{fmtN(b.events)}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{fmtN(b.in)}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{fmtN(b.out)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-bosque">{fmtUSD(b.usd)}</td>
                  </tr>
                );
              })}
              {bots.length === 0 && !error && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Sin datos.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-display text-lg text-bosque">Clara · por canal</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Canal</th>
                <th className="text-right px-4 py-2">Eventos</th>
                <th className="text-right px-4 py-2">USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...byChannel.entries()].sort((a, b) => b[1].usd - a[1].usd).map(([ch, b]) => (
                <tr key={ch}>
                  <td className="px-4 py-2.5 capitalize">{ch}</td>
                  <td className="px-4 py-2.5 text-right">{fmtN(b.events)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-bosque">{fmtUSD(b.usd)}</td>
                </tr>
              ))}
              {byChannel.size === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">Sin datos de Clara.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-display text-lg text-bosque">Costo diario (últimos 30 días)</h2>
        </div>
        <div className="px-5 py-4">
          {days.length === 0 ? (
            <p className="text-muted text-sm">Sin datos.</p>
          ) : (
            <div className="space-y-1.5">
              {days.map(([d, usd]) => {
                const pct = maxDay > 0 ? (usd / maxDay) * 100 : 0;
                return (
                  <div key={d} className="flex items-center gap-3 text-xs">
                    <span className="w-20 shrink-0 text-muted">{fechaCorta(d)}</span>
                    <div className="flex-1 h-5 bg-taupe/30 rounded">
                      <div className="h-full bg-bosque rounded" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-20 text-right font-medium">{fmtUSD(usd)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-display text-2xl mt-1 ${accent ? "text-dorado-oscuro" : "text-bosque"}`}>{value}</div>
    </div>
  );
}
