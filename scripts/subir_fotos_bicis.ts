/**
 * Sube al bucket `contenido-fotos` las fotos de la flota de bicicletas que ya viven en el
 * repo (las usa el catálogo de bicis en PDF) y las registra en `public.contenido_fotos`
 * con `ruta_tag = 'bicis'`, para que aparezcan en el selector del Estudio de Contenido.
 *
 * ⚠️ NUNCA a `fotos-instagram` ni a `public.fotos`: el bot de las 7pm elige de esa tabla
 * sin mirar el bucket y publicaría una foto de producto sola en la cuenta real.
 *
 *   npx tsx scripts/subir_fotos_bicis.ts
 * Es idempotente: reusa la misma ruta de Storage, así que volver a correrlo no duplica.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const BUCKET = "contenido-fotos";
const DIR = join(process.cwd(), "src", "lib", "bikes");

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "public" },
  });

  const fotos = readdirSync(DIR).filter((f) => f.endsWith(".jpg"));
  console.log(`${fotos.length} fotos de bicicletas en ${DIR}\n`);

  for (const archivo of fotos) {
    const bytes = readFileSync(join(DIR, archivo));
    // Ruta fija (sin marca de tiempo) para que el script sea idempotente.
    const ruta = `bicis/${archivo}`;

    const { error: errSubida } = await sb.storage
      .from(BUCKET)
      .upload(ruta, bytes, { contentType: "image/jpeg", upsert: true });
    if (errSubida) {
      console.error(`  ✗ ${archivo}: ${errSubida.message}`);
      continue;
    }

    const { data } = sb.storage.from(BUCKET).getPublicUrl(ruta);
    // El nombre legible sale del archivo: "lapierre-zesty-tr-39" → "Lapierre Zesty Tr 39"
    const nombre = archivo
      .replace(/\.jpg$/, "")
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");

    const { error: errFila } = await sb.from("contenido_fotos").upsert(
      {
        storage_path: ruta,
        public_url: data.publicUrl,
        nombre,
        origen: "carpeta",
        ruta_tag: "bicis",
        bytes: bytes.byteLength,
      },
      { onConflict: "storage_path" },
    );
    if (errFila) console.error(`  ✗ ${archivo} (registro): ${errFila.message}`);
    else console.log(`  ✓ ${nombre}  ${Math.round(bytes.byteLength / 1024)} KB`);
  }

  const { count } = await sb.from("contenido_fotos").select("id", { count: "exact", head: true }).eq("ruta_tag", "bicis");
  console.log(`\n${count} fotos con la etiqueta "bicis" en el selector.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
