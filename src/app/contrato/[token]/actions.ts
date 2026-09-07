"use server";

// Firma pública del contrato. Seguridad: token único de 64 hex con expiración,
// validación de archivos, rate limit por token (y por IP con tope holgado), y
// trazabilidad completa de la firma (IP, user-agent, timestamp, hash SHA-256 del
// PDF firmado) — Ley 527/Dec. 2364.

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderContractPdfBuffer, sha256Hex, getOrgSignature } from "@/lib/contracts/render";
import {
  esEmpresa,
  destinatarioContrato,
  saludoContrato,
  type ContractVariables,
  type PaymentPlan,
  type ViajeroAnexo,
} from "@/lib/contracts/template";
import { enviarCorreoContrato } from "@/lib/contracts/email";
import { rutaContrato, rutaContratoEmpresa, rutaPasaporte, sinBucket } from "@/lib/storage/paths";

export type ResultadoFirma =
  | { ok: true; emailEnviado: boolean }
  | { ok: false; error: string };

const PASSPORT_MAX_BYTES = 12 * 1024 * 1024;
const PASSPORT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  // Formato nativo de las fotos de iPhone. Safari suele convertirlo a JPEG al subirlo y
  // el navegador lo recomprime a JPEG antes de enviarlo, pero algunos Android lo mandan
  // tal cual y no vale la pena rechazar la firma por eso.
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};
const SIGNATURE_MAX_CHARS = 400_000; // data URL PNG del canvas (~300 KB reales)
const SIGNED_COPY_TTL = 60 * 60 * 24 * 30; // 30 días para el enlace del correo

// Rate limit en memoria (mismo enfoque que /cotizar): corta el abuso obvio.
// La clave que manda es el token, que es uno por viajero: así se frena la fuerza
// bruta contra un contrato concreto. Por IP el tope es holgado a propósito — un
// grupo que firma junto (la familia en la misma casa, el WiFi del hotel) sale con
// una sola IP pública, y con un tope bajo el viajero 11 no podría firmar.
const RATE_TOKEN = { max: 8, windowMs: 60 * 60 * 1000 };
const RATE_IP = { max: 120, windowMs: 60 * 60 * 1000 };
const hits = new Map<string, number[]>();
function superaLimite(clave: string, regla: { max: number; windowMs: number }): boolean {
  const ahora = Date.now();
  const previos = (hits.get(clave) ?? []).filter((t) => ahora - t < regla.windowMs);
  previos.push(ahora);
  hits.set(clave, previos);
  if (hits.size > 5000) hits.clear();
  return previos.length > regla.max;
}

export async function firmarContrato(token: string, formData: FormData): Promise<ResultadoFirma> {
  if (!token || token.length < 32) return { ok: false, error: "Enlace no válido." };

  const cabeceras = await headers();
  // Sin cabecera de IP no metemos a todo el mundo en un mismo cubo: sería un cupo
  // compartido por toda la plataforma. El límite por token ya cubre ese caso.
  const ipCliente = (cabeceras.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ip = ipCliente ?? "desconocida";
  const userAgent = cabeceras.get("user-agent") ?? null;
  // Los dos se evalúan siempre para que ninguno de los dos contadores se quede corto.
  const excedeToken = superaLimite(`token:${token}`, RATE_TOKEN);
  const excedeIp = ipCliente ? superaLimite(`ip:${ipCliente}`, RATE_IP) : false;
  if (excedeToken || excedeIp) {
    return {
      ok: false,
      error: "Demasiados intentos seguidos con este enlace. Espera un momento y vuelve a intentarlo; " +
        "si sigue pasando, escríbenos a reservas@caminosacro.com.",
    };
  }

  const supabase = createAdminClient("comercial");
  const { data: c } = await supabase
    .from("contracts")
    .select("id,quote_id,traveler_id,company_id,status,token_expires_at,variables_json,payment_plan_json,kind,travelers_json,org_signer")
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

  const varsBase = c.variables_json as ContractVariables;
  // Contrato de empresa: firma el representante legal y NO sube pasaporte — los de los
  // viajeros los carga el equipo desde el CRM. Todo lo demás (firma, hash, trazabilidad,
  // guarda contra doble firma) es idéntico en las dos modalidades.
  const empresa = c.kind === "empresa" || esEmpresa(varsBase);

  if (!accept) return { ok: false, error: "Debes aceptar la declaración para firmar." };
  if (signerName.length < 5) return { ok: false, error: "Escribe tu nombre completo." };
  if (signerDocument.length < 4) return { ok: false, error: "Escribe tu número de documento." };
  if (!signature.startsWith("data:image/png;base64,") || signature.length > SIGNATURE_MAX_CHARS) {
    return { ok: false, error: "La firma no es válida. Dibújala de nuevo." };
  }

  let ext = "";
  if (!empresa) {
    if (!passport || passport.size === 0) return { ok: false, error: "Falta la foto de tu pasaporte." };
    ext = PASSPORT_TYPES[passport.type];
    if (!ext) return { ok: false, error: "El pasaporte debe ser una imagen (JPG, PNG, WebP) o un PDF." };
    if (passport.size > PASSPORT_MAX_BYTES) return { ok: false, error: "El archivo del pasaporte supera 12 MB." };
  }

  // El documento que teclea quien firma queda dentro del contrato: el pasaporte del
  // viajero, o la cédula del representante legal de la empresa.
  const vars: ContractVariables = empresa
    ? { ...varsBase, rep_nombre: signerName, rep_documento: signerDocument }
    : { ...varsBase, viajero_tipo_documento: "Pasaporte", viajero_documento: signerDocument };
  const plan = c.payment_plan_json as PaymentPlan;
  const code = vars.codigo_cotizacion || c.quote_id;
  const signedAt = new Date().toISOString();

  // En un grupo hay un contrato por viajero: sin la posición en el nombre, el PDF
  // firmado de uno pisaría el de otro dentro de la carpeta de la cotización.
  const { data: viajero } = c.traveler_id
    ? await supabase.from("quote_travelers").select("position").eq("id", c.traveler_id).maybeSingle()
    : { data: null };
  const posicion = viajero?.position ?? null;

  // ---- 1. Pasaporte al bucket privado (solo contrato por viajero) ----
  let passportPath: string | null = null;
  if (!empresa && passport) {
    passportPath = rutaPasaporte(code, ext);
    const passportBuffer = Buffer.from(await passport.arrayBuffer());
    const { error: passErr } = await supabase.storage
      .from("comercial-passports")
      .upload(sinBucket(passportPath), passportBuffer, { contentType: passport.type, upsert: true, cacheControl: "no-cache" });
    if (passErr) {
      console.error("[firmar] subida de pasaporte falló:", passErr);
      return { ok: false, error: "No pudimos guardar el pasaporte. Inténtalo de nuevo." };
    }
  }

  // ---- 2. PDF firmado (con sello de trazabilidad) + hash ----
  // Firma guardada de quien firma por Camino Sacro en ESTE contrato (Nico o Nathalia); si
  // aún no la capturó, el PDF usa su firma mecánica en cursiva (igualmente válida bajo la
  // Ley 527).
  const orgSignature = await getOrgSignature(supabase, c.org_signer as string | null);
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
      // El anexo se firma tal como se congeló al crear el contrato.
      empresa ? ((c.travelers_json as ViajeroAnexo[]) ?? []) : null,
    );
  } catch (e) {
    console.error("[firmar] render del PDF firmado falló:", e);
    return { ok: false, error: "No pudimos generar el contrato firmado. Inténtalo de nuevo." };
  }
  const docHash = sha256Hex(signedPdf);

  const signedPdfPath = empresa ? rutaContratoEmpresa(code, true) : rutaContrato(code, true, posicion);
  const { error: pdfErr } = await supabase.storage
    .from("comercial-contracts")
    .upload(sinBucket(signedPdfPath), signedPdf, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (pdfErr) {
    console.error("[firmar] subida del PDF firmado falló:", pdfErr);
    return { ok: false, error: "No pudimos guardar el contrato firmado. Inténtalo de nuevo." };
  }

  // ---- 3. Cierre del contrato (condicionado al estado para evitar doble firma) ----
  const { data: updated, error: updErr } = await supabase
    .from("contracts")
    .update({
      status: "firmado",
      variables_json: vars, // ahora con el número de pasaporte del firmante
      signed_pdf_path: signedPdfPath,
      passport_path: passportPath,
      signer_name: signerName,
      signer_document: signerDocument,
      signer_email: destinatarioContrato(vars).email || null,
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

  // El nombre y el pasaporte reales quedan en la ficha del viajero: de ahí los toma
  // el correo a Pilgrim, sin tener que abrir el variables_json de cada contrato.
  // Que esto falle no invalida una firma ya registrada, así que no corta el flujo.
  // En el contrato de empresa no hay viajero que actualizar: quien firmó es la sociedad.
  if (!empresa && c.traveler_id) {
    const { error: viajeroErr } = await supabase
      .from("quote_travelers")
      .update({
        full_name: signerName,
        document_type: "Pasaporte",
        document_number: signerDocument,
        passport_path: passportPath,
        updated_at: signedAt,
      })
      .eq("id", c.traveler_id);
    if (viajeroErr) console.error("[firmar] no se pudo actualizar el viajero:", viajeroErr);
  }

  // Los datos del representante legal vuelven a la ficha de la empresa, que es de donde
  // salen precargados la próxima vez que esa empresa contrate.
  if (empresa && c.company_id) {
    const { error: empErr } = await supabase
      .from("companies")
      .update({ rep_name: signerName, rep_document_number: signerDocument })
      .eq("id", c.company_id);
    if (empErr) console.error("[firmar] no se pudo actualizar la empresa:", empErr);
  }

  // ---- 4. Copia por correo (webhook n8n → Brevo; también avisa a reservas@) ----
  let emailEnviado = false;
  const { data: signedUrl } = await supabase.storage
    .from("comercial-contracts")
    .createSignedUrl(sinBucket(signedPdfPath), SIGNED_COPY_TTL);
  const { email: correoParte, nombre: nombreParte } = destinatarioContrato(vars);
  if (correoParte) {
    const envio = await enviarCorreoContrato({
      code,
      nombre: signerName,
      email: correoParte,
      telefono: (empresa ? vars.empresa_telefono : vars.viajero_telefono) || null,
      ruta: vars.ruta_nombre || null,
      fecha_inicio: vars.fecha_inicio || null,
      personas: Number(vars.num_personas) || 1,
      alojamiento: vars.modalidad || null,
      total_eur: null,
      pdf_url: signedUrl?.signedUrl ?? null,
      subject: `${empresa ? nombreParte : signerName} - Contrato firmado - ${code}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      body: (empresa
        ? [
            `Hola ${signerName.split(/\s+/)[0]},`,
            ``,
            `¡Listo! El contrato de ${vars.empresa_razon_social || "la empresa"} quedó firmado el ${new Date(signedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}.`,
            ``,
            `Adjunto encuentras la copia del Acuerdo de Prestación de Servicios Turísticos No. ${code}, con la relación de viajeros en el Anexo No. 2.`,
            `Huella digital del documento (SHA-256): ${docHash}`,
            ``,
            `Si aún faltan pasaportes de algún viajero, envíalos a este mismo correo: los necesitamos para confirmar las reservas.`,
            ``,
            `Buen Camino,`,
            `Camino Sacro · reservas@caminosacro.com`,
          ]
        : [
            `Hola ${signerName.split(/\s+/)[0]},`,
            ``,
            `¡Listo! Tu contrato quedó firmado el ${new Date(signedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}.`,
            ``,
            `Adjunto encuentras tu copia del Acuerdo de Prestación de Servicios Turísticos No. ${code}.`,
            `Huella digital del documento (SHA-256): ${docHash}`,
            ``,
            `Nuestro equipo continúa con la gestión de tus reservas y te iremos contando cada avance.`,
            ``,
            `Buen Camino,`,
            `Camino Sacro · reservas@caminosacro.com`,
          ]
      ).join("\n"),
      attachment_name: `Contrato-${code}${empresa ? "-empresa" : ""}-firmado.pdf`,
      // El correo que le llega a reservas@ (Nico). El asunto describe el evento en
      // voz de adentro y NO repite el del correo del viajero: si fuera el mismo, en
      // la bandeja se verían como un solo correo duplicado.
      aviso_subject: `Firmó ${empresa ? nombreParte : signerName} - ${code}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      aviso_body: [
        `Se firmó un contrato.`,
        ``,
        `Contrato: ${code}${empresa ? " (empresa)" : ""}`,
        `Cliente: ${empresa ? `${nombreParte} · NIT ${vars.empresa_nit || "-"}` : signerName}`,
        empresa ? `Firmó: ${signerName} · ${vars.rep_tipo_documento || "documento"} ${signerDocument}` : `Pasaporte: ${signerDocument}`,
        ...(empresa ? [`Viajeros en el anexo: ${((c.travelers_json as ViajeroAnexo[]) ?? []).length}`] : []),
        `Ruta: ${vars.ruta_nombre || "-"}`,
        `Fecha de firma: ${new Date(signedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`,
        `Huella SHA-256: ${docHash}`,
        ``,
        `Contrato firmado y pasaporte disponibles en Seguimiento:`,
        `https://caminosacro-platform-production.up.railway.app/seguimiento`,
      ].join("\n"),
    }, { supabase, quoteId: c.quote_id });
    emailEnviado = envio.ok;
    // Si la copia no salió, la firma ya está registrada y el viajero ve la pantalla de
    // éxito: el motivo queda en `email_log` (tipo `contrato`) para que se pueda reenviar
    // sabiendo qué pasó, en vez de perderse en los logs del servidor.
    if (!envio.ok) console.error("[firmar] la copia al firmante no salió:", envio.error);
  }

  // Nota: sin revalidatePath aquí — invalidaría el router del navegador del
  // peregrino y la página se recargaría como "enlace no válido" (el token ya es
  // null), tapando la pantalla de éxito. Seguimiento es dinámico y verá el
  // contrato firmado en la próxima carga sin necesidad de revalidar.
  return { ok: true, emailEnviado };
}
