// Guarda en la plataforma lo que la vista previa ya dejó revisar (CS-2026-080, Colegiatura)
// y regenera los dos PDF, para que Nico solo tenga que reenviar el contrato desde el CRM.
//
//   npx tsx --tsconfig scripts/tsconfig.json scripts/colegiatura_guardar.ts
//
// ESCRIBE EN PRODUCCIÓN. Antes hay que aplicar la migración 0042 y desplegar el código:
// la página pública de firma arma las cláusulas en vivo, así que con el código viejo el
// cliente vería el articulado anterior aunque el PDF ya diga lo correcto.
//
// Es idempotente: se puede correr dos veces sin duplicar el pago ni ensuciar nada.
// No cambia el estado del contrato ni envía correos — eso lo hace Nico desde el CRM.
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  CONDICIONES_CONTRATO,
  CONDICIONES_COTIZACION,
  CUOTA_2,
  INCLUYE,
  NO_INCLUYE,
  OPCIONALES,
  VARIABLES_CORREGIDAS,
} from "./colegiatura_condiciones";
import type { ContractVariables, PaymentPlan, ViajeroAnexo } from "../src/lib/contracts/template";

config({ path: path.resolve(process.cwd(), ".env.local") });

const QUOTE_ID = "3958bd97-d253-4601-a683-7df46b54c5d9"; // CS-2026-080
const PAGO_2 = { paid_at: "2026-09-15", amount_eur: 5377.2 };

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "comercial" },
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // ---------- 1. Condiciones particulares de la cotización ----------
  {
    const { error } = await sb.from("quotes").update({ condiciones_json: CONDICIONES_COTIZACION }).eq("id", QUOTE_ID);
    if (error) throw new Error(`cotización: ${error.message}`);
    console.log("✔ Cotización: condiciones particulares guardadas");
  }

  // ---------- 2. Segunda cuota, que se pagó pero nunca se registró ----------
  {
    const { data: ya } = await sb
      .from("client_payments")
      .select("id")
      .eq("quote_id", QUOTE_ID)
      .eq("paid_at", PAGO_2.paid_at)
      .maybeSingle();
    if (ya) {
      console.log("· Pago del 15-sep: ya estaba registrado, no se toca");
    } else {
      const { error } = await sb.from("client_payments").insert({
        quote_id: QUOTE_ID,
        paid_at: PAGO_2.paid_at,
        amount: PAGO_2.amount_eur,
        currency: "EUR",
        amount_eur: PAGO_2.amount_eur,
        method: "transferencia",
        // Sin cuenta ni TRM: el pago es un dato confirmado por Nico, pero el banco de
        // origen y la tasa del día no constan. Que quede el hueco explícito y no un valor
        // inventado — se completa en el CRM cuando aparezca el soporte.
        notes: "Saldo (60%). Registrado a posteriori; falta confirmar cuenta de recepción y soporte.",
      });
      if (error) throw new Error(`pago: ${error.message}`);
      console.log(`✔ Pago del ${CUOTA_2.fecha}: ${CUOTA_2.eur} € registrado`);
    }
  }

  // ---------- 3. Articulado del contrato ----------
  const { data: c, error: cErr } = await sb
    .from("contracts")
    .select("id,status,variables_json,payment_plan_json,travelers_json,org_signer,quote_id")
    .eq("quote_id", QUOTE_ID)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!c) throw new Error("No hay contrato para CS-2026-080");
  if (c.status === "firmado") throw new Error("El contrato ya está firmado: no se toca.");

  const variables: ContractVariables = {
    ...(c.variables_json as ContractVariables),
    ...VARIABLES_CORREGIDAS,
    incluye: INCLUYE,
    no_incluye: NO_INCLUYE,
    opcionales: OPCIONALES,
    condiciones_particulares: CONDICIONES_CONTRATO,
  };
  {
    const { error } = await sb.from("contracts").update({ variables_json: variables }).eq("id", c.id);
    if (error) throw new Error(`contrato: ${error.message}`);
    console.log("✔ Contrato: condiciones particulares y Anexo No. 1 guardados");
  }

  // ---------- 4. Regenerar los dos PDF ----------
  // Fuera de Next, el import() dinámico de @react-pdf es otra copia del paquete y no tiene
  // las fuentes registradas. Ver registrarFuentes() en pdfChrome.
  const { registrarFuentes } = await import("../src/lib/pdfChrome");
  registrarFuentes((await import("@react-pdf/renderer")).Font);

  const { renderAndStoreQuotePdf } = await import("../src/lib/quotes/pdf");
  const q = await renderAndStoreQuotePdf(sb as never, QUOTE_ID);
  if ("error" in q && q.error) throw new Error(`PDF cotización: ${q.error}`);
  console.log("✔ PDF de la cotización regenerado y subido (Anexo No. 1)");

  const { renderContractPdfBuffer, getOrgSignature } = await import("../src/lib/contracts/render");
  const { rutaContratoEmpresa, sinBucket } = await import("../src/lib/storage/paths");
  const buffer = await renderContractPdfBuffer(
    variables,
    (c.payment_plan_json as PaymentPlan) ?? { type: "contado" },
    null,
    await getOrgSignature(sb as never, c.org_signer as string | null),
    (c.travelers_json as ViajeroAnexo[]) ?? [],
    { numero: c.id as string },
  );
  const pdfPath = rutaContratoEmpresa(variables.codigo_cotizacion, false);
  const { error: upErr } = await sb.storage
    .from("comercial-contracts")
    .upload(sinBucket(pdfPath), buffer, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (upErr) throw new Error(`subida contrato: ${upErr.message}`);
  const { error: pErr } = await sb.from("contracts").update({ pdf_path: pdfPath }).eq("id", c.id);
  if (pErr) throw new Error(`pdf_path: ${pErr.message}`);
  console.log("✔ PDF del contrato regenerado y subido");

  console.log(`\nListo. El contrato queda en estado "${c.status}": reenvíalo desde Seguimiento.`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message ?? e}`);
  process.exit(1);
});
