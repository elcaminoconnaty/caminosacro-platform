// Humo: renderiza el PDF de una cotización real (sin subirlo ni tocar la base) y lo deja en
// $SMOKE_OUT (o /tmp). Sirve para revisar el adjunto que le llega al peregrino.
//   COT=CS-2026-117 npx tsx --tsconfig scripts/tsconfig.json scripts/cotizacion_smoke.tsx
import { writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { renderAndStoreQuotePdf } from "../src/lib/quotes/pdf";

config({ path: path.resolve(process.cwd(), ".env.local") });
const OUT = process.env.SMOKE_OUT || "/tmp";
const COT = process.env.COT || "CS-2026-117";

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "comercial" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Fuera de Next hay dos copias de @react-pdf: la que registra las fuentes al importar
  // pdfChrome y la que carga el `import()` dinámico de quotes/pdf.ts. Se registran a mano
  // sobre ESA copia (ver registrarFuentes en pdfChrome).
  const { Font } = await import("@react-pdf/renderer");
  const { registrarFuentes } = await import("../src/lib/pdfChrome");
  registrarFuentes(Font);

  const { data: q } = await sb.from("quotes").select("id,code").eq("code", COT).maybeSingle();
  if (!q) throw new Error(`No existe la cotización ${COT}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await renderAndStoreQuotePdf(sb as any, q.id, { soloRender: true });
  if (!r.ok || !("buffer" in r) || !r.buffer) throw new Error(r.error || "sin buffer");
  const out = path.join(OUT, `${q.code}.pdf`);
  writeFileSync(out, r.buffer);
  console.log("→", out, r.buffer.length, "bytes");
}
main().catch((e) => { console.error(e); process.exit(1); });
