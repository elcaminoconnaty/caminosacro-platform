// Prueba el módulo de etiquetas contra un PDF local, sin tocar la base ni el storage.
//
//   npx tsx --tsconfig scripts/tsconfig.json scripts/etiqueta_prueba.ts <etiqueta.pdf> [más.pdf…]
//
// Imprime lo que encontró en el PDF (qué imágenes hay, de qué tamaño salen impresas y cuál
// se lleva el veredicto de "logo del proveedor"), escribe el resultado en $ETIQUETA_OUT
// (por defecto /tmp) y, sobre todo, imprime la HUELLA de cada imagen: es lo que hay que
// pegar en `src/lib/etiquetas/memoria.ts` para que una plantilla nueva de un proveedor
// quede reconocida de fábrica.
//
// Sirve también para comprobar un cambio en la marca: se corre sobre las dos etiquetas de
// muestra y se abren los PDF de salida.
import { writeFileSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from "pdf-lib";
import { invocaciones, leerFlujo } from "../src/lib/etiquetas/contenido";
import { ponerNuestraMarca, MEMORIA_VACIA } from "../src/lib/etiquetas/logoProveedor";

const OUT = process.env.ETIQUETA_OUT || "/tmp";

async function inventario(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  doc.getPages().forEach((pagina, i) => {
    const recursos = pagina.node.Resources();
    const xobjects = recursos?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    const ordenes = invocaciones(leerFlujo(ctx, pagina.node.Contents())) ?? [];
    console.log(`  pág ${i + 1} · ${pagina.getWidth().toFixed(1)}×${pagina.getHeight().toFixed(1)} pt`);
    if (!xobjects) return;
    for (const [nombre, ref] of xobjects.entries()) {
      if (!(ref instanceof PDFRef)) continue;
      const objeto = ctx.lookup(ref);
      if (!(objeto instanceof PDFRawStream)) continue;
      if (objeto.dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
      const huella = crypto.createHash("sha256").update(Buffer.from(objeto.contents)).digest("hex");
      const w = objeto.dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber() ?? 0;
      const h = objeto.dict.lookupMaybe(PDFName.of("Height"), PDFNumber)?.asNumber() ?? 0;
      const usos = ordenes.filter((o) => `/${o.nombre}` === nombre.asString());
      console.log(`    ${nombre.asString()} ${w}×${h} px`);
      console.log(`      huella  ${huella}`);
      for (const u of usos) {
        console.log(`      impresa ${u.ancho.toFixed(1)}×${u.alto.toFixed(1)} pt en (${u.x.toFixed(1)}, ${u.y.toFixed(1)})`);
      }
    }
  });
}

async function main() {
  const archivos = process.argv.slice(2);
  if (archivos.length === 0) {
    console.error("Uso: npx tsx --tsconfig scripts/tsconfig.json scripts/etiqueta_prueba.ts <etiqueta.pdf>…");
    process.exit(1);
  }
  for (const archivo of archivos) {
    console.log(`\n═══ ${archivo}`);
    const bytes = new Uint8Array(readFileSync(archivo));
    await inventario(bytes);
    const { pdf, informe } = await ponerNuestraMarca(bytes, MEMORIA_VACIA);
    console.log("  informe:", JSON.stringify(informe, null, 2).replace(/\n/g, "\n  "));
    if (pdf) {
      const destino = path.join(OUT, `${path.basename(archivo, ".pdf")}-CS.pdf`);
      writeFileSync(destino, pdf);
      console.log(`  → ${destino} (${pdf.length} bytes, el original pesaba ${bytes.length})`);
    }
  }
}

main();
