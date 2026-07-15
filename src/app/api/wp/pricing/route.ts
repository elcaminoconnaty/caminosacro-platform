import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { autorizado, noAutorizado } from "../auth";

export const dynamic = "force-dynamic";

const MODALIDADES = ["pension_doble", "hotel_doble", "pension_single", "hotel_single"] as const;

/**
 * GET /api/wp/pricing — catálogo completo para el cotizador de caminosacro.com.
 *
 * El CRM es la fuente de verdad del cotizador público: aquí viajan TODAS las
 * rutas activas (una ruta nueva en el CRM aparece sola en la web) y los
 * servicios opcionales activos. Las rutas con sus 4 tarifas completas llevan
 * `prices` y cotizan al instante; las demás van sin `prices` y la web las
 * deriva a WhatsApp como cotización a medida. Desactivar una ruta en el CRM
 * la saca de la web.
 *
 * Devuelve solo price_cs (venta); price_pilgrim jamás sale de la plataforma.
 * WordPress lo cachea 6 horas y usa el último payload bueno si esto no responde.
 */
export async function GET(request: Request) {
  if (!autorizado(request)) return noAutorizado();

  const supabase = createAdminClient("comercial");
  const [
    { data: routes, error: rErr },
    { data: pricing, error: pErr },
    { data: optionals, error: oErr },
    { data: seasonSetting },
  ] = await Promise.all([
    supabase
      .from("routes")
      .select("id,slug,name,days,nights,stages,km,modality")
      .eq("active", true)
      .order("days", { ascending: true, nullsFirst: false }),
    supabase.from("pricing").select("route_id,modality,price_cs").eq("season", "regular"),
    supabase
      .from("optional_services")
      .select("name,unit,price_cs,category")
      .eq("active", true)
      .order("category")
      .order("name"),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
  ]);
  if (rErr || pErr || oErr) {
    return Response.json({ ok: false, error: "interno" }, { status: 500 });
  }

  const porRuta = new Map<string, Record<string, number>>();
  for (const p of pricing || []) {
    const precio = Number(p.price_cs) || 0;
    if (precio <= 0) continue;
    if (!porRuta.has(p.route_id)) porRuta.set(p.route_id, {});
    porRuta.get(p.route_id)![p.modality] = precio;
  }

  const rutas: Record<
    string,
    {
      name: string;
      days: number | null;
      nights: number | null;
      stages: number | null;
      km: number | null;
      modality: string;
      prices?: Record<string, number>;
    }
  > = {};
  for (const r of routes || []) {
    const prices = porRuta.get(r.id);
    const completa = !!prices && MODALIDADES.every((m) => (prices[m] ?? 0) > 0);
    rutas[r.slug] = {
      name: r.name,
      days: r.days,
      nights: r.nights,
      stages: r.stages,
      km: r.km === null ? null : Number(r.km),
      modality: r.modality ?? "senderismo",
      // Sin las 4 tarifas no viaja ningún precio: la web la cotiza a medida.
      ...(completa ? { prices } : {}),
    };
  }

  const opcionales = (optionals || [])
    .filter((o) => Number(o.price_cs) > 0)
    .map((o) => ({
      name: o.name,
      unit: o.unit || "por persona",
      price: Number(o.price_cs),
    }));

  const season = (seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS;
  const rangos = Object.values(season.easter.dates_by_year || {}).map((d) => [d.from, d.to]);

  return Response.json({
    ok: true,
    generated_at: new Date().toISOString(),
    catalog: 2, // Versión del payload: 2 = catálogo completo (rutas sin precio incluidas + opcionales).
    seasons: {
      alta: {
        etiqueta: season.high_season.name,
        suplemento: season.high_season.price_cs,
        meses: season.high_season.months,
      },
      semana_santa: {
        etiqueta: season.easter.name,
        suplemento: season.easter.price_cs,
        rangos,
      },
    },
    routes: rutas,
    optionals: opcionales,
  });
}
