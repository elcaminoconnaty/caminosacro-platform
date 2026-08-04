/**
 * Siembra cotizaciones de prueba para ensayar el correo a Pilgrim y los contratos
 * por viajero con distintos tamaños de grupo: 1, 2, 3 y 20 personas.
 *
 * Los viajeros se crean con direcciones `tucorreo+vN@dominio`. Gmail (y la mayoría
 * de proveedores) ignora todo lo que va después del `+`, así que los 20 contratos
 * salen a 20 direcciones distintas —cada una con su token y su enlace de firma— pero
 * te llegan todos a la misma bandeja. Así se prueba el caso real de 20 firmantes
 * separados sin escribirle a nadie.
 *
 * Uso:
 *   cd app && npx tsx scripts/seed_pruebas.ts tucorreo@gmail.com
 *   cd app && npx tsx scripts/seed_pruebas.ts --limpiar
 *
 * Idempotente: vuelve a sembrar desde cero cada vez (borra las CS-TEST-* previas).
 * `--limpiar` las borra sin sembrar; el ON DELETE CASCADE se lleva viajeros,
 * contratos, líneas y pagos.
 */
import * as path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { CATALOG_BASE_YEAR } from "../src/lib/pricing/year";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const LIMPIAR = process.argv.includes("--limpiar");
const CORREO = process.argv.slice(2).find((a) => a.includes("@")) ?? "";

if (!LIMPIAR && !CORREO) {
  console.error("Falta tu correo. Uso: npx tsx scripts/seed_pruebas.ts tucorreo@gmail.com");
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { db: { schema: "comercial" } } as any);

/** "nico@gmail.com" + 3 → "nico+v3@gmail.com" */
function alias(correo: string, n: number): string {
  const [usuario, dominio] = correo.split("@");
  return `${usuario}+v${n}@${dominio}`;
}

const NOMBRES = [
  "Ana Restrepo", "Carlos Mejía", "Beatriz Ospina", "Daniel Arango", "Elena Vélez",
  "Felipe Zapata", "Gloria Muñoz", "Héctor Cardona", "Irene Salazar", "Jorge Betancur",
  "Karina Duque", "Luis Gómez", "Marta Jaramillo", "Néstor Ríos", "Olga Ceballos",
  "Pablo Henao", "Quenia Torres", "Ramiro Uribe", "Sofía Londoño", "Tomás Escobar",
];

const CASOS = [
  { code: "CS-TEST-01", personas: 1, modality: "Pensión single", dobles: 0, individuales: 1 },
  { code: "CS-TEST-02", personas: 2, modality: "Pensión doble", dobles: 1, individuales: 0 },
  { code: "CS-TEST-03", personas: 3, modality: "Pensión · 1 doble + 1 individual", dobles: 1, individuales: 1 },
  { code: "CS-TEST-20", personas: 20, modality: "Pensión doble", dobles: 10, individuales: 0 },
];

async function limpiar() {
  const { data: previas } = await db.from("quotes").select("id,code").like("code", "CS-TEST-%");
  if (!previas?.length) {
    console.log("No hay cotizaciones de prueba que borrar.");
    return;
  }
  const { error } = await db.from("quotes").delete().in("id", previas.map((q) => q.id));
  if (error) throw error;
  console.log(`Borradas ${previas.length}: ${previas.map((q) => q.code).join(", ")}`);
}

async function main() {
  await limpiar();
  if (LIMPIAR) return;

  // Ruta y tarifas reales del catálogo, para que los precios Pilgrim del correo
  // sean los de verdad y la prueba valga.
  const { data: ruta } = await db
    .from("routes")
    .select("id,name")
    .eq("name", "Francés desde Sarria")
    .maybeSingle();
  if (!ruta) throw new Error("No encontré la ruta 'Francés desde Sarria' en el catálogo.");

  const { data: tarifas } = await db
    .from("pricing")
    .select("modality,price_cs,price_pilgrim")
    .eq("route_id", ruta.id)
    .eq("season", "regular")
    .eq("year", CATALOG_BASE_YEAR);
  const tarifa = (slug: string) => tarifas?.find((t) => t.modality === slug);
  const doble = tarifa("pension_doble");
  const single = tarifa("pension_single");
  if (!doble || !single) throw new Error("Faltan tarifas pension_doble / pension_single para esa ruta.");

  const { data: supSetting } = await db.from("settings").select("value").eq("key", "season_supplements").maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alta = (supSetting?.value as any)?.high_season ?? { price_cs: 80, price_pilgrim: 50 };

  // Salida en temporada alta (agosto) para que el suplemento entre en el cálculo.
  const inicio = "2026-08-10";
  const fin = "2026-08-16";

  // Dos opcionales de naturaleza distinta a propósito: uno por noche (cantidad fija)
  // y otro por persona (cantidad × pax), para que el correo a Pilgrim ejercite las
  // dos formas de multiplicar en los cuatro tamaños de grupo.
  const { data: opcionales } = await db
    .from("optional_services")
    .select("id,name,unit,optional_prices!inner(year,price_cs,price_pilgrim)")
    .eq("active", true)
    .eq("optional_prices.year", CATALOG_BASE_YEAR)
    .in("slug", ["noche_extra_pension", "cobertura_de_anulacion_basica"]);

  for (const caso of CASOS) {
    const enDoble = caso.dobles * 2;
    const baseEur = enDoble * Number(doble.price_cs) + caso.individuales * Number(single.price_cs);
    const costBase = enDoble * Number(doble.price_pilgrim) + caso.individuales * Number(single.price_pilgrim);
    const suppCs = Number(alta.price_cs) * caso.personas;
    const suppPilgrim = Number(alta.price_pilgrim) * caso.personas;

    const { data: quote, error } = await db
      .from("quotes")
      .insert({
        code: caso.code,
        client_name: `${NOMBRES[0]} (PRUEBA ${caso.personas}p)`,
        client_email: alias(CORREO, 1),
        client_phone: "+57 300 000 0000",
        route_id: ruta.id,
        route_name: ruta.name,
        start_date: inicio,
        end_date: fin,
        valid_until: "2026-12-31",
        people: caso.personas,
        modality: caso.modality,
        base_eur: baseEur,
        season_supplement_eur: suppCs,
        season_kind: "high_season",
        cost_base_eur: costBase,
        season_supplement_cost_eur: suppPilgrim,
        status: "pago_completo",
        source: "interna",
        notes: "COTIZACIÓN DE PRUEBA — creada por scripts/seed_pruebas.ts",
        rooms_json: {
          tipo: "pension",
          dobles: caso.dobles,
          individuales: caso.individuales,
          tarifa_doble: Number(doble.price_cs),
          tarifa_single: Number(single.price_cs),
        },
      })
      .select("id")
      .single();
    if (error) throw error;

    // Opcionales: cantidad por persona donde aplique, igual que toggleQuoteOptional.
    for (const o of opcionales ?? []) {
      const porPersona = (o.unit || "").toLowerCase().includes("persona");
      const precio = (o.optional_prices ?? [])[0];
      await db.from("quote_lines").insert({
        quote_id: quote.id,
        type: "optional",
        description: `${o.name} (${o.unit})`,
        quantity: porPersona ? caso.personas : 1,
        unit_price: Number(precio?.price_cs) || 0,
        cost_unit: Number(precio?.price_pilgrim) || 0,
        reference_id: o.id,
      });
    }

    // Deja que la BD calcule total_eur y cost_eur con la fórmula real.
    await db.rpc("recompute_quote_total", { p_quote_id: quote.id });

    // Viajeros: el titular ya lo crea nadie aquí, así que los insertamos todos.
    const viajeros = [];
    for (let p = 1; p <= caso.personas; p++) {
      viajeros.push({
        quote_id: quote.id,
        position: p,
        full_name: NOMBRES[(p - 1) % NOMBRES.length],
        email: alias(CORREO, p),
        phone: p === 1 ? "+57 300 000 0000" : null,
        is_holder: p === 1,
      });
    }
    const { error: vErr } = await db.from("quote_travelers").insert(viajeros);
    if (vErr) throw vErr;

    const { data: fresca } = await db
      .from("quotes")
      .select("total_eur,cost_eur")
      .eq("id", quote.id)
      .maybeSingle();

    console.log(
      `${caso.code}: ${caso.personas} pax · total ${fresca?.total_eur} € · ` +
        `costo Pilgrim ${fresca?.cost_eur} € · utilidad ${(Number(fresca?.total_eur) - Number(fresca?.cost_eur)).toFixed(2)} € · ` +
        `${viajeros.length} viajero(s)`,
    );
  }

  const [usuario, dominio] = CORREO.split("@");
  console.log(`\nListo. Los viajeros quedaron como ${usuario}+v1@${dominio} … ${usuario}+vN@${dominio} (todos llegan a ${CORREO}).`);
  console.log("Abre /seguimiento, entra a cada CS-TEST-*, crea los contratos y prueba los envíos con el modo prueba activo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
