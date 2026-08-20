import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { autorizado, noAutorizado } from "../auth";
import { CATALOG_BASE_YEAR, catalogYears, optionalPricesForYear, ratesForYearWithFallback } from "@/lib/pricing/year";

export const dynamic = "force-dynamic";

const MODALIDADES = ["pension_doble", "hotel_doble", "pension_single", "hotel_single"] as const;

/**
 * GET /api/wp/pricing — catálogo para el cotizador de caminosacro.com.
 *
 * El CRM es la fuente de verdad del cotizador público: aquí viajan solo las
 * rutas activas con "Visible en cotizador web" (routes.web) marcado — las
 * personalizadas/internas quedan fuera. Las rutas con sus 4 tarifas completas
 * llevan `prices` y cotizan al instante; las demás van sin `prices` y la web
 * las deriva a WhatsApp como cotización a medida. Desmarcar el check (o
 * desactivar la ruta) en el CRM la saca de la web.
 *
 * Devuelve solo price_cs (venta); price_pilgrim jamás sale de la plataforma.
 * WordPress lo cachea 6 horas y usa el último payload bueno si esto no responde.
 *
 * `?year=` elige el año de tarifa (migración 0017). Sin el parámetro responde el año en
 * curso, igual que antes de tener catálogo por año. Si el año pedido todavía no tiene
 * tarifas cargadas cae al año cargado más reciente y lo marca en `is_fallback`, para que
 * la web pueda mostrar "precio sujeto a confirmación". La forma del payload no cambia.
 *
 * Aparte de eso, cada ruta viaja SIEMPRE con `years`: los años que tienen tarifa real
 * cargada, separados por tipo de alojamiento. No depende de `?year=`, y es lo que le
 * permite a la web decidir si la fecha que eligió el visitante se puede cotizar o si hay
 * que avisarle que todavía no hay precios oficiales de ese año.
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
      .eq("web", true)
      .order("days", { ascending: true, nullsFirst: false }),
    supabase.from("pricing").select("route_id,modality,year,price_cs").eq("season", "regular"),
    supabase
      .from("optional_services")
      .select("id,name,unit,category,optional_prices(year,price_pilgrim,price_cs)")
      .eq("active", true)
      .order("category")
      .order("name"),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
  ]);
  if (rErr || pErr || oErr) {
    return Response.json({ ok: false, error: "interno" }, { status: 500 });
  }

  const years = catalogYears();
  const pedido = Number(new URL(request.url).searchParams.get("year"));
  const yearPedido = years.includes(pedido) ? pedido : new Date().getFullYear();

  // El fallback se resuelve por ruta: puede haber rutas con tarifas del año pedido y otras
  // que todavía solo tengan las del anterior.
  const filas = (pricing || []) as Array<{ route_id: string; modality: string; year: number | null; price_cs: number | string | null }>;
  const porRutaTodas = new Map<string, typeof filas>();
  for (const p of filas) {
    if ((Number(p.price_cs) || 0) <= 0) continue;
    if (!porRutaTodas.has(p.route_id)) porRutaTodas.set(p.route_id, []);
    porRutaTodas.get(p.route_id)!.push(p);
  }

  // Años con tarifa REAL cargada, por ruta y por tipo de alojamiento. Se calcula sobre
  // todas las filas, ANTES de que el fallback las reemplace por las del año anterior: es
  // lo que el cotizador de la web necesita para saber si la fecha que eligió el visitante
  // tiene precio oficial o hay que derivarla a Nico. Un tipo solo cuenta si tiene sus DOS
  // tarifas (doble e individual): con media tarifa no se puede repartir un grupo impar.
  const aniosPorRuta = new Map<string, { pension: number[]; hotel: number[] }>();
  for (const [routeId, rows] of porRutaTodas) {
    const porAnio = new Map<number, Set<string>>();
    for (const p of rows) {
      const y = Number(p.year ?? CATALOG_BASE_YEAR);
      if (!porAnio.has(y)) porAnio.set(y, new Set());
      porAnio.get(y)!.add(p.modality);
    }
    const anios = { pension: [] as number[], hotel: [] as number[] };
    for (const [y, mods] of [...porAnio].sort((a, b) => a[0] - b[0])) {
      if (mods.has("pension_doble") && mods.has("pension_single")) anios.pension.push(y);
      if (mods.has("hotel_doble") && mods.has("hotel_single")) anios.hotel.push(y);
    }
    aniosPorRuta.set(routeId, anios);
  }

  const porRuta = new Map<string, Record<string, number>>();
  const fallbackPorRuta = new Map<string, number>(); // route_id -> año realmente usado
  for (const [routeId, rows] of porRutaTodas) {
    const elegidas = ratesForYearWithFallback(rows, yearPedido);
    if (elegidas.rows.length === 0) continue;
    if (elegidas.isFallback) fallbackPorRuta.set(routeId, elegidas.year);
    const mapa: Record<string, number> = {};
    for (const p of elegidas.rows) mapa[p.modality] = Number(p.price_cs) || 0;
    porRuta.set(routeId, mapa);
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
      /** Presente solo si las tarifas de esta ruta son de un año anterior al pedido. */
      prices_year?: number;
      /**
       * Años con tarifa real cargada en el CRM, por tipo de alojamiento. Independiente
       * de `?year=`: la web cotiza una salida solo si su año está en esta lista.
       */
      years: { pension: number[]; hotel: number[] };
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
      years: aniosPorRuta.get(r.id) ?? { pension: [], hotel: [] },
      // Sin las 4 tarifas no viaja ningún precio: la web la cotiza a medida.
      ...(completa ? { prices } : {}),
      ...(completa && fallbackPorRuta.has(r.id) ? { prices_year: fallbackPorRuta.get(r.id) } : {}),
    };
  }

  // Opcionales al precio del año pedido, con la misma caída al año anterior que las rutas.
  type OptionalRaw = {
    id: string;
    name: string;
    unit: string | null;
    category: string;
    optional_prices: Array<{ year: number; price_pilgrim: number | string | null; price_cs: number | string | null }> | null;
  };
  const optionalRows = (optionals || []) as OptionalRaw[];
  const preciosOpcionales = optionalPricesForYear(
    optionalRows.flatMap((o) => (o.optional_prices || []).map((p) => ({
      optional_id: o.id,
      year: Number(p.year),
      price_pilgrim: Number(p.price_pilgrim) || 0,
      price_cs: Number(p.price_cs) || 0,
    }))),
    yearPedido,
  );
  const opcionales = optionalRows
    .map((o) => {
      const precio = preciosOpcionales.get(o.id);
      return {
        name: o.name,
        unit: o.unit || "por persona",
        price: precio?.price_cs ?? 0,
        // Presente solo si el precio viene de un año anterior al pedido.
        ...(precio?.isFallback ? { price_year: precio.priceYear } : {}),
      };
    })
    .filter((o) => o.price > 0);

  const season = (seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS;
  const rangos = Object.values(season.easter.dates_by_year || {}).map((d) => [d.from, d.to]);

  return Response.json({
    ok: true,
    generated_at: new Date().toISOString(),
    catalog: 3, // Versión del payload: 2 = catálogo completo; 3 = + `years` por ruta y tipo.
    year: yearPedido,
    // true si alguna ruta u opcional viaja con precios de un año anterior al pedido.
    is_fallback: fallbackPorRuta.size > 0 || [...preciosOpcionales.values()].some((p) => p.isFallback),
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
