import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTRMHoy } from "@/lib/trm";
import { CATALOG_BASE_YEAR } from "@/lib/pricing/year";
import { DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import PublicQuoter, { type PublicRoute } from "./PublicQuoter";
import { WHATSAPP_NICO } from "./constants";

export const metadata: Metadata = {
  title: "Cotiza tu Camino de Santiago | Camino Sacro",
  description:
    "Arma tu Camino en 2 minutos y recibe la cotización en PDF por correo: alojamiento, traslado de equipaje y asistencia 24h.",
};

// Precios y TRM cambian a diario; nunca servir esta página desde caché estática.
export const dynamic = "force-dynamic";

export default async function CotizarPage() {
  // El público no tiene sesión y las tablas de `comercial` están cerradas por RLS,
  // así que se lee con la service key desde el servidor. Del precio solo sale `price_cs`:
  // `price_pilgrim` (costo del proveedor) jamás cruza al navegador.
  const supabase = createAdminClient("comercial");

  const [{ data: routes }, { data: pricing }, { data: seasonSetting }, trm] = await Promise.all([
    supabase
      .from("routes")
      .select("id,name,family,origin,days,nights,km,modality")
      .eq("active", true)
      .eq("web", true) // misma oferta que el cotizador de caminosacro.com
      .order("days", { ascending: false }),
    supabase.from("pricing").select("route_id,modality,year,price_cs").eq("season", "regular"),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
    getTRMHoy(supabase).catch(() => null),
  ]);

  const seasonConfig = (seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS;

  // La config de temporadas trae los suplementos del proveedor (price_pilgrim). El navegador
  // solo necesita los del cliente para el preview, así que los del proveedor se ponen en 0
  // antes de cruzar al componente: de lo contrario viajarían en el HTML.
  const seasonPublic: SeasonSupplements = {
    high_season: { ...seasonConfig.high_season, price_pilgrim: 0 },
    easter: { ...seasonConfig.easter, price_pilgrim: 0 },
  };

  // Tarifas agrupadas por ruta y año: el navegador elige el año de la salida y cae al
  // anterior si aún no está cargado (ver tarifasDe() en PublicQuoter).
  const priceByRoute = new Map<string, Record<string, Record<string, number>>>();
  for (const p of (pricing as Array<{ route_id: string; modality: string; year: number | null; price_cs: number | string | null }>) || []) {
    const precio = Number(p.price_cs) || 0;
    if (precio <= 0) continue;
    const year = String(Number(p.year) || CATALOG_BASE_YEAR);
    const porAnio = priceByRoute.get(p.route_id) ?? {};
    porAnio[year] = { ...(porAnio[year] ?? {}), [p.modality]: precio };
    priceByRoute.set(p.route_id, porAnio);
  }

  const publicRoutes: PublicRoute[] = (
    (routes as Array<{
      id: string;
      name: string;
      family: string | null;
      origin: string | null;
      days: number | null;
      nights: number | null;
      km: number | string | null;
      modality: string | null;
    }>) || []
  ).map((r) => ({
    id: r.id,
    name: r.name,
    family: r.family,
    origin: r.origin,
    days: r.days,
    km: r.km == null ? null : Number(r.km),
    modality: r.modality,
    pricesByYear: priceByRoute.get(r.id) ?? {},
  }));

  return (
    <PublicQuoter
      routes={publicRoutes}
      seasonConfig={seasonPublic}
      trmEurCop={trm?.eur_cop ?? null}
      whatsappNico={WHATSAPP_NICO}
    />
  );
}
