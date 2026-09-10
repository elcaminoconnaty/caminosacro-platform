// Prueba de humo del correo del contrato con DOS adjuntos (contrato + Anexo 1 cotización).
//
// Usa exactamente las mismas piezas que sendContractLink / firmarContrato:
// adjuntosContrato() arma la lista y enviarCorreoContrato() la manda por el webhook de
// n8n ("Correo Cotización — Camino Sacro"), que la pasa a Brevo. Queda registrado en
// email_log como prueba. No toca el contrato ni su estado.
//
//   PRUEBA_EMAIL=tu@correo.com npx tsx --tsconfig scripts/tsconfig.json scripts/prueba_adjuntos_contrato.tsx <quoteId>
//
// Ej. con la cotización de prueba de empresa CS-2026-085:
//   PRUEBA_EMAIL=detrasdecamarasch@gmail.com npx tsx --tsconfig scripts/tsconfig.json scripts/prueba_adjuntos_contrato.tsx 788bcbf2-9691-4d30-92cc-97014962c680
import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const quoteId = process.argv[2];
  const destino = process.env.PRUEBA_EMAIL;
  if (!quoteId || !destino) throw new Error("Uso: PRUEBA_EMAIL=correo npx tsx ... scripts/prueba_adjuntos_contrato.tsx <quoteId>");

  // Importes dinámicos: adjuntos.ts y email.ts traen `server-only`, que el tsconfig de
  // scripts redirige a un stub. Se cargan después de leer .env.local.
  const { adjuntosContrato } = await import("../src/lib/contracts/adjuntos");
  const { enviarCorreoContrato } = await import("../src/lib/contracts/email");

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "comercial" },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: c } = await sb
    .from("contracts")
    .select("id,quote_id,kind,pdf_path,signed_pdf_path,variables_json")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!c) throw new Error("Esa cotización no tiene contrato.");

  const vars = c.variables_json as { codigo_cotizacion: string; ruta_nombre: string };
  const pdf = String(c.signed_pdf_path || c.pdf_path || "").replace(/^comercial-contracts\//, "");
  if (!pdf) throw new Error("El contrato no tiene PDF todavía (genera la vista previa en el CRM).");
  const { data: s, error } = await sb.storage.from("comercial-contracts").createSignedUrl(pdf, 3600);
  if (error || !s) throw error ?? new Error("No se pudo firmar el enlace del contrato.");

  const adjuntos = await adjuntosContrato(
    sb as never,
    quoteId,
    { url: s.signedUrl, name: `Contrato-${vars.codigo_cotizacion}${c.kind === "empresa" ? "-empresa" : ""}.pdf` },
    vars.codigo_cotizacion,
  );
  console.log("Adjuntos que van:", adjuntos.attachments?.map((a) => a.name) ?? [adjuntos.attachment_name]);
  console.log("¿Lleva la cotización como Anexo 1?", adjuntos.conCotizacion);

  const r = await enviarCorreoContrato(
    {
      code: vars.codigo_cotizacion,
      nombre: "Prueba dos adjuntos",
      email: destino,
      telefono: null,
      ruta: vars.ruta_nombre,
      fecha_inicio: null,
      personas: 0,
      alojamiento: null,
      total_eur: null,
      pdf_url: adjuntos.pdf_url,
      attachment_name: adjuntos.attachment_name,
      attachments: adjuntos.attachments,
      subject: `[PRUEBA] Contrato + Anexo 1 - ${vars.codigo_cotizacion} - dos adjuntos`,
      body:
        `Prueba: este correo debe traer DOS archivos adjuntos, el contrato y ` +
        `Anexo-1-Cotizacion-${vars.codigo_cotizacion}.pdf. Si llega uno solo, el fallo está en n8n/Brevo.`,
      aviso: false,
    },
    { supabase: sb as never, quoteId, prueba: true },
  );
  console.log("Resultado del envío:", r);
  if (!r.messageId) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
