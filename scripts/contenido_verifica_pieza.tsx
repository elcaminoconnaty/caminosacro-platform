/**
 * Renderiza una pieza REAL de la base, que es exactamente lo que hace el endpoint.
 * Prueba el camino completo jsonb → zod → Satori sin levantar el servidor ni iniciar
 * sesión, así que sirve para depurar una pieza concreta que se vea mal:
 *
 *     npx tsx scripts/contenido_verifica_pieza.tsx <id-de-la-pieza>
 *
 * Necesita .env.local (usa la service_role, así que no pasa por RLS).
 */
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { renderSlide } from "../src/lib/contenido/render";
import { leerSlides } from "../src/lib/contenido/tipos";
import { esFormatoId, FORMATO_POR_DEFECTO } from "../src/lib/contenido/formatos";

config({ path: ".env.local" });

const ID = process.argv[2];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "public" } },
  );
  const { data, error } = await sb.from("contenido_piezas").select("formato,slides,titulo").eq("id", ID).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("pieza no encontrada");

  const formato = esFormatoId(data.formato) ? data.formato : FORMATO_POR_DEFECTO;
  const { slides, error: errSlides } = leerSlides(data.slides);
  console.log(`pieza "${data.titulo}" · formato ${formato} · ${slides.length} slide(s)`);
  if (errSlides) throw new Error("slides no validan: " + errSlides);

  for (let i = 0; i < slides.length; i++) {
    const res = await renderSlide(formato, slides[i], {});
    const bytes = Buffer.from(await res.arrayBuffer());
    const f = `/tmp/pieza-slide-${i}.png`;
    writeFileSync(f, bytes);
    console.log(`  slide ${i} (${slides[i].plantilla}) → ${f}  ${Math.round(bytes.length / 1024)} KB`);
  }
  // Y el caso de índice fuera de rango, que el endpoint debe resolver con pieza de error.
  const fuera = await renderSlide(formato, null, {});
  writeFileSync("/tmp/pieza-slide-fuera.png", Buffer.from(await fuera.arrayBuffer()));
  console.log("  slide fuera de rango → /tmp/pieza-slide-fuera.png (pieza de error)");
}
main().catch((e) => { console.error(e); process.exit(1); });
