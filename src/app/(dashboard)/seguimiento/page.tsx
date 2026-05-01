import { createCommercialClient } from "@/lib/supabase/server";
import { eur, fechaCorta } from "@/lib/format";
import Link from "next/link";

type Quote = {
  id: string;
  code: string;
  client_name: string | null;
  client_phone: string | null;
  route_name: string | null;
  start_date: string | null;
  end_date: string | null;
  people: number | null;
  modality: string | null;
  total_eur: number | null;
  cost_eur: number | null;
  status: string | null;
  valid_until: string | null;
  notes: string | null;
};

type ClientPayment = { quote_id: string; amount_eur: number | null; amount: number; currency: string };
type ProviderPayment = { quote_id: string; amount_eur: number };

const statusColor: Record<string, string> = {
  borrador: "bg-zinc-100 text-zinc-700",
  enviada: "bg-blue-100 text-blue-800",
  aceptada: "bg-emerald-100 text-emerald-800",
  en_pago: "bg-amber-100 text-amber-800",
  pagada: "bg-bosque text-white",
  viajada: "bg-dorado/40 text-dorado-oscuro",
  cancelada: "bg-red-100 text-red-700",
};

export default async function SeguimientoPage() {
  const supabase = await createCommercialClient();
  const [{ data: qData, error }, { data: clientPays }, { data: providerPays }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id,code,client_name,client_phone,route_name,start_date,end_date,people,modality,total_eur,cost_eur,status,valid_until,notes",
      )
      .order("code", { ascending: false })
      .limit(500),
    supabase.from("client_payments").select("quote_id,amount_eur,amount,currency"),
    supabase.from("provider_payments").select("quote_id,amount_eur"),
  ]);

  const quotes = (qData ?? []) as Quote[];
  const cps = (clientPays ?? []) as ClientPayment[];
  const pps = (providerPays ?? []) as ProviderPayment[];

  const cobrado = new Map<string, number>();
  for (const p of cps) {
    const v = p.amount_eur ?? (p.currency === "EUR" ? p.amount : 0);
    cobrado.set(p.quote_id, (cobrado.get(p.quote_id) || 0) + (v || 0));
  }
  const pagadoPilgrim = new Map<string, number>();
  for (const p of pps) {
    pagadoPilgrim.set(p.quote_id, (pagadoPilgrim.get(p.quote_id) || 0) + (p.amount_eur || 0));
  }

  // Totales globales
  const totVenta = quotes.reduce((s, q) => s + (q.total_eur || 0), 0);
  const totCosto = quotes.reduce((s, q) => s + (q.cost_eur || 0), 0);
  const totCobrado = [...cobrado.values()].reduce((s, n) => s + n, 0);
  const totPagadoPilgrim = [...pagadoPilgrim.values()].reduce((s, n) => s + n, 0);
  const utilidadProyectada = totVenta - totCosto;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-bosque">Seguimiento</h1>
          <p className="text-muted text-sm mt-1">Cotizaciones, pagos del cliente y pagos a Pilgrim. Click en el código para editar.</p>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="px-4 py-2 rounded-md bg-bosque text-white text-sm font-medium hover:bg-bosque-medio transition"
        >
          Nueva cotización
        </Link>
      </header>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          {error.message.includes("does not exist") || error.message.includes("schema") ? (
            <>El schema <code className="font-mono">comercial</code> no está expuesto. Agregalo en Supabase Dashboard → API → Exposed schemas.</>
          ) : (
            <>Error: {error.message}</>
          )}
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card label="Total cotizado" value={eur(totVenta)} />
        <Card label="Costo Pilgrim total" value={eur(totCosto)} muted />
        <Card label="Utilidad proyectada" value={eur(utilidadProyectada)} accent />
        <Card label="Cobrado al cliente" value={eur(totCobrado)} />
        <Card label="Pagado a Pilgrim" value={eur(totPagadoPilgrim)} muted />
      </section>

      <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5">Código</th>
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-left px-4 py-2.5">Teléfono</th>
                <th className="text-left px-4 py-2.5">Ruta</th>
                <th className="text-left px-4 py-2.5">Pax</th>
                <th className="text-right px-4 py-2.5">Total €</th>
                <th className="text-right px-4 py-2.5">Costo Pilgrim €</th>
                <th className="text-right px-4 py-2.5">Utilidad €</th>
                <th className="text-right px-4 py-2.5">Cobrado</th>
                <th className="text-right px-4 py-2.5">Saldo</th>
                <th className="text-left px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quotes.map((q) => {
                const cobr = cobrado.get(q.id) || 0;
                const saldo = (q.total_eur || 0) - cobr;
                const utilidad = (q.total_eur || 0) - (q.cost_eur || 0);
                return (
                  <tr key={q.id} className="hover:bg-taupe/20">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Link href={`/seguimiento/${q.id}`} className="text-bosque font-medium hover:underline">{q.code}</Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{q.client_name || <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted text-xs font-mono">{q.client_phone || "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{q.route_name || "—"}</td>
                    <td className="px-4 py-2.5 text-muted text-center">{q.people ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">{q.total_eur != null && q.total_eur > 0 ? eur(q.total_eur) : <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{q.cost_eur != null && q.cost_eur > 0 ? eur(q.cost_eur) : "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${utilidad > 0 ? "text-bosque" : "text-muted"}`}>
                      {q.total_eur != null && q.total_eur > 0 ? eur(utilidad) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">{cobr > 0 ? eur(cobr) : <span className="text-muted">—</span>}</td>
                    <td className={`px-4 py-2.5 text-right ${saldo > 0 ? "text-amber-700 font-medium" : "text-muted"}`}>
                      {q.total_eur != null && q.total_eur > 0 ? eur(saldo) : "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${statusColor[q.status || ""] || "bg-zinc-100 text-zinc-700"}`}>
                        {q.status || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!error && quotes.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted">Sin cotizaciones aún.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
