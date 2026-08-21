/**
 * Genera el catálogo comercial de bicicletas en PDF (sin precios) y lo publica en Storage.
 *
 * Es el dossier que se le manda al peregrino cuando pregunta por el Camino en bici: la flota
 * con su ficha técnica, el equipamiento, la tabla de tallas y las condiciones del alquiler.
 * NO lleva tarifas a propósito — el precio va en la cotización, que sí depende de ruta y año.
 *
 * La ficha sale de `comercial.bikes` (no de data.ts): así, cuando Nico corrige una descripción
 * desde /catalogo, regenerar el PDF alcanza para que el documento quede al día.
 *
 * Uso:
 *   npx tsx scripts/generar_catalogo_bicis.ts              (genera y sube a Storage)
 *   npx tsx scripts/generar_catalogo_bicis.ts --solo-local (solo el archivo local)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { BIKE_COLUMNS, normalizeBike, type BikeRow } from "../src/lib/bikes/catalog";
import { BikeCatalogPDF } from "../src/lib/bikes/catalogPdf";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const soloLocal = process.argv.includes("--solo-local");

const APP_DIR = path.resolve(__dirname, "..");
const BIKES_DIR = path.join(APP_DIR, "src/lib/bikes");
const OUT_DIR = path.join(APP_DIR, "scripts/out");
const OUT_FILE = "catalogo-bicicletas-camino-sacro.pdf";
const BUCKET = "comercial-catalogs";
const REMOTE_PATH = `bicicletas/${OUT_FILE}`;

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
// El cliente de Storage va contra el schema por defecto: `db.schema: "comercial"` rompe sus RPC.
const storage = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await supabase
    .from("bikes")
    .select(BIKE_COLUMNS)
    .eq("active", true)
    .order("position", { ascending: true });
  if (error) {
    console.error("✗ No se pudo leer comercial.bikes:", error.message);
    process.exit(1);
  }

  const bikes: BikeRow[] = (data ?? []).map((r) => normalizeBike(r as unknown as Record<string, unknown>));
  if (bikes.length === 0) {
    console.error("✗ No hay bicicletas activas. Corré antes `npx tsx scripts/seed_bicis.ts`.");
    process.exit(1);
  }

  // Las fotos viven en el repo, no en Storage: son parte del diseño del documento igual que
  // las fuentes. Una bici sin foto no aborta el catálogo, solo sale sin imagen.
  const photos: Record<string, Buffer> = {};
  for (const b of bikes) {
    if (!b.photo) {
      console.warn(`  ! ${b.slug}: sin campo photo, la ficha sale sin imagen`);
      continue;
    }
    const file = path.join(BIKES_DIR, b.photo);
    if (!fs.existsSync(file)) {
      console.warn(`  ! ${b.slug}: no existe ${b.photo}, la ficha sale sin imagen`);
      continue;
    }
    photos[b.slug] = fs.readFileSync(file);
  }

  const coverPath = path.join(APP_DIR, "src/lib/cover.jpg");
  const coverImage = fs.existsSync(coverPath) ? fs.readFileSync(coverPath) : undefined;

  const buf = await renderToBuffer(BikeCatalogPDF({ bikes, coverImage, photos }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const localPath = path.join(OUT_DIR, OUT_FILE);
  fs.writeFileSync(localPath, buf);
  console.log(`✓ ${bikes.length} bicicletas · ${(buf.length / 1024).toFixed(0)} KB`);
  console.log(`  Local:   ${localPath}`);

  if (soloLocal) {
    console.log("  Storage: (omitido por --solo-local)");
    return;
  }

  // `no-cache` porque el catálogo se regenera cada vez que cambia una ficha y el enlace
  // que se comparte con el peregrino es siempre el mismo.
  const { error: upErr } = await storage.storage.from(BUCKET).upload(REMOTE_PATH, buf, {
    contentType: "application/pdf",
    upsert: true,
    cacheControl: "no-cache",
  });
  if (upErr) {
    console.error(`✗ No se pudo subir a ${BUCKET}: ${upErr.message}`);
    process.exit(1);
  }
  console.log(`  Storage: ${BUCKET}/${REMOTE_PATH}`);
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
