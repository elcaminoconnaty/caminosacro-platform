// Le quita el logo del proveedor a las etiquetas de equipaje QUE YA ESTÁN CARGADAS, las de
// antes del módulo. En el hueco queda lo que diga la preferencia guardada (la misma que se
// elige desde la tarjeta del expediente): nuestra marca, o nada.
//
//   npx tsx --tsconfig scripts/tsconfig.json scripts/etiquetas_remarcar.ts            ← ensayo
//   npx tsx --tsconfig scripts/tsconfig.json scripts/etiquetas_remarcar.ts --aplicar  ← de verdad
//   …                                                                    --aplicar CS-2026-019
//
// Sin `--aplicar` no escribe NADA: baja cada etiqueta, la procesa en memoria, deja el
// resultado en $ETIQUETA_OUT (por defecto /tmp) para poder abrirlo, y cuenta qué haría.
// Ese es el orden correcto de hacer esto: mirar los PDF primero, aplicar después.
//
// ⚠️ OJO con las etiquetas de expedientes YA ENVIADOS. El archivo marcado se guarda en la
// MISMA ruta que el original, que es la que sirven el correo y la página pública del
// cliente: a partir del momento en que se aplique, quien vuelva a descargar su etiqueta se
// baja la versión con nuestro logo. Eso es justo lo que se busca, pero conviene saberlo
// antes, y por eso el script lo dice expediente por expediente. El original se guarda al
// lado (`-original.pdf`) y desde la tarjeta del expediente se puede volver a él.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { quitarLogoProveedor } from "../src/lib/etiquetas/logoProveedor";
import { rutaEtiquetaEquipajeOriginal, sinBucket } from "../src/lib/storage/paths";

config({ path: path.resolve(process.cwd(), ".env.local") });

const OUT = process.env.ETIQUETA_OUT || "/tmp";
const APLICAR = process.argv.includes("--aplicar");
const SOLO = process.argv.filter((a) => /^CS-/.test(a));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: "comercial" } },
);

// La memoria de logos vive en `settings`, igual que en la app. Se lee tal cual para que el
// relleno use exactamente el mismo criterio que una subida normal.
async function memoria() {
  const { leerMemoriaLogos, leerModoLogo } = await import("../src/lib/etiquetas/memoria");
  const [logos, modo] = await Promise.all([
    leerMemoriaLogos(supabase as never),
    leerModoLogo(supabase as never),
  ]);
  return { logos, modo };
}

async function main() {
  const { data, error } = await supabase
    .from("travel_docs")
    .select("quote_id,luggage_tag_pdf_path,luggage_tag_original_path,sent_at,quotes(code,client_name)")
    .not("luggage_tag_pdf_path", "is", null);
  if (error) throw error;

  const filas = (data as unknown as {
    quote_id: string;
    luggage_tag_pdf_path: string;
    luggage_tag_original_path: string | null;
    sent_at: string | null;
    quotes: { code: string; client_name: string | null } | null;
  }[]).filter((f) => SOLO.length === 0 || SOLO.includes(f.quotes?.code ?? ""));

  console.log(`${filas.length} etiqueta(s)${APLICAR ? "" : " · ENSAYO, no se escribe nada"}\n`);
  const { logos: conocidos, modo } = await memoria();
  console.log(`en el hueco del logo: ${modo === "sin-logo" ? "nada" : "la marca de Camino Sacro"}\n`);

  for (const fila of filas) {
    const code = fila.quotes?.code ?? fila.quote_id;
    const enviado = fila.sent_at ? ` · ⚠ documentación YA ENVIADA el ${fila.sent_at.slice(0, 10)}` : "";
    console.log(`── ${code} · ${fila.quotes?.client_name ?? ""}${enviado}`);

    if (fila.luggage_tag_original_path) {
      console.log("   ya estaba marcada (tiene copia del original). Se salta.\n");
      continue;
    }

    const [bucket, ...resto] = fila.luggage_tag_pdf_path.split("/");
    const { data: archivo, error: bajarErr } = await supabase.storage.from(bucket).download(resto.join("/"));
    if (bajarErr || !archivo) { console.log(`   ✗ no pude bajarla: ${bajarErr?.message}\n`); continue; }
    const bytes = new Uint8Array(await archivo.arrayBuffer());

    const { pdf, informe } = await quitarLogoProveedor(bytes, conocidos, modo);
    console.log(`   ${informe.detalle.join(" ")}`);
    if (!pdf) { console.log("   → se queda como está.\n"); continue; }

    const previa = path.join(OUT, `${code}-etiqueta-${modo === "sin-logo" ? "sin-logo" : "CS"}.pdf`);
    writeFileSync(previa, pdf);
    console.log(`   → vista previa: ${previa}`);

    if (!APLICAR) { console.log("   (ensayo: no se subió nada)\n"); continue; }

    const original = rutaEtiquetaEquipajeOriginal(code);
    const copia = await supabase.storage
      .from("comercial-docs")
      .upload(sinBucket(original), Buffer.from(bytes), { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
    if (copia.error) { console.log(`   ✗ no pude guardar el original: ${copia.error.message}\n`); continue; }

    const subir = await supabase.storage
      .from("comercial-docs")
      .upload(resto.join("/"), Buffer.from(pdf), { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
    if (subir.error) { console.log(`   ✗ no pude subir la marcada: ${subir.error.message}\n`); continue; }

    const { error: actualizar } = await supabase
      .from("travel_docs")
      .update({
        luggage_tag_original_path: original,
        luggage_tag_brand: { ...informe, cuando: new Date().toISOString() },
      })
      .eq("quote_id", fila.quote_id);
    if (actualizar) { console.log(`   ✗ no pude actualizar el expediente: ${actualizar.message}\n`); continue; }

    console.log("   ✓ aplicada\n");
  }
}

main();
