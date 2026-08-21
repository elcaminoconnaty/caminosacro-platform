/**
 * Siembra la flota de bicicletas y su catálogo de tarifas (migración 0021).
 *
 * Es idempotente: se puede correr las veces que sea.
 *   - `comercial.bikes` se hace upsert por slug (la ficha se actualiza al valor de data.ts).
 *   - `comercial.bike_prices` crea la fila (bici × ruta × año) SOLO si falta. Nunca pisa un
 *     precio ya cargado, para no borrar lo que Nico haya tecleado a mano.
 *   - Los opcionales de equipo de bici se crean si faltan; su precio del año tampoco se pisa.
 *
 * Uso: npx tsx scripts/seed_bicis.ts
 */
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { BIKES, TARIFAS_2026_PONFERRADA, precioCS } from "../src/lib/bikes/data";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("✗ Falta env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "comercial" },
});

/** Años del catálogo que se crean de una vez. 2027 va vacío a propósito: ver GUIA.md. */
const YEARS = [2026, 2027];

/**
 * Ruta cuyas tarifas Pilgrim conocemos (cotización C677157). Las demás rutas de bici se
 * crean con la fila pero sin precio, para que el CRM avise en ámbar en vez de inventar.
 */
const RUTA_CON_TARIFAS = "frances_bici_ponferrada";

/**
 * Días de alquiler que cubre la tarifa en cada ruta. Es informativo (sale en la ficha
 * del PDF) y es lo que hay que decirle a Pilgrim al pedir precio para las otras dos.
 */
const DIAS_ALQUILER: Record<string, number> = {
  frances_bici_ponferrada: 5,
  portugues_bici_oporto: 6,
  primitivo_bici_oviedo: 8,
};

/**
 * Extras de la cotización C677157 que solo tienen sentido con bicicleta y cuyo precio NO
 * depende de la ruta (son planos), así que van como servicios opcionales normales.
 * Precio CS = Pilgrim × 1,30, la regla que ya usa el resto de comercial.optional_services.
 */
const OPCIONALES_BICI = [
  {
    slug: "casco_bicicleta",
    category: "equipo_bici",
    name: "Casco de bicicleta",
    unit: "por persona",
    price_pilgrim: 40,
    notas: "Casco a estrenar, talla S/M/L. Uso obligatorio en vías interurbanas.",
  },
  {
    slug: "seguro_todo_riesgo_bici",
    category: "equipo_bici",
    name: "Seguro a todo riesgo para la bicicleta",
    unit: "por persona",
    price_pilgrim: 32,
    notas:
      "Cubre daños por accidente o caída y robo con la bici inmovilizada; defensa jurídica hasta 1.500 € y responsabilidad civil hasta 200.000 €.",
  },
] as const;

// El dossier de Pilgrim trae además maillots y otra ropa de ciclismo. NO se cargan: acá
// solo entra el alquiler de la bicicleta y lo que hace falta para rodarla (casco, seguro).
// La ropa es mercancía de Pilgrim, no parte de nuestro servicio.

const MARGEN_OPCIONALES = 1.3;

async function main() {
  // ---------- 1. Flota ----------
  const bikeIds = new Map<string, string>();
  for (const b of BIKES) {
    const { data, error } = await supabase
      .from("bikes")
      .upsert(
        {
          slug: b.slug,
          position: b.position,
          name: b.name,
          category_label: b.category_label,
          pilgrim_service: b.pilgrim_service,
          tagline: b.tagline,
          description: b.description,
          ideal_para: b.ideal_para,
          sizes: b.sizes,
          sizes_note: b.sizes_note,
          wheels: b.wheels,
          luggage: b.luggage,
          specs: b.specs,
          motor: b.motor,
          electric: b.electric,
          photo: b.photo,
          active: true,
        },
        { onConflict: "slug" },
      )
      .select("id,slug")
      .single();
    if (error) {
      console.error(`✗ bici ${b.slug}:`, error.message);
      process.exit(1);
    }
    bikeIds.set(data.slug, data.id);
    console.log(`✓ bici ${b.slug} — ${b.name}`);
  }

  // ---------- 2. Rutas de bici ----------
  const { data: rutas, error: rutaErr } = await supabase
    .from("routes")
    .select("id,slug,name")
    .eq("modality", "bici")
    .eq("active", true);
  if (rutaErr) {
    console.error("✗ rutas:", rutaErr.message);
    process.exit(1);
  }
  if (!rutas?.length) {
    console.error("✗ No hay rutas con modality='bici'. Cargalas antes con scripts/add_routes.ts.");
    process.exit(1);
  }
  console.log(`\n${rutas.length} rutas de bici: ${rutas.map((r) => r.slug).join(", ")}\n`);

  // ---------- 3. Tarifas bici × ruta × año ----------
  const { data: yaCargadas } = await supabase
    .from("bike_prices")
    .select("bike_id,route_id,year");
  const existentes = new Set((yaCargadas || []).map((p) => `${p.bike_id}|${p.route_id}|${p.year}`));

  const filas: Array<Record<string, unknown>> = [];
  for (const ruta of rutas) {
    const dias = DIAS_ALQUILER[ruta.slug] ?? null;
    for (const b of BIKES) {
      const bikeId = bikeIds.get(b.slug)!;
      for (const year of YEARS) {
        if (existentes.has(`${bikeId}|${ruta.id}|${year}`)) continue;
        // Solo Ponferrada 2026 tiene tarifa real (cotización C677157). El resto va vacío.
        const pilgrim =
          ruta.slug === RUTA_CON_TARIFAS && year === 2026 ? TARIFAS_2026_PONFERRADA[b.slug] : null;
        filas.push({
          bike_id: bikeId,
          route_id: ruta.id,
          year,
          days: dias,
          price_pilgrim: pilgrim,
          price_cs: pilgrim != null ? precioCS(pilgrim) : null,
          notes:
            pilgrim != null
              ? "Tarifa Pilgrim de la cotización C677157 (21-08-2026). Precio CS = Pilgrim ÷ 0,85."
              : "Sin tarifa cargada: pedírsela a Pilgrim para esta ruta y este año.",
        });
      }
    }
  }

  if (filas.length) {
    const { error } = await supabase.from("bike_prices").insert(filas);
    if (error) {
      console.error("✗ tarifas:", error.message);
      process.exit(1);
    }
  }
  const conPrecio = filas.filter((f) => f.price_pilgrim != null).length;
  console.log(
    `✓ tarifas: ${filas.length} filas nuevas (${conPrecio} con precio, ${filas.length - conPrecio} por cargar)`,
  );

  // ---------- 4. Opcionales de equipo de bici ----------
  for (const o of OPCIONALES_BICI) {
    const { data: srv, error } = await supabase
      .from("optional_services")
      .upsert(
        { slug: o.slug, category: o.category, name: o.name, unit: o.unit, active: true },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (error) {
      console.error(`✗ opcional ${o.slug}:`, error.message);
      process.exit(1);
    }
    for (const year of YEARS) {
      const { data: ya } = await supabase
        .from("optional_prices")
        .select("id")
        .eq("optional_id", srv.id)
        .eq("year", year)
        .maybeSingle();
      if (ya) continue;
      // 2026 con la tarifa de la cotización C677157; 2027 vacío, igual que las rutas.
      await supabase.from("optional_prices").insert({
        optional_id: srv.id,
        year,
        price_pilgrim: year === 2026 ? o.price_pilgrim : null,
        price_cs: year === 2026 ? Math.round(o.price_pilgrim * MARGEN_OPCIONALES) : null,
      });
    }
    console.log(`✓ opcional ${o.slug} — ${o.name}`);
  }

  console.log("\nListo. Revisá /catalogo → pestaña Bicicletas.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
