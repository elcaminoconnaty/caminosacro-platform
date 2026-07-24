"use server";

// Firma pública del contrato. Seguridad: token único de 64 hex con expiración,
// validación de archivos, rate limit por IP, y trazabilidad completa de la firma
// (IP, user-agent, timestamp, hash SHA-256 del PDF firmado) — Ley 527/Dec. 2364.

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderContractPdfBuffer, sha256Hex, getOrgSignature } from "@/lib/contracts/render";
import type { ContractVariables, PaymentPlan } from "@/lib/contracts/template";
import { enviarCorreoContrato } from "@/lib/contracts/email";

export type ResultadoFirma =
  | { ok: true; emailEnviado: boolean }
  | { ok: false; error: string };

const PASSPORT_MAX_BYTES = 12 * 1024 * 1024;
const PASSPORT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const SIGNATURE_MAX_CHARS = 400_000; // data URL PNG del canvas (~300 KB reales)
const SIGNED_COPY_TTL = 60 * 60 * 24 * 30; // 30 días para el enlace del correo

// Rate limit en memoria (mismo enfoque que /cotizar): corta el abuso obvio.
const RATE = { max: 10, windowMs: 60 * 60 * 1000 };
const hits = new Map<string, number[]>();
function superaLimite(ip: string): boolean {
  const ahora = Date.now();
  const previos = (hits.get(ip) ?? []).filter((t) => ahora - t < RATE.windowMs);
  previos.push(ahora);
  hits.set(ip, previos);
  if (hits.size > 5000) hits.clear();
  return previos.length > RATE.max;
}

export async function firmarContrato(token: string, formData: FormData): Promise<ResultadoFirma> {
  if (!token || token.length < 32) return { ok: false, error: "Enlace no válido." };

  const cabeceras = await headers();
  const ip = (cabeceras.get("x-forwarded-for") ?? "desconocida").split(",")[0].trim();
  const userAgent = cabeceras.get("user-agent") ?? null;
  if (superaLimite(ip)) {
    return { ok: false, error: "Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo." };
  }

  const supabase = createAdminClient("comercial");
  const { data: c } = await supabase
    .from("contracts")
    .select("id,quote_id,status,token_expires_at,variables_json,payment_plan_json")
    .eq("token", token)
    .maybeSingle();

  if (!c) return { ok: false, error: "Este enlace de firma no existe o fue anulado." };
  if (c.status === "firmado") return { ok: false, error: "Este contrato ya fue firmado." };
  if (c.status !== "enviado") return { ok: false, error: "Este contrato no está habilitado para firma." };
  if (c.token_expires_at && new Date(c.token_expires_at).getTime() < Date.now()) {
    return { ok: false, error: "El enlace venció. Escríbenos a reservas@caminosacro.com y te enviamos uno nuevo." };
  }

  // ---- Entradas del formulario ----
  const signerName = String(formData.get("signer_name") || "").trim();
  const signerDocument = String(formData.get("signer_document") || "").trim();
  const accept = formData.get("accept");
  const signature = String(formData.get("signature") || "");
  const passport = formData.get("passport") as File | null;

  if (!accept) return { ok: false, error: "Debes aceptar la declaración para firmar." };
  if (signerName.length < 5) return { ok: false, error: "Escribe tu nombre completo." };
  if (signerDocument.length < 4) return { ok: false, error: "Escribe tu número de documento." };
  if (!signature.startsWith("data:image/png;base64,") || signature.length > SIGNATURE_MAX_CHARS) {
    return { ok: false, error: "La firma no es válida. Dibújala de nuevo." };
  }
  if (!passport || passport.size === 0) return { ok: false, error: "Falta la foto de tu pasaporte." };
  const ext = PASSPORT_TYPES[passport.type];
  if (!ext) return { ok: false, error: "El pasaporte debe ser una imagen (JPG, PNG, WebP) o un PDF." };
  if (passport.size > PASSPORT_MAX_BYTES) return { ok: false, error: "El archivo del pasaporte supera 12 MB." };

  const vars = c.variables_json as ContractVariables;
  const plan = c.payment_plan_json as PaymentPlan;
  const code = vars.codigo_cotizacion || c.quote_id;
  const signedAt = new Date().toISOString();

  // ---- 1. Pasaporte al bucket privado ----
  const passportFilename = `Pasaporte-${code}-${Date.now()}.${ext}`;
  const passportBuffer = Buffer.from(await passport.arrayBuffer());
  const { error: passErr } = await supabase.storage
    .from("comercial-passports")
    .upload(passportFilename, passportBuffer, { contentType: passport.type, upsert: true, cacheControl: "no-cache" });
  if (passErr) {
    console.error("[firmar] subida de pasaporte falló:", passErr);
    return { ok: false, error: "No pudimos guardar el pasaporte. Inténtalo de nuevo." };
  }

  // ---- 2. PDF firmado (con sello de trazabilidad) + hash ----
  // Firma guardada del organizador (Nico); si aún no la ha capturado, el PDF usa
  // su firma mecánica en cursiva (igualmente válida bajo la Ley 527).
  const orgSignature = await getOrgSignature(supabase);
  let signedPdf: Buffer;
  try {
    signedPdf = await renderContractPdfBuffer(
      vars,
      plan,
      {
        signer_name: signerName,
        signer_document: signerDocument,
        signature_image: signature,
        signed_at: signedAt,
        signer_ip: ip,
        signer_user_agent: userAgent,
        doc_hash: null, // el hash es del propio PDF; se calcula después y queda en la BD
      },
      orgSignature,
    );
  } catch (e) {
    console.error("[firmar] render del PDF firmado falló:", e);
    return { ok: false, error: "No pudimos generar el contrato firmado. Inténtalo de nuevo." };
  }
  const docHash = sha256Hex(signedPdf);

  const signedFilename = `Contrato-${code}-firmado.pdf`;
  const { error: pdfErr } = await supabase.storage
    .from("comercial-contracts")
    .upload(signedFilename, signedPdf, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (pdfErr) {
    console.error("[firmar] subida del PDF firmado falló:", pdfErr);
    return { ok: false, error: "No pudimos guardar el contrato firmado. Inténtalo de nuevo." };
  }

  // ---- 3. Cierre del contrato (condicionado al estado para evitar doble firma) ----
  const { data: updated, error: updErr } = await supabase
    .from("contracts")
    .update({
      status: "firmado",
      signed_pdf_path: `comercial-contracts/${signedFilename}`,
      passport_path: `comercial-passports/${passportFilename}`,
      signer_name: signerName,
      signer_document: signerDocument,
      signer_email: vars.viajero_email || null,
      signature_image: signature,
      signed_at: signedAt,
      signer_ip: ip,
      signer_user_agent: userAgent,
      doc_hash: docHash,
      token: null,
      token_expires_at: null,
    })
    .eq("id", c.id)
    .eq("status", "enviado")
    .select("id")
    .maybeSingle();
  if (updErr || !updated) {
    console.error("[firmar] update falló:", updErr);
    return { ok: false, error: "No pudimos registrar la firma. Inténtalo de nuevo." };
  }

  // ---- 4. Copia por correo (webhook n8n → Brevo; también avisa a reservas@) ----
  let emailEnviado = false;
  const { data: signedUrl } = await supabase.storage
    .from("comercial-contracts")
    .createSignedUrl(signedFilename, SIGNED_COPY_TTL);
  if (vars.viajero_email) {
    emailEnviado = await enviarCorreoContrato({
      code,
      nombre: signerName,
      email: vars.viajero_email,
      telefono: vars.viajero_telefono || null,
      ruta: vars.ruta_nombre || null,
      fecha_inicio: vars.fecha_inicio || null,
      personas: Number(vars.num_personas) || 1,
      alojamiento: vars.modalidad || null,
      total_eur: null,
      pdf_url: signedUrl?.signedUrl ?? null,
      subject: `Tu contrato firmado — Camino Sacro ${code}`,
      body: [
        `Hola ${signerName.split(/\s+/)[0]},`,
        ``,
        `¡Listo! Tu contrato quedó firmado el ${new Date(signedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}.`,
        ``,
        `Adjunto encuentras tu copia del Acuerdo de Prestación de Servicios Turísticos (cotización ${code}).`,
        `Huella digital del documento (SHA-256): ${docHash}`,
        ``,
        `Nuestro equipo continúa con la gestión de tus reservas y te iremos contando cada avance.`,
        ``,
        `Buen Camino,`,
        `Camino Sacro · reservas@caminosacro.com`,
      ].join("\n"),
    });
  }

  // Nota: sin revalidatePath aquí — invalidaría el router del navegador del
  // peregrino y la página se recargaría como "enlace no válido" (el token ya es
  // null), tapando la pantalla de éxito. Seguimiento es dinámico y verá el
  // contrato firmado en la próxima carga sin necesidad de revalidar.
  return { ok: true, emailEnviado };
}
