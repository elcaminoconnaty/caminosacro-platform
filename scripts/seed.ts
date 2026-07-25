/**
 * Seed inicial — Camino Sacro
 *
 * Lee xlsx + PDFs locales y popula schema `comercial` en Supabase.
 * Idempotente: usa upsert por slug/code/path para que se pueda correr múltiples veces.
 *
 * Uso:
 *   1. Aplicar primero la migración 0001_init_comercial.sql
 *   2. Agregar `comercial` a Supabase Dashboard → Settings → API → Exposed schemas
 *   3. Pegar SUPABASE_SERVICE_ROLE_KEY en .env.local
 *   4. cd app && npx tsx scripts/seed.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";

// Load .env.local (Next convention) explicitly because tsx is outside Next runtime.
loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { carpetaCotizacion } from "../src/lib/storage/paths";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const MASTER_XLSX = path.join(PROJECT_ROOT, "camino_sacro_catalogo_master.xlsx");
const PILGRIM_XLSX = path.join(PROJECT_ROOT, "precios_pilgrim.xlsx");
const ABRIL_DIR = path.join(PROJECT_ROOT, "Abril ");
const WELCOME_DIR = path.join(PROJECT_ROOT, "Carta de Bienvenida");
const CATALOGS_DIR = path.join(PROJECT_ROOT, "Catalogos PDF");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "comercial" },
});
const storageClient = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
}); // default schema for storage RPC

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const MODALITIES = [
  { col: "Pensión doble", slug: "pension_doble" },
  { col: "Pensión single", slug: "pension_single" },
  { col: "Hotel doble", slug: "hotel_doble" },
  { col: "Hotel single", slug: "hotel_single" },
] as const;

type CatalogRow = {
  Ruta?: string;
  Origen?: string;
  Destino?: string;
  Días?: number;
  Noches?: number;
  Etapas?: number;
  Km?: number;
  Modalidad?: string;
  Dificultad?: string;
} & Record<string, unknown>;

function readSheet<T = Record<string, unknown>>(file: string, sheetName: string, headerRow: number): T[] {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet '${sheetName}' not found in ${file}`);
  return XLSX.utils.sheet_to_json<T>(ws, { range: headerRow });
}

function isNumericPrice(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const log = (msg: string) => console.log(`  ${msg}`);

// ============================================================
async function seedRoutes(): Promise<Map<string, string>> {
  console.log("\n→ Rutas + etapas + pricing CS");
  const rows = readSheet<CatalogRow>(MASTER_XLSX, "Catálogo y Precios", 4);
  const slugById = new Map<string, string>(); // ruta name → route id

  for (const r of rows) {
    const name = (r.Ruta || "").toString().trim();
    if (!name || name === "SUPLEMENTOS" || name.startsWith("Temporada") || name.startsWith("Semana")) continue;

    const slug = slugify(name);
    const modality = (r.Modalidad?.toString() || "A pie").toLowerCase().includes("bici") ? "bici" : "senderismo";
    const { data: route, error } = await supabase
      .from("routes")
      .upsert(
        {
          slug,
          name,
          origin: r.Origen?.toString() ?? null,
          destination: r.Destino?.toString() ?? null,
          days: typeof r.Días === "number" ? r.Días : null,
          nights: typeof r.Noches === "number" ? r.Noches : null,
          stages: typeof r.Etapas === "number" ? r.Etapas : null,
          km: typeof r.Km === "number" ? r.Km : null,
          modality,
          difficulty: r.Dificultad?.toString() ?? null,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (error) throw error;
    slugById.set(name, route!.id);

    for (const m of MODALITIES) {
      const v = r[m.col];
      if (!isNumericPrice(v)) continue;
      await supabase
        .from("pricing")
        .upsert(
          {
            route_id: route!.id,
            modality: m.slug,
            season: "regular",
            valid_from: null,
            price_cs: v,
          },
          { onConflict: "route_id,modality,season,valid_from" },
        );
    }
    log(`✓ ${name}`);
  }
  return slugById;
}

// ============================================================
async function seedPilgrimPrices(slugById: Map<string, string>) {
  console.log("\n→ Precios Pilgrim");
  const rows = readSheet<CatalogRow>(PILGRIM_XLSX, "Rutas — Precios Pilgrim", 3);
  for (const r of rows) {
    const name = (r.Ruta || "").toString().trim();
    if (!name || name === "SUPLEMENTOS DE TEMPORADA" || name.startsWith("Temporada") || name.startsWith("Semana")) continue;
    const routeId = slugById.get(name);
    if (!routeId) {
      log(`! Ruta no encontrada en master: ${name}`);
      continue;
    }
    for (const m of MODALITIES) {
      const v = r[m.col];
      if (!isNumericPrice(v)) continue;
      const { data: existing } = await supabase
        .from("pricing")
        .select("id")
        .eq("route_id", routeId)
        .eq("modality", m.slug)
        .eq("season", "regular")
        .is("valid_from", null)
        .maybeSingle();
      if (existing) {
        await supabase.from("pricing").update({ price_pilgrim: v }).eq("id", existing.id);
      } else {
        await supabase.from("pricing").insert({
          route_id: routeId,
          modality: m.slug,
          season: "regular",
          price_pilgrim: v,
        });
      }
    }
    log(`✓ ${name}`);
  }
}

// ============================================================
async function seedOptionalServices() {
  console.log("\n→ Servicios opcionales");
  // Master xlsx: una sola tabla con precios CS y Pilgrim alineados
  const wb = XLSX.readFile(MASTER_XLSX);
  const ws = wb.Sheets["Servicios Opcionales"];
  const rows = XLSX.utils.sheet_to_json<{ Servicio?: string; Unidad?: string; "Precio Pilgrim"?: number; "Precio Camino Sacro"?: number }>(ws, { range: 3 });

  let category = "general";
  const categoryNames: Record<string, string> = {
    SEGUROS: "seguro",
    "ALOJAMIENTO EXTRA": "noche_extra",
    COMIDAS: "meal",
    TRASLADOS: "transfer",
    TOURS: "tour",
    GASTRONOMÍA: "gift",
  };

  for (const r of rows) {
    const name = (r.Servicio || "").toString().trim();
    if (!name) continue;
    if (categoryNames[name]) {
      category = categoryNames[name];
      continue;
    }
    if (!r["Precio Pilgrim"] && !r["Precio Camino Sacro"]) continue;
    const slug = slugify(name);
    await supabase
      .from("optional_services")
      .upsert(
        {
          slug,
          category,
          name,
          unit: (r.Unidad || "persona").toString(),
          price_pilgrim: r["Precio Pilgrim"] ?? null,
          price_cs: r["Precio Camino Sacro"] ?? null,
        },
        { onConflict: "slug" },
      );
    log(`✓ ${name} (${category})`);
  }
}

// ============================================================
async function seedRouteStages() {
  console.log("\n→ Etapas (itinerarios)");
  const wb = XLSX.readFile(MASTER_XLSX);
  const ws = wb.Sheets["Itinerarios"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];

  const { data: routes } = await supabase.from("routes").select("id,name");
  const routeByName = new Map((routes || []).map((r) => [r.name as string, r.id as string]));

  let currentRouteId: string | null = null;
  for (const row of rows) {
    const first = row[0];
    if (typeof first === "string" && routeByName.has(first.trim())) {
      currentRouteId = routeByName.get(first.trim())!;
      continue;
    }
    if (!currentRouteId) continue;
    const day = typeof first === "number" ? first : null;
    if (day === null) continue;
    const etapa = (row[1] || "").toString();
    const distancia = (row[2] || "").toString();
    const aloj = (row[3] || "").toString();

    let from = "", to = "";
    if (etapa.includes("→")) {
      const [a, b] = etapa.split("→").map((s) => s.trim());
      from = a; to = b;
    } else {
      to = etapa;
    }

    await supabase.from("route_stages").upsert(
      {
        route_id: currentRouteId,
        day,
        from_place: from || null,
        to_place: to || null,
        km: distancia.match(/(\d+(\.\d+)?)/)?.[1] ? Number(distancia.match(/(\d+(\.\d+)?)/)![1]) : null,
        accommodation: aloj === "—" ? null : aloj,
      },
      { onConflict: "route_id,day" },
    );
  }
  log("✓ etapas cargadas");
}

// ============================================================
async function ensureBuckets() {
  console.log("\n→ Storage buckets");
  const buckets = ["comercial-quotes", "comercial-welcome", "comercial-catalogs", "comercial-receipts"];
  for (const name of buckets) {
    const { error } = await storageClient.storage.createBucket(name, { public: false });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      console.error(`  ! ${name}: ${error.message}`);
    } else {
      log(`✓ ${name}`);
    }
  }
}

// `prefix`: carpeta destino dentro del bucket (ver src/lib/storage/paths.ts).
async function uploadDir(
  localDir: string,
  bucket: string,
  prefix: string,
  table?: "welcome_letters" | "route_catalogs",
) {
  if (!fs.existsSync(localDir)) {
    log(`✗ ${localDir} no existe`);
    return;
  }
  const { data: routes } = await supabase.from("routes").select("id,name,slug");
  const routesArr = routes || [];
  const files = fs.readdirSync(localDir).filter((f) => f.endsWith(".pdf"));
  for (const fname of files) {
    const local = path.join(localDir, fname);
    const buf = fs.readFileSync(local);
    const remote = `${prefix}${fname}`;
    const { error } = await storageClient.storage
      .from(bucket)
      .upload(remote, buf, { contentType: "application/pdf", upsert: true });
    if (error) {
      console.error(`  ! ${fname}: ${error.message}`);
      continue;
    }
    if (table) {
      // Best-effort match: route name fragment in filename
      const matched = routesArr.find((r) => {
        const slug = (r.slug as string).replace(/_/g, " ");
        return fname.toLowerCase().includes(slug.split(" ")[0]) || fname.toLowerCase().includes((r.name as string).toLowerCase().split(" ")[0]);
      });
      const tbl = table as string;
      await supabase.from(tbl).upsert(
        {
          route_id: matched?.id ?? null,
          name: fname.replace(/\.pdf$/i, ""),
          storage_path: `${bucket}/${remote}`,
          ...(table === "route_catalogs" ? { source: "pilgrim" } : {}),
        },
        { onConflict: "storage_path" },
      ).select();
    }
    log(`✓ ${bucket}/${fname}${table ? " (vinculado)" : ""}`);
  }
}

// ============================================================
async function seedAprilQuoteStubs() {
  console.log("\n→ Cotizaciones placeholder de Abril");
  if (!fs.existsSync(ABRIL_DIR)) { log(`✗ ${ABRIL_DIR} no existe`); return; }
  const files = fs.readdirSync(ABRIL_DIR).filter((f) => f.endsWith(".pdf"));

  for (const fname of files) {
    // Parse code: CS2026008 → CS-2026-008
    const codeMatch = fname.match(/CS(\d{4})(\d{3})/);
    const code = codeMatch ? `CS-${codeMatch[1]}-${codeMatch[2]}` : fname.replace(/\.pdf$/i, "");

    // Extract client name and route from filename
    let clientName: string | null = null;
    let routeName: string | null = null;
    const m1 = fname.match(/Cotizacion[ _]([A-Za-zÁÉÍÓÚáéíóúÑñ ]+?)[ _-]+(.+?)\.pdf$/);
    const m2 = fname.match(/CS\d{7}\s+Cotizacion\s+(.+?)\s+-\s+(.+?)\.pdf$/);
    if (m2) { clientName = m2[1]; routeName = m2[2]; }
    else if (m1) { clientName = m1[1].replace(/_/g, " "); routeName = m1[2].replace(/_/g, " "); }

    // Upload PDF
    const buf = fs.readFileSync(path.join(ABRIL_DIR, fname));
    const remote = `${carpetaCotizacion(code)}/${code}.pdf`;
    await storageClient.storage.from("comercial-quotes").upload(remote, buf, { contentType: "application/pdf", upsert: true });

    await supabase.from("quotes").upsert(
      {
        code,
        client_name: clientName,
        route_name: routeName,
        status: "enviada",
        pdf_path: `comercial-quotes/${remote}`,
      },
      { onConflict: "code" },
    );
    log(`✓ ${code} — ${clientName ?? "?"}`);
  }
}

// ============================================================
async function seedSettings() {
  console.log("\n→ Settings + plantillas email");
  await supabase.from("settings").upsert([
    { key: "markup_rule", value: { formula: "max(pilgrim+100, pilgrim/0.85)", description: "Regla por defecto para calcular precio CS" } },
    { key: "validity_days", value: { days: 30 } },
    { key: "company", value: { name: "Camino Sacro", website: "https://www.caminosacro.com" } },
    { key: "isabel", value: { connected: false, conversations_table: null, messages_table: null } },
  ]);

  await supabase.from("email_templates").upsert(
    [
      {
        slug: "cotizacion_enviada",
        subject: "Tu Camino con Camino Sacro — Cotización {{code}}",
        body_md: `Hola {{nombre}},

Te comparto la cotización para tu Camino:

- Ruta: **{{ruta}}**
- Fechas: **{{fechas}}**
- Total por persona: **{{total_eur}}** (≈ {{total_cop}} a TRM {{trm}})
- Validez: hasta **{{validez}}**

Adjunto el PDF con todos los detalles. Cualquier pregunta, escribime por aquí.

Buen Camino,
Camino Sacro`,
      },
      {
        slug: "recordatorio_pago",
        subject: "Recordatorio de pago — Cotización {{code}}",
        body_md: `Hola {{nombre}},

Pasaba a recordarte sobre el pago de tu Camino. Saldo pendiente: **{{saldo_eur}}**.

Cualquier cosa me avisás.

Buen Camino,
Camino Sacro`,
      },
    ],
    { onConflict: "slug" },
  );
  log("✓ settings + plantillas");
}

// ============================================================
async function main() {
  console.log("Seed Camino Sacro — schema comercial");
  await seedSettings();
  const slugById = await seedRoutes();
  await seedPilgrimPrices(slugById);
  await seedRouteStages();
  await seedOptionalServices();
  await ensureBuckets();
  await uploadDir(WELCOME_DIR, "comercial-welcome", "cartas-bienvenida/", "welcome_letters");
  await uploadDir(CATALOGS_DIR, "comercial-catalogs", "fichas-de-viaje/", "route_catalogs");
  await seedAprilQuoteStubs();
  console.log("\n✓ Seed completo");
}

main().catch((e) => {
  console.error("\n✗ Error en seed:", e);
  process.exit(1);
});
