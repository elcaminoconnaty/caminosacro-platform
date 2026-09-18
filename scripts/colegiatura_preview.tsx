// Vista previa de los DOS documentos de CS-2026-080 (Colegiatura) con las condiciones
// particulares pactadas, para revisarlos antes de guardar nada.
//
//   npx tsx --tsconfig scripts/tsconfig.json scripts/colegiatura_preview.tsx
//
// Solo LEE de la base y escribe dos PDF locales en $COLEG_OUT (por defecto /tmp). No sube
// nada a storage, no actualiza la cotización ni el contrato: las condiciones se le pasan
// al render por parámetro, así que sirve incluso antes de aplicar la migración 0042.
//
// Igual que plantilla_pdf.tsx: el componente del contrato se importa directo, porque fuera
// de Next el import() dinámico carga otra copia de @react-pdf y revienta con las fuentes.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { ContractPDF } from "../src/lib/contracts/contractPdf";
import type { ContractVariables, Firmante, PaymentPlan, ViajeroAnexo } from "../src/lib/contracts/template";
import { CONDICIONES_CONTRATO, CONDICIONES_COTIZACION, INCLUYE, NO_INCLUYE, OPCIONALES, VARIABLES_CORREGIDAS } from "./colegiatura_condiciones";

config({ path: path.resolve(process.cwd(), ".env.local") });

const OUT = process.env.COLEG_OUT || "/tmp";
const QUOTE_ID = "3958bd97-d253-4601-a683-7df46b54c5d9"; // CS-2026-080

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "comercial" },
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Firma dibujada de quien firma por Camino Sacro, igual que la lee getFirmante(). */
async function firmaOrg(slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const { data } = await sb.from("settings").select("value").eq("key", "firmantes").maybeSingle();
  return ((data?.value as Firmante[] | null) ?? []).find((x) => x.slug === slug)?.data_url ?? null;
}

async function main() {
  // ---------- 1. Contrato ----------
  const { data: c, error } = await sb
    .from("contracts")
    .select("id,variables_json,payment_plan_json,travelers_json,org_signer,status")
    .eq("quote_id", QUOTE_ID)
    .maybeSingle();
  if (error) throw error;
  if (!c) throw new Error("No hay contrato para CS-2026-080");
  console.log(`Contrato ${c.id} · estado "${c.status}"`);

  const vars: ContractVariables = {
    ...(c.variables_json as ContractVariables),
    ...VARIABLES_CORREGIDAS,
    incluye: INCLUYE,
    no_incluye: NO_INCLUYE,
    opcionales: OPCIONALES,
    condiciones_particulares: CONDICIONES_CONTRATO,
  };
  const plan = (c.payment_plan_json as PaymentPlan) ?? { type: "contado" };
  const viajeros = ((c.travelers_json as ViajeroAnexo[] | null) ?? []).map((t, i) => ({
    position: t.position ?? i + 1,
    nombre: t.nombre,
    documento_tipo: t.documento_tipo,
    documento: t.documento,
    autoriza_imagen: t.autoriza_imagen ?? null,
  }));

  const contratoBuf = await renderToBuffer(
    React.createElement(ContractPDF as never, {
      variables: vars,
      plan,
      travelers: viajeros,
      numero: c.id as string,
      orgSignature: await firmaOrg(c.org_signer as string | null),
    }) as never,
  );
  const contratoOut = path.join(OUT, "CS-2026-080-Contrato-REVISADO.pdf");
  writeFileSync(contratoOut, contratoBuf);
  console.log(`✔ Contrato  → ${contratoOut}`);

  // ---------- 2. Cotización (Anexo No. 1) ----------
  // pdf.ts renderiza con un import() dinámico de @react-pdf, que fuera de Next es OTRA
  // copia del paquete, con su propio registro de fuentes. Sin esto: "Font family not
  // registered: Inter". Ver registrarFuentes() en pdfChrome.
  const { registrarFuentes } = await import("../src/lib/pdfChrome");
  registrarFuentes((await import("@react-pdf/renderer")).Font);

  const { renderAndStoreQuotePdf } = await import("../src/lib/quotes/pdf");
  const res = await renderAndStoreQuotePdf(sb as never, QUOTE_ID, {
    soloRender: true,
    condiciones: CONDICIONES_COTIZACION,
  });
  if (!("buffer" in res) || !res.buffer) throw new Error(`Cotización: ${"error" in res ? res.error : "sin buffer"}`);
  const cotizacionOut = path.join(OUT, "CS-2026-080-Cotizacion-REVISADA.pdf");
  writeFileSync(cotizacionOut, res.buffer);
  console.log(`✔ Cotización → ${cotizacionOut}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
