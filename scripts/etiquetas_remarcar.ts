// Rehace las etiquetas de equipaje QUE YA ESTÁN CARGADAS: les quita el logo del proveedor
// y deja en el hueco lo que se pida —nuestra marca o nada—. Sirve para las de antes del
// módulo y también para cambiarle el relleno a las que ya pasaron por él, que es lo mismo
// que hace el botón de la tarjeta del expediente pero de a muchas.
//
//   npx tsx --tsconfig scripts/tsconfig.json scripts/etiquetas_remarcar.ts            ← ensayo
//   npx tsx --tsconfig scripts/tsconfig.json scripts/etiquetas_remarcar.ts --aplicar  ← de verdad
//   …                                                                    --aplicar CS-2026-019
//   …                                                        --modo=sin-logo --aplicar CS-2026-080
//
// Sin `--modo` se usa la preferencia guardada, la misma que se elige desde la tarjeta. Con
// `--modo` se usa esa y ADEMÁS queda como la preferencia para las próximas (igual que el
// botón), así la plataforma y este script nunca dicen cosas distintas.
//
// Una etiqueta que ya está en el modo pedido se salta; `--forzar` la rehace igual.
//
// Sin `--aplicar` no escribe NADA: baja cada etiqueta, la procesa en memoria, deja el
// resultado en $ETIQUETA_OUT (por defecto /tmp) para poder abrirlo, y cuenta qué haría.
// Ese es el orden correcto de hacer esto: mirar los PDF primero, aplicar después.
//
// ⚠️ OJO con las etiquetas de expedientes YA ENVIADOS. El archivo bueno se guarda en la
// MISMA ruta de siempre, que es la que sirven el correo y la página pública del cliente: a
// partir del momento en que se aplique, quien vuelva a descargar su etiqueta se baja la
// versión nueva. Eso es justo lo que se busca, pero conviene saberlo antes, y por eso el
// script lo dice expediente por expediente. El original del transportista se guarda al lado
// (`-original.pdf`) y desde la tarjeta del expediente se puede volver a él.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { quitarLogoProveedor } from "../src/lib/etiquetas/logoProveedor";
import { rutaEtiquetaEquipajeOriginal, sinBucket } from "../src/lib/storage/paths";

config({ path: path.resolve(process.cwd(), ".env.local") });

const OUT = process.env.ETIQUETA_OUT || "/tmp";
const APLICAR = process.argv.includes("--aplicar");
const FORZAR = process.argv.includes("--forzar");
const SOLO = process.argv.filter((a) => /^CS-/.test(a));
const MODO_PEDIDO = (() => {
  const arg = process.argv.find((a) => a.startsWith("--modo="))?.slice("--modo=".length);
  if (!arg) return null;
  if (arg !== "marca" && arg !== "sin-logo") {
    console.error(`--modo solo acepta "marca" o "sin-logo" (llegó "${arg}").`);
    process.exit(1);
  }
  return arg;
})();

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
    .select("quote_id,luggage_tag_pdf_path,luggage_tag_original_path,luggage_tag_brand,sent_at,quotes(code,client_name)")
    .not("luggage_tag_pdf_path", "is", null);
  if (error) throw error;

  const filas = (data as unknown as {
    quote_id: string;
    luggage_tag_pdf_path: string;
    luggage_tag_original_path: string | null;
    luggage_tag_brand: { modo?: string; reemplazos?: number } | null;
    sent_at: string | null;
    quotes: { code: string; client_name: string | null } | null;
  }[]).filter((f) => SOLO.length === 0 || SOLO.includes(f.quotes?.code ?? ""));

  const { logos: conocidos, modo: preferido } = await memoria();
  const modo = MODO_PEDIDO ?? preferido;

  console.log(`${filas.length} etiqueta(s)${APLICAR ? "" : " · ENSAYO, no se escribe nada"}`);
  console.log(`en el hueco del logo: ${modo === "sin-logo" ? "nada" : "la marca de Camino Sacro"}${MODO_PEDIDO ? " (pedido con --modo)" : " (preferencia guardada)"}\n`);

  for (const fila of filas) {
    const code = fila.quotes?.code ?? fila.quote_id;
    const enviado = fila.sent_at ? ` · ⚠ documentación YA ENVIADA el ${fila.sent_at.slice(0, 10)}` : "";
    console.log(`── ${code} · ${fila.quotes?.client_name ?? ""}${enviado}`);

    // Las etiquetas de antes de que se pudiera elegir no traen `modo` y llevan la marca.
    const modoActual = fila.luggage_tag_brand
      ? (fila.luggage_tag_brand.modo ?? "marca")
      : null;
    if (modoActual === modo && !FORZAR) {
      console.log(`   ya está así (${modo}). Se salta; con --forzar se rehace igual.\n`);
      continue;
    }

    // SIEMPRE se parte del original del transportista, que es el único que todavía tiene el
    // logo de Pilgrim. La publicada ya no lo tiene: reprocesarla no encontraría nada.
    const fuente = fila.luggage_tag_original_path ?? fila.luggage_tag_pdf_path;
    const rehacer = fuente !== fila.luggage_tag_pdf_path;
    const [bucket, ...resto] = fuente.split("/");
    const { data: archivo, error: bajarErr } = await supabase.storage.from(bucket).download(resto.join("/"));
    if (bajarErr || !archivo) { console.log(`   ✗ no pude bajarla: ${bajarErr?.message}\n`); continue; }
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    if (rehacer) console.log(`   se rehace desde el original guardado${modoActual ? ` (estaba en "${modoActual}")` : ""}.`);

    const { pdf, informe } = await quitarLogoProveedor(bytes, conocidos, modo);
    console.log(`   ${informe.detalle.join(" ")}`);
    if (!pdf) { console.log("   → se queda como está.\n"); continue; }

    const previa = path.join(OUT, `${code}-etiqueta-${modo === "sin-logo" ? "sin-logo" : "CS"}.pdf`);
    writeFileSync(previa, pdf);
    console.log(`   → vista previa: ${previa}`);

    if (!APLICAR) { console.log("   (ensayo: no se subió nada)\n"); continue; }

    // La copia del original solo se hace la primera vez. Volver a subirla cuando ya existe
    // sería escribir encima del único archivo que todavía tiene el logo del proveedor.
    const original = fila.luggage_tag_original_path ?? rutaEtiquetaEquipajeOriginal(code);
    if (!fila.luggage_tag_original_path) {
      const copia = await supabase.storage
        .from("comercial-docs")
        .upload(sinBucket(original), Buffer.from(bytes), { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
      if (copia.error) { console.log(`   ✗ no pude guardar el original: ${copia.error.message}\n`); continue; }
    }

    const [, ...destino] = fila.luggage_tag_pdf_path.split("/");
    const subir = await supabase.storage
      .from("comercial-docs")
      .upload(destino.join("/"), Buffer.from(pdf), { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
    if (subir.error) { console.log(`   ✗ no pude subir la etiqueta: ${subir.error.message}\n`); continue; }

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

  // La preferencia se mueve solo si se pidió un modo a mano, y solo si de verdad se
  // escribió: un ensayo no cambia nada, ni siquiera esto.
  if (MODO_PEDIDO && APLICAR) {
    const { recordarModoLogo } = await import("../src/lib/etiquetas/memoria");
    await recordarModoLogo(supabase as never, MODO_PEDIDO);
    console.log(`Preferencia guardada: las próximas etiquetas también saldrán en "${MODO_PEDIDO}".`);
  }
}

main();
