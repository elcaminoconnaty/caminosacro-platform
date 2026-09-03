import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { eur } from "@/lib/format";
import Link from "next/link";
import AvisoCarga from "@/components/AvisoCarga";
import QuotesTable, { type QuoteRow } from "./QuotesTable";

type Quote = {
  id: string;
  code: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
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
  source: string | null;
};

type ClientPayment = { quote_id: string; amount_eur: number | null; amount: number; currency: string };
type ProviderPayment = { quote_id: string; amount_eur: number };

export default async function SeguimientoPage() {
  const supabase = await createCommercialClient();
  const [{ data: qData, error }, { data: clientPays }, { data: providerPays }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id,code,client_name,client_phone,client_email,route_name,start_date,end_date,people,modality,total_eur,cost_eur,status,valid_until,notes,source",
      )
      .order("code", { ascending: false })
      .limit(500),
    supabase.from("client_payments").select("quote_id,amount_eur,amount,currency"),
    supabase.from("provider_payments").select("quote_id,amount_eur"),
  ]);

  // Si la consulta de cotizaciones falla no se pinta nada más: ni los cinco KPI en 0,00 € ni
  // "Sin cotizaciones aún". Con `rows = []` esa pantalla le decía a Nico, con todas las letras,
  // que no tenía cotizaciones ni dinero cobrado, y el aviso de al lado era invisible (B7).
  if (error) {
    const esSchema =
      error.message.includes("does not exist") || error.message.includes("schema");
    return (
      <div className="space-y-6">
        <Cabecera />
        <AvisoCarga
          titulo="No se pudieron cargar las cotizaciones."
          detalle={
            esSchema ? (
              <>
                El schema <code className="font-mono">comercial</code> no está expuesto. Agregalo en
                Supabase Dashboard → API → Exposed schemas.
              </>
            ) : (
              <>
                {mensajeError(error, "La consulta al servidor no respondió.")} Recargá la página; si
                sigue igual, los números de abajo no se muestran a propósito para no enseñarte cifras
                falsas.
              </>
            )
          }
        />
      </div>
    );
  }

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

  const rows: QuoteRow[] = quotes.map((q) => {
    const total = q.total_eur || 0;
    const cobr = cobrado.get(q.id) || 0;
    return {
      id: q.id,
      code: q.code,
      client_name: q.client_name,
      client_phone: q.client_phone,
      client_email: q.client_email,
      route_name: q.route_name,
      start_date: q.start_date,
      people: q.people,
      total_eur: total,
      cost_eur: q.cost_eur || 0,
      cobrado: cobr,
      saldo: total - cobr,
      utilidad: total - (q.cost_eur || 0),
      status: q.status,
      source: q.source,
    };
  });

  return (
    <div className="space-y-6">
      <Cabecera />

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card label="Total cotizado" value={eur(totVenta)} />
        <Card label="Costo Pilgrim total" value={eur(totCosto)} muted />
        <Card label="Utilidad proyectada" value={eur(utilidadProyectada)} accent />
        <Card label="Cobrado al cliente" value={eur(totCobrado)} />
        <Card label="Pagado a Pilgrim" value={eur(totPagadoPilgrim)} muted />
      </section>

      <QuotesTable rows={rows} />
    </div>
  );
}

function Cabecera() {
  return (
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
