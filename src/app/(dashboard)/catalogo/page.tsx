import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import PricingTable, { type Row } from "./PricingTable";
import OptionalsTable, { type Opt } from "./OptionalsTable";
import ResourcesList, { type Resource } from "./ResourcesList";
import RouteStagesEditor, { type RouteWithStagesEditable } from "./RouteStagesEditor";
import CatalogToolbar from "./CatalogToolbar";

// Siempre lee datos frescos de la DB (evita mostrar rutas/precios cacheados tras crear/editar).
export const dynamic = "force-dynamic";

// Familias conocidas de Caminos, para el autocompletado del alta de rutas.
const KNOWN_FAMILIES = ["Francés", "Portugués", "Costero", "Primitivo", "Inglés", "Norte", "Fisterra"];

export default async function CatalogoPage() {
  const supabase = await createCommercialClient();
  const [
    { data: pricing, error: errPricing },
    { data: optionals, error: errOpt },
    { data: welcome },
    { data: routesData },
    { data: stagesData },
  ] = await Promise.all([
    supabase
      .from("pricing")
      .select("id,route_id,modality,price_pilgrim,price_cs,routes(name)")
      .eq("season", "regular"),
    supabase
      .from("optional_services")
      .select("id,category,name,unit,price_pilgrim,price_cs")
      .eq("active", true),
    supabase
      .from("welcome_letters")
      .select("id,name,storage_path,routes(name)")
      .eq("active", true),
    supabase
      .from("routes")
      .select("id,name,family,origin,destination,days,km")
      .eq("active", true),
    supabase
      .from("route_stages")
      .select("id,route_id,day,from_place,to_place,km,accommodation")
      .order("day"),
  ]);

  const rows: Row[] = ((pricing as unknown as Array<{
    id: string;
    route_id: string;
    modality: string;
    price_pilgrim: string | number | null;
    price_cs: string | number | null;
    routes: { name: string } | null;
  }>) || []).map((p) => ({
    id: p.id,
    route_id: p.route_id,
    modality: p.modality,
    price_pilgrim: Number(p.price_pilgrim) || 0,
    price_cs: Number(p.price_cs) || 0,
    route_name: p.routes?.name ?? p.route_id,
  })).sort((a, b) => a.route_name.localeCompare(b.route_name) || a.modality.localeCompare(b.modality));

  const opts: Opt[] = ((optionals as unknown as Array<{
    id: string;
    category: string;
    name: string;
    unit: string | null;
    price_pilgrim: string | number | null;
    price_cs: string | number | null;
  }>) || []).map((o) => ({
    id: o.id,
    category: o.category,
    name: o.name,
    unit: o.unit,
    price_pilgrim: Number(o.price_pilgrim) || 0,
    price_cs: Number(o.price_cs) || 0,
  }));

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

  const error = errPricing || errOpt;

  const families = [...new Set([...KNOWN_FAMILIES, ...routesWithStages.map((r) => r.family).filter((f): f is string => !!f)])].sort();
  const routesList = routesWithStages
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-bosque">Catálogo</h1>
        <p className="text-muted text-sm mt-1">Precios Pilgrim vs precios Camino Sacro. Editable inline.</p>
      </header>

      <CatalogToolbar families={families} routes={routesList} />

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
        <h2 className="font-display text-xl text-bosque mb-3">Rutas</h2>
        <PricingTable initialRows={rows} />
      </section>

      <section>
        <h2 className="font-display text-xl text-bosque mb-3">Servicios opcionales</h2>
        <OptionalsTable initialRows={opts} />
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
