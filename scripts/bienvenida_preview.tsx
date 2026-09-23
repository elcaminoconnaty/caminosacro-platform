// Vista previa de la carta de bienvenida de una o varias cotizaciones.
//
//   npx tsx --tsconfig scripts/tsconfig.json scripts/bienvenida_preview.tsx CS-2026-055 CS-2026-080
//
// Solo LEE de la base y escribe los PDF en $BIENVENIDA_OUT (por defecto /tmp). El
// componente se renderiza directo, no por renderCartaBienvenida(): fuera de Next el
// import() dinámico de @react-pdf carga otra copia del paquete, sin las fuentes puestas.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { CartaBienvenidaPDF } from "../src/lib/bienvenida/cartaPdf";
import { datosCartaBienvenida, nombreArchivoCarta } from "../src/lib/bienvenida/render";

config({ path: path.resolve(process.cwd(), ".env.local") });

const OUT = process.env.BIENVENIDA_OUT || "/tmp";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "comercial" },
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const codigos = process.argv.slice(2);
  if (codigos.length === 0) throw new Error("Pasa al menos un código de cotización (CS-2026-…)");
  const portada = readFileSync(path.join(process.cwd(), "src/lib/bienvenida/portada.jpg"));

  for (const code of codigos) {
    const { data: q } = await sb.from("quotes").select("id").eq("code", code).maybeSingle();
    if (!q) {
      console.log(`✘ ${code}: no existe`);
      continue;
    }
    const r = await datosCartaBienvenida(sb as never, q.id as string);
    if ("error" in r) {
      console.log(`✘ ${code}: ${r.error}`);
      continue;
    }
    const d = r.datos;
    const buf = await renderToBuffer(
      React.createElement(CartaBienvenidaPDF, { ...d, portada }) as never,
    );
    const out = path.join(OUT, nombreArchivoCarta(d.code, d.titulo));
    writeFileSync(out, buf);
    console.log(`✔ ${code} (${d.fuente}) → ${out}\n   ${d.titulo} · ${d.cifras}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
