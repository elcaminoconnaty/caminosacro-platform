// B3: ¿preview (0.35) y exportación (1) son la MISMA imagen, o la escala las separa?
// El riesgo real es el corte de línea: un titular que cabe en 2 líneas a tamaño real
// puede partirse en 3 al reducir, porque el ancho disponible se redondea distinto.
import { writeFileSync } from "node:fs";
import { renderSlide } from "../src/lib/contenido/render";
import { valoresPorDefecto, PLANTILLAS_LISTA } from "../src/lib/contenido/plantillas/registry";
import { FORMATOS } from "../src/lib/contenido/formatos";
import type { Slide } from "../src/lib/contenido/tipos";

const FOTO = "https://yvytzquewjsjsmgiwmaa.supabase.co/storage/v1/object/public/fotos-instagram/camino-sacro/2026/06/DDC_3232.jpg";
const ESCALA_PREVIEW = 0.35;

/** Texto al límite del maxLargo: es donde el corte de línea se vuelve frágil. */
function valoresLargos(id: string): Record<string, string> {
  const def = PLANTILLAS_LISTA.find((p) => p.definicion.id === id)!.definicion;
  const out: Record<string, string> = { ...valoresPorDefecto(id) };
  for (const c of def.campos) {
    if (!c.maxLargo || c.tipo === "ruta" || c.tipo === "foto") continue;
    const base = "Caminando desde Sarria hasta Santiago con la maleta trasladada cada día ";
    out[c.id] = base.repeat(6).slice(0, c.maxLargo).trim();
  }
  return out;
}

async function png(slide: Slide, formato: keyof typeof FORMATOS, escala: number) {
  const res = await renderSlide(formato, slide, { escala });
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const casos: Array<[string, keyof typeof FORMATOS, boolean]> = [
    ["portada-ruta", "4x5", true], ["portada-ruta", "9x16", true],
    ["tip-numerado", "4x5", false], ["cifra-contexto", "1x1", false],
    ["comparativa-dos", "4x5", false], ["lista-empaque", "9x16", false],
    ["pregunta-grande", "reel", true], ["pasos-preparacion", "4x5", false],
  ];
  for (const [id, fmt, conFoto] of casos) {
    const slide: Slide = { plantilla: id, valores: valoresLargos(id), foto: conFoto ? { url: FOTO, origen: "banco" } : null };
    const [a, b] = await Promise.all([png(slide, fmt, ESCALA_PREVIEW), png(slide, fmt, 1)]);
    writeFileSync(`/tmp/b3-${id}-${fmt.replace(".", "_")}-prev.png`, a);
    writeFileSync(`/tmp/b3-${id}-${fmt.replace(".", "_")}-exp.png`, b);
    console.log(`  ${id} @ ${fmt}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
