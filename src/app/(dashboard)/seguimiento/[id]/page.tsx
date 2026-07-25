import { createCommercialClient } from "@/lib/supabase/server";
import { eur, fechaCorta } from "@/lib/format";
import { getTRMHoy } from "@/lib/trm";
import { renderTemplate } from "@/lib/emailTemplate";
import { DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { statusColor, statusLabel, isFullyPaid } from "@/lib/quoteStatus";
import { notFound } from "next/navigation";
import Link from "next/link";
import QuoteEditor from "./QuoteEditor";
import ClientPaymentsCard from "./ClientPaymentsCard";
import ProviderPaymentsCard from "./ProviderPaymentsCard";
import DocumentsCard from "./DocumentsCard";
import EmailPreviewCard from "./EmailPreviewCard";
import OptionalsCard, { type OptionalCatalog, type OptionalLine } from "./OptionalsCard";
import HotelsCard, { type InitialHotel } from "./HotelsCard";
import ContractCard from "./ContractCard";
import type { ContractRow } from "./contractActions";
import { buildDefaultVariables } from "@/lib/contracts/render";

function basename(p: string | null): string | null {
  if (!p) return null;
  const parts = p.split("/");
  return parts[parts.length - 1] || null;
}

function findRouteMeta(
  routes:
    | Array<{ id: string; name: string; days?: number | null; nights?: number | null; origin?: string | null; destination?: string | null }>
    | null,
  routeName: string | null,
): { days: number | null; nights: number | null; origin: string | null; destination: string | null } | null {
  if (!routes || !routeName) return null;
  const r = routes.find((x) => x.name === routeName);
  if (!r) return null;
  return { days: r.days ?? null, nights: r.nights ?? null, origin: r.origin ?? null, destination: r.destination ?? null };
}

function buildTemplateVars(
  quote: Record<string, unknown>,
  total: number,
  trmRow: { eur_cop: number; date: string } | null,
  routeMeta: { days: number | null; nights: number | null; origin: string | null; destination: string | null } | null,
): Record<string, string | number | null | undefined> {
  const trm = trmRow?.eur_cop || 0;
  const totalCop = trm > 0 ? Math.round(total * trm) : null;
  const fmtEur = (n: number) =>
    new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n) + " €";
  const fmtCop = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
  const fechaLarga = (d: unknown) =>
    d
      ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(String(d)))
      : "";

  const fullName = String(quote.client_name || "").trim();
  const firstName = fullName.split(/\s+/)[0] || fullName;

  const fechasLargas =
    quote.start_date && quote.end_date
      ? `${fechaLarga(quote.start_date)} al ${fechaLarga(quote.end_date)}`
      : fechaLarga(quote.start_date) || fechaLarga(quote.end_date) || "";

  const days = routeMeta?.days ?? null;
  const nights = routeMeta?.nights ?? (days ? days - 1 : null);
  const duracion = days ? `${days} días${nights ? ` · ${nights} noches` : ""}` : "";

  const modality = String(quote.modality || "").toLowerCase();
  let alojamientoDesc = "";
  if (modality.includes("pensión doble") || modality.includes("pension doble")) {
    alojamientoDesc = "Pensión mayormente; en las localidades sin disponibilidad de pensión, alojamiento en hoteles · Habitación doble";
  } else if (modality.includes("pensión single") || modality.includes("pension single")) {
    alojamientoDesc = "Pensión mayormente; en las localidades sin disponibilidad de pensión, alojamiento en hoteles · Habitación individual";
  } else if (modality.includes("hotel doble")) {
    alojamientoDesc = "Hotel · Habitación doble";
  } else if (modality.includes("hotel single")) {
    alojamientoDesc = "Hotel · Habitación individual";
  } else if (modality) {
    alojamientoDesc = String(quote.modality);
  }

  const routeName = String(quote.route_name || "");
  const origin = routeMeta?.origin || "";
  const destination = routeMeta?.destination || "Santiago";
  const ruta = origin
    ? `Camino ${routeName.replace(/^Camino\s+/i, "")} — ${origin} → ${destination}`
    : routeName;
  const rutaDescripcion = origin
    ? `${routeName} desde ${origin} hasta ${destination}`
    : routeName;

  return {
    code: String(quote.code || ""),
    nombre: firstName,
    nombre_completo: fullName,
    ruta,
    ruta_descripcion: rutaDescripcion,
    dias_camino: days ? String(days - 1) : "", // días caminando = días - 1 (llegada)
    duracion,
    fechas_largas: fechasLargas,
    fechas: quote.start_date && quote.end_date ? `${fechaCorta(String(quote.start_date))} → ${fechaCorta(String(quote.end_date))}` : "",
    personas: String(quote.people || 1),
    alojamiento_descripcion: alojamientoDesc,
    precio_total: fmtEur(total),
    total_eur: fmtEur(total),
    total_cop: totalCop != null ? fmtCop(totalCop) : "—",
    trm: trm > 0 ? `1 EUR ≈ ${Math.round(trm).toLocaleString("es-CO")} COP` : "",
    validez: fechaLarga(quote.valid_until),
  };
}

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createCommercialClient();
  const [
    { data: quote },
    { data: routes },
    { data: pricing },
    { data: cps },
    { data: pps },
    { data: emailTpl },
    { data: optsCatalog },
    { data: quoteLines },
    { data: seasonSetting },
    { data: hotelsData },
    { data: contractRow },
    trmRow,
  ] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", id).maybeSingle(),
    supabase.from("routes").select("id,name,days,nights,origin,destination").order("name"),
    supabase
      .from("pricing")
      .select("route_id,modality,price_pilgrim,price_cs,routes(name)")
      .eq("season", "regular"),
    supabase.from("client_payments").select("*").eq("quote_id", id).order("paid_at", { ascending: false }),
    supabase.from("provider_payments").select("*").eq("quote_id", id).order("paid_at", { ascending: false }),
    supabase.from("email_templates").select("subject,body_md").eq("slug", "cotizacion_enviada").maybeSingle(),
    supabase
      .from("optional_services")
      .select("id,category,name,unit,price_cs")
      .eq("active", true),
    supabase
      .from("quote_lines")
      .select("id,reference_id,description,quantity,unit_price,total,type")
      .eq("quote_id", id)
      .eq("type", "optional"),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
    supabase
      .from("quote_hotels")
      .select("night_date,city,hotel_name,address,contact,notes,position")
      .eq("quote_id", id)
      .order("position"),
    supabase.from("contracts").select("*").eq("quote_id", id).maybeSingle(),
    getTRMHoy().catch(() => null),
  ]);
  const seasonConfig = ((seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS);

  if (!quote) notFound();

  // Si aún no hay contrato, precargamos las variables desde la cotización para
  // que el equipo las revise en el formulario ANTES de crear el contrato.
  let contractDefaults = null;
  if (!contractRow) {
    const d = await buildDefaultVariables(supabase, id);
    if (d.ok) contractDefaults = d.variables;
  }

  const cobrado = (cps || []).reduce((s, p) => {
    const v = p.amount_eur ?? (p.currency === "EUR" ? p.amount : 0);
    return s + (Number(v) || 0);
  }, 0);
  const pagadoPilgrim = (pps || []).reduce((s, p) => s + (Number(p.amount_eur) || 0), 0);
  const total = Number(quote.total_eur) || 0;
  const cost = Number(quote.cost_eur) || 0;
  const saldoCliente = total - cobrado;
  const saldoProveedor = cost - pagadoPilgrim;
  const utilidad = total - cost;
  const margenReal = cobrado - pagadoPilgrim;

  const pricingFlat = ((pricing as unknown as Array<{
    route_id: string;
    modality: string;
    price_pilgrim: string | number | null;
    price_cs: string | number | null;
    routes: { name: string } | null;
  }>) || []).map((p) => ({
    route_id: p.route_id,
    route_name: p.routes?.name ?? "",
    modality_slug: p.modality,
    price_pilgrim: Number(p.price_pilgrim) || 0,
    price_cs: Number(p.price_cs) || 0,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <Link href="/seguimiento" className="text-sm text-muted hover:text-fg">← Volver al seguimiento</Link>
      </div>

      <header className="bg-bg-card border border-border rounded-xl px-5 py-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-display text-3xl text-bosque">
              {quote.code}
              {(quote.source === "wordpress" || quote.source === "web") && (
                <span className="ml-2 align-middle text-[11px] px-2 py-0.5 rounded bg-dorado-oscuro/15 text-dorado-oscuro font-sans font-semibold uppercase tracking-wide">Web</span>
              )}
            </h1>
            <p className="text-muted text-sm mt-1">
              {quote.client_name || "Sin cliente"}
              {quote.route_name ? ` · ${quote.route_name}` : ""}
            </p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${statusColor(quote.status)}`}>{statusLabel(quote.status)}</span>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card label="Total cotizado" value={eur(total)} />
        <Card label="Costo Pilgrim" value={eur(cost)} muted />
        <Card label="Utilidad proyect." value={eur(utilidad)} accent />
        <Card label="Saldo cliente" value={eur(saldoCliente)} warn={saldoCliente > 0} />
        <Card label="Margen real" value={eur(margenReal)} accent />
      </section>

      <QuoteEditor quote={quote} routes={routes || []} pricing={pricingFlat} seasonConfig={seasonConfig} />

      <OptionalsCard
        quoteId={id}
        catalog={((optsCatalog as unknown) as OptionalCatalog[] || []).map((o) => ({ ...o, price_cs: Number(o.price_cs) || 0 }))}
        selected={((quoteLines as unknown) as OptionalLine[] || []).map((l) => ({
          id: l.id,
          reference_id: l.reference_id,
          description: l.description,
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.unit_price) || 0,
          total: Number(l.total) || 0,
        }))}
        baseEur={Number(quote.base_eur) || total}
        totalEur={total}
        people={quote.people}
      />

      <DocumentsCard
        quoteId={id}
        storagePath={quote.pdf_path}
        filename={basename(quote.pdf_path)}
      />

      {/* key: cuando el contrato aparece (o cambia), React remonta la card para
          que su estado interno (vars/plan) se inicialice con la fila fresca. */}
      <ContractCard
        key={(contractRow as ContractRow | null)?.id ?? "sin-contrato"}
        quoteId={id}
        contract={(contractRow as ContractRow | null) ?? null}
        defaultVariables={contractDefaults}
        totalEur={total}
      />

      {isFullyPaid(quote.status) && (
        <HotelsCard
          quoteId={id}
          initialHotels={((hotelsData as unknown) as InitialHotel[]) || []}
          pdfPath={quote.hotels_pdf_path ?? null}
          pdfFilename={basename(quote.hotels_pdf_path ?? null)}
        />
      )}

      <EmailPreviewCard
        quoteId={id}
        to={quote.client_email || ""}
        emailSentAt={quote.email_sent_at ?? null}
        subject={renderTemplate(
          emailTpl?.subject || "Cotización {{code}} - Camino Sacro",
          buildTemplateVars(quote, total, trmRow, findRouteMeta(routes, quote.route_name)),
        )}
        body={renderTemplate(
          emailTpl?.body_md || "Hola {{nombre}}, te envío la cotización adjunta.\n\nBuen Camino,\nCamino Sacro",
          buildTemplateVars(quote, total, trmRow, findRouteMeta(routes, quote.route_name)),
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ClientPaymentsCard quoteId={id} payments={cps || []} cobrado={cobrado} saldo={saldoCliente} />
        <ProviderPaymentsCard quoteId={id} payments={pps || []} pagado={pagadoPilgrim} saldo={saldoProveedor} />
      </div>
    </div>
  );
}

function Card({ label, value, accent, muted, warn }: { label: string; value: string; accent?: boolean; muted?: boolean; warn?: boolean }) {
  const color = warn ? "text-amber-700" : accent ? "text-dorado-oscuro" : muted ? "text-muted" : "text-bosque";
  return (
    <div className="bg-bg-card border border-border rounded-xl px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-display text-xl mt-1 ${color}`}>{value}</div>
    </div>
  );
}
