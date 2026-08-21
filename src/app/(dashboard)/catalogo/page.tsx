import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import PricingTable, { type Row } from "./PricingTable";
import OptionalsTable, { type Opt } from "./OptionalsTable";
import BikesTable, { type BikeRouteCol } from "./BikesTable";
import { BIKE_COLUMNS, normalizeBike, normalizeBikePrice } from "@/lib/bikes/catalog";
import ResourcesList, { type Resource } from "./ResourcesList";
import RouteStagesEditor, { type RouteWithStagesEditable } from "./RouteStagesEditor";
import CatalogToolbar from "./CatalogToolbar";
import Link from "next/link";
import { catalogYears, MODALITY_SLUGS } from "@/lib/pricing/year";

// Siempre lee datos frescos de la DB (evita mostrar rutas/precios cacheados tras crear/editar).
export const dynamic = "force-dynamic";

// Familias conocidas de Caminos, para el autocompletado del alta de rutas.
const KNOWN_FAMILIES = ["Francés", "Portugués", "Costero", "Primitivo", "Inglés", "Norte", "Fisterra"];

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  // Año de tarifas que se está editando. Por defecto el año en curso; el selector cambia
  // el `?year=` y todo lo de esta página (tabla, alta y edición de rutas) apunta ahí.
  const years = catalogYears();
  const requested = Number((await searchParams).year);
  const year = years.includes(requested) ? requested : Math.max(...years.filter((y) => y <= new Date().getFullYear()));

  const supabase = await createCommercialClient();
  const [
    { data: pricing, error: errPricing },
    { data: optionals, error: errOpt },
    { data: welcome },
    { data: routesData },
    { data: stagesData },
    { data: bikesData, error: errBikes },
    { data: bikePricesData, error: errBikePrices },
  ] = await Promise.all([
    supabase
      .from("pricing")
      .select("id,route_id,modality,price_pilgrim,price_cs,routes(name)")
      .eq("season", "regular")
      .eq("year", year),
    // Los precios de los opcionales viven en optional_prices por año (migración 0019);
    // el servicio en sí (nombre, categoría, unidad) es único.
    supabase
      .from("optional_services")
      .select("id,category,name,unit,optional_prices(year,price_pilgrim,price_cs)")
      .eq("active", true),
    supabase
      .from("welcome_letters")
      .select("id,name,storage_path,routes(name)")
      .eq("active", true),
    // `modality` viene acá para no repetir la consulta de rutas: la grilla de bicis solo
    // necesita las de modalidad `bici`, que son las que tienen tarifa de alquiler.
    supabase
      .from("routes")
      .select("id,name,family,origin,destination,days,km,modality")
      .eq("active", true),
    supabase
      .from("route_stages")
      .select("id,route_id,day,from_place,to_place,km,accommodation")
      .order("day"),
    // Flota y tarifas de alquiler (migración 0021). La tarifa es (bici × ruta × año), así
    // que se pide solo el año activo, igual que las tarifas de ruta.
    supabase.from("bikes").select(BIKE_COLUMNS).eq("active", true).order("position"),
    supabase.from("bike_prices").select("bike_id,route_id,year,days,price_pilgrim,price_cs").eq("year", year),
  ]);

  const rows: Row[] = ((pricing as unknown as Array<{
    id: string;
    route_id: string;
    modality: string;
    price_pilgrim: string | number | null;
    price_cs: string | number | null;
    routes: { name: string } | null;
  }>) || []).map((p) => ({
    id: p.id as string | null,
    route_id: p.route_id,
    modality: p.modality,
    price_pilgrim: Number(p.price_pilgrim) || 0,
    price_cs: Number(p.price_cs) || 0,
    route_name: p.routes?.name ?? p.route_id,
  }));

  // Filas virtuales: toda ruta activa aparece en la tabla aunque no tenga precios
  // (al teclear el primer valor se crea la fila real en `pricing`).
  const existing = new Set(rows.map((r) => `${r.route_id}:${r.modality}`));
  for (const r of ((routesData as unknown as Array<{ id: string; name: string }>) || [])) {
    for (const modality of MODALITY_SLUGS) {
      if (!existing.has(`${r.id}:${modality}`)) {
        rows.push({ id: null, route_id: r.id, modality, price_pilgrim: 0, price_cs: 0, route_name: r.name });
      }
    }
  }
  rows.sort((a, b) => a.route_name.localeCompare(b.route_name) || a.modality.localeCompare(b.modality));

  // Solo los precios del año activo; los que no tengan fila aparecen en 0 y al teclear
  // el primer valor se crea la fila de ese año (igual que las tarifas de ruta).
  const opts: Opt[] = ((optionals as unknown as Array<{
    id: string;
    category: string;
    name: string;
    unit: string | null;
    optional_prices: Array<{ year: number; price_pilgrim: string | number | null; price_cs: string | number | null }> | null;
  }>) || []).map((o) => {
    const delAnio = (o.optional_prices || []).find((p) => Number(p.year) === year);
    return {
      id: o.id,
      category: o.category,
      name: o.name,
      unit: o.unit,
      price_pilgrim: Number(delAnio?.price_pilgrim) || 0,
      price_cs: Number(delAnio?.price_cs) || 0,
    };
  });

  const welcomeRes: Resource[] = (((welcome as unknown) as Array<{
    id: string;
    name: string;
    storage_path: string;
    routes: { name: string } | null;
  }>) || []).map((w) => ({
    id: w.id,
    name: w.name,
    storage_path: w.storage_path,
    route_name: w.routes?.name ?? null,
  }));

  const stagesByRoute = new Map<string, RouteWithStagesEditable["stages"]>();
  for (const s of (stagesData || []) as Array<{ id: string; route_id: string; day: number; from_place: string | null; to_place: string | null; km: number | string | null; accommodation: string | null }>) {
    if (!stagesByRoute.has(s.route_id)) stagesByRoute.set(s.route_id, []);
    stagesByRoute.get(s.route_id)!.push({
      id: s.id,
      day: s.day,
      from_place: s.from_place,
      to_place: s.to_place,
      km: s.km != null ? Number(s.km) : null,
      accommodation: s.accommodation,
    });
  }
  const routesWithStages: RouteWithStagesEditable[] = (((routesData as unknown) as Array<{
    id: string;
    name: string;
    family: string | null;
    origin: string | null;
    destination: string | null;
    days: number | null;
    km: number | string | null;
  }>) || []).map((r) => ({
    id: r.id,
    name: r.name,
    family: r.family,
    origin: r.origin,
    destination: r.destination,
    days: r.days,
    km: r.km != null ? Number(r.km) : null,
    stages: stagesByRoute.get(r.id) || [],
  }));

  const bikes = ((bikesData as unknown as Array<Record<string, unknown>>) || []).map(normalizeBike);
  const bikePrices = ((bikePricesData as unknown as Array<Record<string, unknown>>) || []).map(normalizeBikePrice);

  // Columnas de la grilla de bicis: una por ruta en bici. Los días de alquiler salen de la
  // tarifa (todas las filas de una ruta comparten el mismo `days`) porque es la tarifa, no
  // la ruta, la que dice cuántos días de bici se están cobrando.
  const bikeRoutes: BikeRouteCol[] = (((routesData as unknown) as Array<{ id: string; name: string; modality: string | null }>) || [])
    .filter((r) => r.modality === "bici")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({
      id: r.id,
      name: r.name,
      days: bikePrices.find((p) => p.route_id === r.id && p.days != null)?.days ?? null,
    }));

  const error = errPricing || errOpt || errBikes || errBikePrices;

  const families = [...new Set([...KNOWN_FAMILIES, ...routesWithStages.map((r) => r.family).filter((f): f is string => !!f)])].sort();
  const routesList = routesWithStages
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-bosque">Catálogo</h1>
          <p className="text-muted text-sm mt-1">Precios Pilgrim vs precios Camino Sacro. Editable inline.</p>
        </div>
        {/* Selector de año de tarifa: cada año tiene su propio juego de precios. */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted mr-1">Tarifas</span>
          {years.map((y) => (
            <Link
              key={y}
              href={`/catalogo?year=${y}`}
              className={`text-sm px-3 py-1.5 rounded-md border transition ${
                y === year ? "bg-bosque text-white border-bosque" : "border-border bg-bg-card hover:bg-taupe/40"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      </header>

      <CatalogToolbar families={families} routes={routesList} year={year} />

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          {error.message.includes("does not exist") || error.message.includes("schema") ? (
            <>El schema <code className="font-mono">comercial</code> no está expuesto. Agregalo en Supabase Dashboard → API → Exposed schemas.</>
          ) : (
            <>{mensajeError(error, "No se pudo cargar el catálogo.")}</>
          )}
        </div>
      )}

      <section>
        <h2 className="font-display text-xl text-bosque mb-3">Rutas · tarifas {year}</h2>
        <PricingTable key={year} initialRows={rows} year={year} />
      </section>

      <section>
        <h2 className="font-display text-xl text-bosque mb-3">Servicios opcionales · precios {year}</h2>
        <OptionalsTable key={year} initialRows={opts} year={year} />
      </section>

      <section>
        <h2 className="font-display text-xl text-bosque mb-1">Tarifas de alquiler de bicicleta</h2>
        <p className="text-xs text-muted mb-3">
          La tarifa va por ruta porque cubre sus días de alquiler: la misma bici cuesta distinto en el Francés desde
          Ponferrada (5 días) que en el Primitivo desde Oviedo (8).
        </p>
        <BikesTable key={year} bikes={bikes} prices={bikePrices} routes={bikeRoutes} year={year} />
      </section>

      <section>
        <h2 className="font-display text-xl text-bosque mb-1">Itinerarios y etapas</h2>
        <p className="text-xs text-muted mb-3">Click en una ruta para editar día a día. Cada etapa cargada aparece en el PDF de cotización exactamente como esté aquí.</p>
        <RouteStagesEditor routes={routesWithStages} />
      </section>

      <section>
        <h2 className="font-display text-xl text-bosque mb-1">Cartas de bienvenida</h2>
        <p className="text-xs text-muted mb-3">Genéricas por ruta. Las descargás de aquí cuando un cliente confirma para adjuntar al correo.</p>
        <ResourcesList items={welcomeRes} />
      </section>
    </div>
  );
}
