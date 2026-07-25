/**
 * Reorganiza Supabase Storage a la estructura de src/lib/storage/paths.ts:
 * cada documento pasa de la raíz del bucket a {año}/{código}/ (y los catálogos
 * y cartas de bienvenida a su carpeta temática).
 *
 * Mueve con la API de Storage (`move`), NUNCA con UPDATE sobre storage.objects:
 * esta versión de Storage mantiene además storage.prefixes y un update crudo
 * dejaría el bucket inconsistente. Tras cada movimiento actualiza la columna de
 * la BD que guarda la ruta.
 *
 * Idempotente: si el archivo ya está en destino lo salta; si el origen ya no
 * existe pero el destino sí, solo repara la fila de la BD. Se puede correr las
 * veces que haga falta.
 *
 * Uso:
 *   cd app && npx tsx scripts/reorganize_storage.ts            # dry-run (por defecto)
 *   cd app && npx tsx scripts/reorganize_storage.ts --apply    # ejecuta de verdad
 *   cd app && npx tsx scripts/reorganize_storage.ts --apply --fotos   # incluye fotos-instagram
 *
 * `--fotos` va aparte porque ese bucket alimenta el pipeline activo de Instagram
 * (edge functions preparar/publicar + pg_cron): correrlo fuera de las ventanas
 * de las 8am y 7pm hora Bogotá.
 */
import * as path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { carpetaCotizacion } from "../src/lib/storage/paths";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const CON_FOTOS = process.argv.includes("--fotos");

const storage = createClient(url, key);
const db = createClient(url, key, { db: { schema: "comercial" } });
const dbPublic = createClient(url, key);

const FOTOS_PREFIX = "camino-sacro/2026/06/";
const CODE_RE = /(CS-\d{4}-\d+)/;

type Movimiento = { bucket: string; de: string; a: string };

/** Destino de un objeto según su bucket y su nombre actual. */
function destino(bucket: string, name: string): string | null {
  // Ya organizado.
  if (name.includes("/")) return null;

  if (bucket === "comercial-catalogs") return `fichas-de-viaje/${name}`;
  if (bucket === "comercial-welcome") return `cartas-bienvenida/${name}`;
  if (bucket === "fotos-instagram") return `${FOTOS_PREFIX}${name}`;

  const m = CODE_RE.exec(name);
  if (!m) return `sin-clasificar/${name}`;
  return `${carpetaCotizacion(m[1])}/${name}`;
}

async function listarObjetos(bucket: string): Promise<string[]> {
  const nombres: string[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await storage.storage.from(bucket).list("", { limit, offset });
    if (error) throw new Error(`list ${bucket}: ${error.message}`);
    if (!data || data.length === 0) break;
    // Las carpetas vienen sin `id`; solo nos interesan los archivos de la raíz.
    for (const o of data) if (o.id) nombres.push(o.name);
    if (data.length < limit) break;
  }
  return nombres;
}

/** Mueve un objeto tolerando que ya esté en destino (idempotencia). */
async function mover(bucket: string, de: string, a: string): Promise<"movido" | "ya-estaba" | string> {
  const { error } = await storage.storage.from(bucket).move(de, a);
  if (!error) return "movido";
  const msg = error.message.toLowerCase();
  if (msg.includes("not found") || msg.includes("exists")) {
    // ¿El destino ya existe? Entonces el movimiento se hizo en una corrida previa.
    const carpeta = a.includes("/") ? a.slice(0, a.lastIndexOf("/")) : "";
    const archivo = a.slice(a.lastIndexOf("/") + 1);
    const { data } = await storage.storage.from(bucket).list(carpeta, { search: archivo, limit: 1 });
    if (data?.some((o) => o.name === archivo)) return "ya-estaba";
  }
  return error.message;
}

/** Cambia el prefijo de bucket+ruta en una columna de la BD. */
async function actualizarColumna(
  cliente: typeof db,
  tabla: string,
  columna: string,
  antes: string,
  despues: string,
) {
  const { error } = await cliente.from(tabla).update({ [columna]: despues }).eq(columna, antes);
  if (error) console.error(`  ! ${tabla}.${columna}: ${error.message}`);
}

const COLUMNAS: Record<string, Array<{ tabla: string; columna: string }>> = {
  "comercial-quotes": [{ tabla: "quotes", columna: "pdf_path" }],
  "comercial-hotels": [{ tabla: "quotes", columna: "hotels_pdf_path" }],
  "comercial-receipts": [
    { tabla: "client_payments", columna: "receipt_path" },
    { tabla: "provider_payments", columna: "receipt_path" },
  ],
  "comercial-contracts": [
    { tabla: "contracts", columna: "pdf_path" },
    { tabla: "contracts", columna: "signed_pdf_path" },
  ],
  "comercial-passports": [{ tabla: "contracts", columna: "passport_path" }],
  "comercial-welcome": [{ tabla: "welcome_letters", columna: "storage_path" }],
  "comercial-catalogs": [{ tabla: "route_catalogs", columna: "storage_path" }],
};

async function procesarBucket(bucket: string): Promise<Movimiento[]> {
  const objetos = await listarObjetos(bucket);
  const movimientos: Movimiento[] = [];
  for (const name of objetos) {
    const a = destino(bucket, name);
    if (a) movimientos.push({ bucket, de: name, a });
  }
  if (movimientos.length === 0) {
    console.log(`  ${bucket}: nada por mover (${objetos.length} archivos ya organizados)`);
    return [];
  }

  console.log(`  ${bucket}: ${movimientos.length} archivo(s) por mover`);
  // Solo devolvemos los que quedaron realmente en destino: quien use este
  // resultado para actualizar la BD no debe tocar filas cuyo archivo no se movió.
  const hechos: Movimiento[] = [];
  for (const mv of movimientos) {
    if (!APPLY) {
      console.log(`    ${mv.de}  →  ${mv.a}`);
      hechos.push(mv);
      continue;
    }
    const r = await mover(bucket, mv.de, mv.a);
    if (r !== "movido" && r !== "ya-estaba") {
      console.error(`    ✗ ${mv.de}: ${r}`);
      continue;
    }
    for (const { tabla, columna } of COLUMNAS[bucket] ?? []) {
      await actualizarColumna(db, tabla, columna, `${bucket}/${mv.de}`, `${bucket}/${mv.a}`);
    }
    console.log(`    ✓ ${mv.de}  →  ${mv.a}${r === "ya-estaba" ? " (ya estaba, BD reparada)" : ""}`);
    hechos.push(mv);
  }
  return hechos;
}

/**
 * Segunda pasada sobre la BD: arregla filas que quedaron apuntando a la ruta
 * vieja aunque el archivo ya se movió (p. ej. si una corrida anterior movió el
 * objeto pero falló el update). No depende del listado del bucket, así que
 * atrapa lo que `procesarBucket` ya no puede ver.
 */
async function repararRutasEnBD() {
  console.log("\n→ Repaso de rutas en la base");
  let arregladas = 0;
  for (const [bucket, columnas] of Object.entries(COLUMNAS)) {
    for (const { tabla, columna } of columnas) {
      const { data, error } = await db.from(tabla).select(`id, ${columna}`).like(columna, `${bucket}/%`);
      if (error) {
        console.error(`  ! ${tabla}.${columna}: ${error.message}`);
        continue;
      }
      for (const fila of ((data ?? []) as unknown) as Array<Record<string, string>>) {
        const actual = fila[columna];
        const nombre = actual.slice(bucket.length + 1);
        const destinoNombre = destino(bucket, nombre);
        if (!destinoNombre) continue; // ya organizada

        const carpeta = destinoNombre.slice(0, destinoNombre.lastIndexOf("/"));
        const archivo = destinoNombre.slice(destinoNombre.lastIndexOf("/") + 1);
        const { data: encontrado } = await storage.storage
          .from(bucket)
          .list(carpeta, { search: archivo, limit: 1 });
        if (!encontrado?.some((o) => o.name === archivo)) continue; // el archivo no está allá: no tocar

        if (!APPLY) {
          console.log(`    ${tabla}.${columna}: ${actual}  →  ${bucket}/${destinoNombre}`);
          arregladas++;
          continue;
        }
        const { error: upErr } = await db
          .from(tabla)
          .update({ [columna]: `${bucket}/${destinoNombre}` })
          .eq("id", fila.id);
        if (upErr) console.error(`  ! ${tabla}.${columna} (${fila.id}): ${upErr.message}`);
        else {
          console.log(`    ✓ ${tabla}.${columna}: ${actual}  →  ${bucket}/${destinoNombre}`);
          arregladas++;
        }
      }
    }
  }
  if (arregladas === 0) console.log("  todas las rutas de la base ya apuntan bien");
}

/**
 * fotos-instagram: además de mover, hay que actualizar public.fotos en la misma
 * corrida. `registrar_fotos_nuevas()` compara storage.objects.name contra
 * fotos.storage_path: si quedan desalineados, el `preparar` de las 8am
 * re-registraría las 162 fotos como nuevas y podría republicar fotos ya usadas.
 */
async function procesarFotos() {
  console.log("\n→ fotos-instagram (pipeline de Instagram)");
  const movimientos = await procesarBucket("fotos-instagram");
  if (!APPLY || movimientos.length === 0) return;

  for (const mv of movimientos) {
    const urlAntes = `${url}/storage/v1/object/public/fotos-instagram/${mv.de}`;
    const urlDespues = `${url}/storage/v1/object/public/fotos-instagram/${mv.a}`;
    // public.fotos guarda el nombre SIN prefijo de bucket.
    await dbPublic.from("fotos").update({ storage_path: mv.a, public_url: urlDespues }).eq("storage_path", mv.de);
    await dbPublic
      .from("borradores")
      .update({ storage_path: mv.a, public_url: urlDespues })
      .eq("storage_path", mv.de);
    await dbPublic.from("instagram_posts").update({ foto_url: urlDespues }).eq("foto_url", urlAntes);
  }
  console.log(`  ✓ public.fotos / borradores / instagram_posts actualizados (${movimientos.length})`);
}

async function main() {
  console.log(APPLY ? "Reorganizando Storage (APLICANDO)" : "Reorganizando Storage (dry-run, usa --apply para ejecutar)");

  console.log("\n→ Documentos comerciales");
  for (const bucket of Object.keys(COLUMNAS)) {
    await procesarBucket(bucket);
  }
  await repararRutasEnBD();

  if (CON_FOTOS) await procesarFotos();
  else console.log("\n→ fotos-instagram: omitido (usa --fotos para incluirlo)");

  console.log(APPLY ? "\n✓ Listo" : "\nNada se movió. Repite con --apply cuando la lista se vea bien.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
