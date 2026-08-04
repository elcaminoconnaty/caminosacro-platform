import { createCommercialClient } from "@/lib/supabase/server";
import Wizard from "./Wizard";
import Link from "next/link";
import { DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { CATALOG_BASE_YEAR } from "@/lib/pricing/year";

export default async function NuevaCotizacionPage() {
  const supabase = await createCommercialClient();
  const [{ data: routes }, { data: pricing }, { data: seasonSetting }] = await Promise.all([
    supabase.from("routes").select("id,name,family,origin,days,nights,km").eq("active", true).order("family").order("days", { ascending: false }),
    // Todos los años: el asistente filtra por el año de salida de la cotización, que solo
    // se conoce en el cliente (cambia con la fecha que se teclee).
    supabase
      .from("pricing")
      .select("route_id,modality,year,price_pilgrim,price_cs,routes(name)")
      .eq("season", "regular"),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
  ]);
  const seasonConfig = ((seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS);

  const pricingFlat = ((pricing as unknown as Array<{
    route_id: string;
    modality: string;
    year: number | null;
    price_pilgrim: string | number | null;
    price_cs: string | number | null;
    routes: { name: string } | null;
  }>) || []).map((p) => ({
    route_id: p.route_id,
    route_name: p.routes?.name ?? "",
    modality_slug: p.modality,
    year: Number(p.year) || CATALOG_BASE_YEAR,
    price_pilgrim: Number(p.price_pilgrim) || 0,
    price_cs: Number(p.price_cs) || 0,
  }));

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href="/seguimiento" className="text-sm text-muted hover:text-fg">← Volver al seguimiento</Link>
      </div>
      <header>
        <h1 className="font-display text-3xl text-bosque">Nueva cotización</h1>
        <p className="text-muted text-sm mt-1">Cliente, ruta del catálogo, fechas. El código y la fecha de validez se asignan automáticamente.</p>
      </header>
      <Wizard
        routes={(routes as { id: string; name: string; family: string | null; origin: string | null; days: number | null; nights: number | null; km: number | null }[]) || []}
        pricing={pricingFlat}
        seasonConfig={seasonConfig}
      />
    </div>
  );
}
