import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { autorizadoAgente, noAutorizado } from "../auth";
import { MODALITY_SLUGS, optionalPricesForYear, quoteYear, ratesForYear } from "@/lib/pricing/year";
import { getPilgrimSettings } from "@/lib/quotes/pilgrimEmail";

export const dynamic = "force-dynamic";

/**
 * GET /api/agente/catalogo?year=YYYY — lo que BayMax necesita para cotizar.
 *
 * Se parece a /api/wp/pricing pero es de uso interno, y por eso difiere en dos
 * cosas: incluye TODAS las rutas activas (también las que no están publicadas en
 * la web) y sí trae `price_pilgrim`, porque quien lee es Nico a través del agente,
 * no un visitante.
 *
 * Cada ruta viaja con `years`: los años que tienen las dos tarifas (doble e
 * individual) realmente cargadas, por tipo de alojamiento. Es lo que le permite a
 * BayMax decir "esa salida es de 2027 y todavía no hay tarifa de hotel" en vez de
 * cotizar con el precio del año pasado.
 */
export async function GET(request: Request) {
  if (!autorizadoAgente(request)) return noAutorizado();

  const url = new URL(request.url);
  const year = quoteYear(null, new Date());
  const anoPedido = Number(url.searchParams.get("year")) || year;

  const supabase = createAdminClient("comercial");
  const [{ data: routes, error: rErr }, { data: pricing, error: pErr }, { data: optionals, error: oErr }, { data: seasonSetting }] =
    await Promise.all([
      supabase
        .from("routes")
        .select("id,slug,name,days,nights,stages,km,web")
        .eq("active", true)
        .order("days", { ascending: true, nullsFirst: false }),
      supabase.from("pricing").select("route_id,modality,year,price_cs,price_pilgrim").eq("season", "regular"),
      supabase
        .from("optional_services")
        .select("id,name,unit,category,optional_prices(year,price_pilgrim,price_cs)")
        .eq("active", true)
        .order("category")
        .order("name"),
      supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
    ]);
  if (rErr || pErr || oErr) return Response.json({ ok: false, error: "interno" }, { status: 500 });

  type FilaPrecio = { route_id: string; modality: string; year: number | null; price_cs: number | string | null; price_pilgrim: number | string | null };
  const todas = (pricing || []) as FilaPrecio[];

  const rutas = (routes || []).map((r) => {
    const propias = todas.filter((p) => p.route_id === r.id);
    const delAno = ratesForYear(propias, anoPedido);

    // Un año "sirve" para un tipo de alojamiento solo si tiene sus DOS tarifas:
    // con media no se puede repartir un grupo impar.
    const anos: Record<"pension" | "hotel", number[]> = { pension: [], hotel: [] };
    for (const tipo of ["pension", "hotel"] as const) {
      const candidatos = [...new Set(propias.map((p) => Number(p.year ?? 2026)))].sort();
      anos[tipo] = candidatos.filter((y) =>
        [`${tipo}_doble`, `${tipo}_single`].every((m) =>
          propias.some((p) => Number(p.year ?? 2026) === y && p.modality === m && (Number(p.price_cs) || 0) > 0),
        ),
      );
    }

    return {
      slug: r.slug,
      nombre: r.name,
      dias: r.days,
      noches: r.nights,
      etapas: r.stages,
      km: r.km,
      en_web: r.web,
      years: anos,
      tarifas: Object.fromEntries(
        MODALITY_SLUGS.map((m) => {
          const f = delAno.find((p) => p.modality === m);
          return [m, f ? { price_cs: Number(f.price_cs) || 0, price_pilgrim: Number(f.price_pilgrim) || 0 } : null];
        }),
      ),
    };
  });

  const filasOpc = (optionals || []).flatMap((o) =>
    ((o.optional_prices || []) as Array<{ year: number; price_pilgrim: number | string | null; price_cs: number | string | null }>).map((p) => ({
      optional_id: o.id as string,
      year: Number(p.year),
      price_pilgrim: Number(p.price_pilgrim) || 0,
      price_cs: Number(p.price_cs) || 0,
    })),
  );
  const preciosOpc = optionalPricesForYear(filasOpc, anoPedido);
  const opcionales = (optionals || [])
    .map((o) => {
      const precio = preciosOpc.get(o.id as string);
      if (!precio) return null;
      return {
        id: o.id,
        nombre: o.name,
        unidad: o.unit,
        categoria: o.category,
        price_cs: precio.price_cs,
        price_pilgrim: precio.price_pilgrim,
        ano_precio: precio.priceYear,
        es_de_otro_ano: precio.isFallback,
      };
    })
    .filter(Boolean);

  const temporadas = (seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS;
  const pilgrim = await getPilgrimSettings(supabase);

  return Response.json({ ok: true, year: anoPedido, rutas, opcionales, temporadas, pilgrim });
}
