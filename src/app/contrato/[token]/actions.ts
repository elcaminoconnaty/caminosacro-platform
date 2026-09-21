"use server";

// Firma pública del contrato. Seguridad: token único de 64 hex con expiración,
// código de un solo uso al correo del firmante (OTP), validación de archivos, rate
// limit por token (y por IP con tope holgado), y trazabilidad completa de la firma:
// IP, user-agent, ubicación aproximada, momento, texto aceptado, hash SHA-256 del
// documento original y del firmado — Ley 527/1999 y Decreto 2364/2012.
//
// El PDF firmado cierra con un Informe de Firmas (la misma hoja que ZapSign): por eso se
// renderiza dos veces. La primera, sin informe, es el documento tal como se presentó al
// firmante y su huella es la que se imprime; la segunda lleva el informe y es la que se
// guarda, se envía y se puede comprobar en /verificar.

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderContractPdfBuffer, sha256Hex, getOrgSignature, getFirmante, contarPaginas } from "@/lib/contracts/render";
import {
  esEmpresa,
  destinatarioContrato,
  llevaPagare,
  type ContractVariables,
  type PaymentPlan,
  type ViajeroAnexo,
} from "@/lib/contracts/template";
import { enviarCorreoContrato } from "@/lib/contracts/email";
import { adjuntosContrato } from "@/lib/contracts/adjuntos";
import { rutaContrato, rutaContratoEmpresa, rutaPasaporte, sinBucket } from "@/lib/storage/paths";
import {
  hashCodigo, huellaLegible, mismoHash, nuevoCodigo, trazoValido, ubicacionPlausible,
  OTP_MAX_INTENTOS, OTP_MAX_POR_HORA, OTP_VIGENCIA_MIN,
} from "@/lib/contracts/firma";
import { textoConsentimiento } from "@/lib/contracts/consentimiento";
import { comoSeSaluda, correoCodigoFirmaHtml } from "@/lib/contracts/otpHtml";
import type { FirmanteInforme, InformeFirmasProps } from "@/lib/contracts/informeFirmas";
import { baseUrlApp } from "@/lib/email/versionWeb";

export type ResultadoFirma =
  | { ok: true; emailEnviado: boolean; huella: string; urlVerificacion: string }
  | { ok: false; error: string };

export type ResultadoCodigo = { ok: true; correo: string } | { ok: false; error: string };

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

type Huella = { ip: string | null; userAgent: string | null };

/** IP y dispositivo se leen acá, en el servidor: un dato de evidencia que el firmante puede escribir no vale nada. */
async function huellaDelPedido(): Promise<Huella> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

type Admin = ReturnType<typeof createAdminClient>;

/** Deja constancia en la bitácora. Nunca tumba una firma por no poder anotar. */
async function anotar(supabase: Admin, contractId: string, event: string, huella?: Huella, detail?: unknown) {
  try {
    await supabase.from("contract_events").insert({
      contract_id: contractId,
      event,
      ip: huella?.ip ?? null,
      user_agent: huella?.userAgent ?? null,
      detail: detail ?? null,
    });
  } catch (e) {
    console.error("[firma] no pude anotar el evento", event, e);
  }
}

const zonaBogota = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", dateStyle: "long", timeStyle: "medium",
});
const enBogota = (d: Date | string) => zonaBogota.format(typeof d === "string" ? new Date(d) : d);

/** El contrato que hay detrás de un token, si está habilitado para firmar. */
async function contratoFirmable(supabase: Admin, token: string) {
  const { data: c } = await supabase
    .from("contracts")
    .select("id,quote_id,traveler_id,company_id,status,token_expires_at,variables_json,payment_plan_json,kind,travelers_json,org_signer,created_at,sent_at")
    .eq("token", token)
    .maybeSingle();
  if (!c) return { error: "Este enlace de firma no existe o fue anulado." };
  if (c.status === "firmado") return { error: "Este contrato ya fue firmado." };
  if (c.status !== "enviado") return { error: "Este contrato no está habilitado para firma." };
  if (c.token_expires_at && new Date(c.token_expires_at).getTime() < Date.now()) {
    return { error: "El enlace venció. Escríbenos a reservas@caminosacro.com y te enviamos uno nuevo." };
  }
  return { c, error: null };
}

// ---------------------------------------------------------------------------
// Paso 1: el código al correo
// ---------------------------------------------------------------------------

export async function pedirCodigo(token: string): Promise<ResultadoCodigo> {
  if (!token || token.length < 32) return { ok: false, error: "Enlace no válido." };
  const huella = await huellaDelPedido();
  if (superaLimite(`otp:${token}`, RATE_TOKEN)) {
    return { ok: false, error: "Pediste muchos códigos seguidos. Espera un momento y vuelve a intentarlo." };
  }

  const supabase = createAdminClient("comercial");
  const r = await contratoFirmable(supabase, token);
  if (r.error || !r.c) return { ok: false, error: r.error ?? "Enlace no válido." };
  const c = r.c;

  const vars = c.variables_json as ContractVariables;
  const { email, nombre } = destinatarioContrato(vars);
  if (!email) {
    return { ok: false, error: "Este contrato no tiene un correo de notificaciones. Escríbenos a reservas@caminosacro.com." };
  }

  // Freno por contrato, en la base: sobrevive a un reinicio del servidor.
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase
    .from("contract_otps")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", c.id)
    .gte("created_at", haceUnaHora);
  if ((count ?? 0) >= OTP_MAX_POR_HORA) {
    return { ok: false, error: "Pediste muchos códigos en la última hora. Espera un rato y vuelve a intentarlo." };
  }

  const codigo = nuevoCodigo();
  const { error: errOtp } = await supabase.from("contract_otps").insert({
    contract_id: c.id,
    code_hash: hashCodigo(codigo, c.id),
    expires_at: new Date(Date.now() + OTP_VIGENCIA_MIN * 60_000).toISOString(),
  });
  if (errOtp) {
    console.error("[firma] no pude guardar el código:", errOtp);
    return { ok: false, error: "No pudimos generar el código. Inténtalo de nuevo." };
  }

  const code = vars.codigo_cotizacion || c.quote_id;
  const primerNombre = (esEmpresa(vars) ? vars.rep_nombre || nombre : nombre).trim().split(/\s+/)[0] || "";
  const envio = await enviarCorreoContrato(
    {
      code,
      nombre: nombre || primerNombre,
      email,
      telefono: (esEmpresa(vars) ? vars.empresa_telefono : vars.viajero_telefono) || null,
      ruta: vars.ruta_nombre || null,
      fecha_inicio: vars.fecha_inicio || null,
      personas: Number(vars.num_personas) || 1,
      alojamiento: vars.modalidad || null,
      total_eur: null,
      pdf_url: null,
      subject: `${codigo} es tu código para firmar el contrato ${code}`,
      // Maquetado con la papelería de la marca; `body` sigue siendo el respaldo en texto
      // plano (y lo que se guarda en `email_log` junto al HTML).
      html: correoCodigoFirmaHtml({
        code,
        primerNombre,
        codigo,
        minutos: OTP_VIGENCIA_MIN,
        ruta: vars.ruta_nombre || null,
        razonSocial: esEmpresa(vars) ? vars.empresa_razon_social || null : null,
        email: "reservas@caminosacro.com",
      }),
      body: [
        `Hola ${comoSeSaluda(primerNombre) || "peregrino"},`,
        ``,
        `Este es tu código para firmar el contrato ${code}:`,
        ``,
        `    ${codigo}`,
        ``,
        `Vence en ${OTP_VIGENCIA_MIN} minutos. Escríbelo en la página donde estás firmando.`,
        ``,
        `Si no fuiste tú quien lo pidió, ignora este correo: sin el código nadie puede firmar por ti.`,
        `Nunca te lo vamos a pedir por WhatsApp ni por teléfono.`,
        ``,
        `Camino Sacro · reservas@caminosacro.com`,
      ].join("\n"),
      // Un código de un solo uso no es un evento del negocio: no avisa a reservas@.
      aviso: false,
    },
    { supabase, quoteId: c.quote_id },
  );

  await anotar(supabase, c.id, envio.ok ? "otp_enviado" : "otp_fallido", huella, envio.ok ? { correo: email } : { error: envio.error });
  if (!envio.ok) {
    console.error("[firma] el código no salió:", envio.error);
    return { ok: false, error: "No pudimos enviar el código a tu correo. Inténtalo de nuevo en un momento." };
  }
  return { ok: true, correo: email };
}

// ---------------------------------------------------------------------------
// Paso 2: la firma
// ---------------------------------------------------------------------------

export async function firmarContrato(token: string, formData: FormData): Promise<ResultadoFirma> {
  if (!token || token.length < 32) return { ok: false, error: "Enlace no válido." };

  const huella = await huellaDelPedido();
  const ip = huella.ip ?? "desconocida";
  const userAgent = huella.userAgent;
  // Los dos se evalúan siempre para que ninguno de los dos contadores se quede corto.
  const excedeToken = superaLimite(`token:${token}`, RATE_TOKEN);
  const excedeIp = huella.ip ? superaLimite(`ip:${huella.ip}`, RATE_IP) : false;
  if (excedeToken || excedeIp) {
    return {
      ok: false,
      error: "Demasiados intentos seguidos con este enlace. Espera un momento y vuelve a intentarlo; " +
        "si sigue pasando, escríbenos a reservas@caminosacro.com.",
    };
  }

  const supabase = createAdminClient("comercial");
  const r = await contratoFirmable(supabase, token);
  if (r.error || !r.c) return { ok: false, error: r.error ?? "Enlace no válido." };
  const c = r.c;

  // ---- Entradas del formulario ----
  const signerName = String(formData.get("signer_name") || "").trim();
  const signerDocument = String(formData.get("signer_document") || "").trim();
  const accept = formData.get("accept");
  const signature = String(formData.get("signature") || "");
  const codigo = String(formData.get("codigo") || "").replace(/\D/g, "");
  const geoCrudo = String(formData.get("geo") || "");
  const passport = formData.get("passport") as File | null;

  const varsBase = c.variables_json as ContractVariables;
  // Contrato de empresa: firma el representante legal y NO sube pasaporte — los de los
  // viajeros los carga el equipo desde el CRM. Todo lo demás (código, firma, hash,
  // trazabilidad, guarda contra doble firma) es idéntico en las dos modalidades.
  const empresa = c.kind === "empresa" || esEmpresa(varsBase);

  if (!accept) return { ok: false, error: "Debes aceptar la declaración para firmar." };
  if (signerName.length < 5) return { ok: false, error: "Escribe tu nombre completo." };
  if (signerDocument.length < 4) return { ok: false, error: "Escribe tu número de documento." };
  const trazo = trazoValido(signature);
  if (!trazo.ok) return { ok: false, error: trazo.error };
  if (codigo.length !== 6) return { ok: false, error: "Escribe el código de seis dígitos que te llegó al correo." };
  // Viene del navegador: solo se guarda si tiene forma de coordenada.
  const geo = ubicacionPlausible(geoCrudo) ? geoCrudo : null;

  let ext = "";
  if (!empresa) {
    if (!passport || passport.size === 0) return { ok: false, error: "Falta la foto de tu pasaporte." };
    ext = PASSPORT_TYPES[passport.type];
    if (!ext) return { ok: false, error: "El pasaporte debe ser una imagen (JPG, PNG, WebP) o un PDF." };
    if (passport.size > PASSPORT_MAX_BYTES) return { ok: false, error: "El archivo del pasaporte supera 12 MB." };
  }

  // ---- El código ----
  const { data: otp } = await supabase
    .from("contract_otps")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("contract_id", c.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!otp) return { ok: false, error: "Primero pide el código a tu correo." };
  if (new Date(otp.expires_at) < new Date()) return { ok: false, error: "El código venció. Pide uno nuevo." };
  if (otp.attempts >= OTP_MAX_INTENTOS) return { ok: false, error: "Demasiados intentos con ese código. Pide uno nuevo." };
  if (!mismoHash(hashCodigo(codigo, c.id), otp.code_hash)) {
    await supabase.from("contract_otps").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
    await anotar(supabase, c.id, "otp_fallido", huella, { intento: otp.attempts + 1 });
    const quedan = OTP_MAX_INTENTOS - otp.attempts - 1;
    return {
      ok: false,
      error: quedan > 0 ? `El código no coincide. Te quedan ${quedan} intentos.` : "Se acabaron los intentos. Pide un código nuevo.",
    };
  }
  await supabase.from("contract_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
  await anotar(supabase, c.id, "otp_validado", huella);

  // El documento que teclea quien firma queda dentro del contrato: el pasaporte del
  // viajero, o la cédula del representante legal de la empresa.
  const vars: ContractVariables = empresa
    ? { ...varsBase, rep_nombre: signerName, rep_documento: signerDocument }
    : { ...varsBase, viajero_tipo_documento: "Pasaporte", viajero_documento: signerDocument };
  const plan = c.payment_plan_json as PaymentPlan;
  const code = vars.codigo_cotizacion || c.quote_id;
  const ahora = new Date();
  const signedAt = ahora.toISOString();
  const consentimiento = textoConsentimiento({ empresa, financiado: llevaPagare(plan), razonSocial: vars.empresa_razon_social });
  const telefonoFirmante = (empresa ? vars.empresa_telefono : vars.viajero_telefono) || null;
  const { email: correoParte, nombre: nombreParte } = destinatarioContrato(vars);

  // En un grupo hay un contrato por viajero: sin la posición en el nombre, el PDF
  // firmado de uno pisaría el de otro dentro de la carpeta de la cotización.
  const { data: viajero } = c.traveler_id
    ? await supabase.from("quote_travelers").select("position").eq("id", c.traveler_id).maybeSingle()
    : { data: null };
  const posicion = viajero?.position ?? null;

  // ---- 1. Pasaporte al bucket privado (solo contrato por viajero) ----
  // Si algo falla después, se borra en `limpiarPasaporte`: un pasaporte huérfano en el
  // bucket es exactamente lo que la auditoría encontró treinta veces.
  let passportPath: string | null = null;
  const limpiarPasaporte = async () => {
    if (!passportPath) return;
    await supabase.storage.from("comercial-passports").remove([sinBucket(passportPath)]).catch(() => {});
  };
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

  // ---- 2. El PDF firmado, en dos pasadas, con su Informe de Firmas ----
  // Firma guardada de quien firma por Camino Sacro en ESTE contrato (Nico o Nathalia); si
  // aún no la capturó, el PDF usa su firma mecánica en cursiva (igualmente válida bajo la
  // Ley 527).
  const firmanteOrg = await getFirmante(supabase, c.org_signer as string | null);
  const orgSignature = await getOrgSignature(supabase, c.org_signer as string | null);
  const anexo = empresa ? ((c.travelers_json as ViajeroAnexo[]) ?? []) : null;
  const firma = {
    signer_name: signerName,
    signer_document: signerDocument,
    signature_image: signature,
    signed_at: signedAt,
    signer_ip: ip,
    signer_user_agent: userAgent,
    doc_hash: null,
  };
  const urlVerificacionBase = `${baseUrlApp()}/verificar`;

  let signedPdf: Buffer;
  let originalHash: string;
  try {
    // Primera pasada: el documento tal como se le presentó al firmante, sin informe. Su
    // huella es la que se imprime en el informe.
    const original = await renderContractPdfBuffer(vars, plan, firma, orgSignature, anexo, { numero: c.id });
    originalHash = sha256Hex(original);

    const firmantes: FirmanteInforme[] = [
      {
        rol: "camino_sacro", rolTexto: "Camino Sacro", token: c.id,
        nombre: firmanteOrg.nombre, documento: `${firmanteOrg.documento_tipo} ${firmanteOrg.documento}`,
        email: "reservas@caminosacro.com", telefono: null,
        firmadoEn: enBogota(c.sent_at ?? c.created_at),
        ip: null, dispositivo: null, ubicacion: null,
        metodo: "Firmado desde la plataforma al aprobar y enviar, con sesión autenticada",
        trazo: orgSignature,
      },
      {
        rol: "contratante", rolTexto: empresa ? "El Contratante · representante legal" : "El Viajero",
        token: otp.id,
        nombre: signerName,
        documento: `${(empresa ? vars.rep_tipo_documento : "Pasaporte") || "Documento"} ${signerDocument}`,
        email: correoParte || "—", telefono: telefonoFirmante,
        firmadoEn: enBogota(ahora),
        ip: huella.ip, dispositivo: userAgent, ubicacion: geo,
        metodo: "Validado por código único enviado por correo electrónico",
        trazo: signature,
      },
    ];
    const informe: InformeFirmasProps = {
      numero: c.id,
      documento: `Acuerdo de Prestación de Servicios Turísticos · Contrato No. ${code}${empresa ? " (empresa)" : ""}`,
      creadoEn: enBogota(c.created_at),
      actualizadoEn: enBogota(ahora),
      huellaOriginal: huellaLegible(originalHash),
      urlVerificacion: urlVerificacionBase,
      firmantes,
      paginas: contarPaginas(original) + 1,
    };

    // Segunda pasada: el documento definitivo, con el Informe de Firmas al final. Si el
    // informe ocupó más de una página, una tercera con el número real.
    signedPdf = await renderContractPdfBuffer(vars, plan, firma, orgSignature, anexo, { informe, numero: c.id });
    const paginasReales = contarPaginas(signedPdf);
    if (paginasReales !== informe.paginas) {
      informe.paginas = paginasReales;
      signedPdf = await renderContractPdfBuffer(vars, plan, firma, orgSignature, anexo, { informe, numero: c.id });
    }
  } catch (e) {
    console.error("[firmar] render del PDF firmado falló:", e);
    await limpiarPasaporte();
    return { ok: false, error: "No pudimos generar el contrato firmado. Inténtalo de nuevo." };
  }
  const docHash = sha256Hex(signedPdf);

  const signedPdfPath = empresa ? rutaContratoEmpresa(code, true) : rutaContrato(code, true, posicion);
  const { error: pdfErr } = await supabase.storage
    .from("comercial-contracts")
    .upload(sinBucket(signedPdfPath), signedPdf, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (pdfErr) {
    console.error("[firmar] subida del PDF firmado falló:", pdfErr);
    await limpiarPasaporte();
    return { ok: false, error: "No pudimos guardar el contrato firmado. Inténtalo de nuevo." };
  }

  // ---- 3. Cierre del contrato (condicionado al estado para evitar doble firma) ----
  // El token NO se anula: el viajero tiene que poder volver a abrir su enlace y ver que
  // ya firmó. La página distingue el estado y esta acción revalida `enviado`.
  const { data: updated, error: updErr } = await supabase
    .from("contracts")
    .update({
      status: "firmado",
      variables_json: vars, // ahora con el número de pasaporte del firmante
      signed_pdf_path: signedPdfPath,
      passport_path: passportPath,
      signer_name: signerName,
      signer_document: signerDocument,
      signer_email: correoParte || null,
      signer_phone: telefonoFirmante,
      signature_image: signature,
      signed_at: signedAt,
      signer_ip: ip,
      signer_user_agent: userAgent,
      signer_geo: geo,
      signer_auth_method: "otp_email",
      consent_text: consentimiento,
      pdf_original_sha256: originalHash,
      doc_hash: docHash,
    })
    .eq("id", c.id)
    .eq("status", "enviado")
    .select("id")
    .maybeSingle();
  if (updErr || !updated) {
    console.error("[firmar] update falló:", updErr);
    await limpiarPasaporte();
    return { ok: false, error: "No pudimos registrar la firma. Inténtalo de nuevo." };
  }

  await anotar(supabase, c.id, "firmado", huella, { sha256: docHash, original: originalHash, geo });
  await anotar(supabase, c.id, "pdf_sellado", undefined, { ruta: signedPdfPath });

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
  const urlVerificacion = `${urlVerificacionBase}/${docHash}`;
  const fechaFirmaTexto = enBogota(ahora);
  let emailEnviado = false;
  const { data: signedUrl } = await supabase.storage
    .from("comercial-contracts")
    .createSignedUrl(sinBucket(signedPdfPath), SIGNED_COPY_TTL);
  if (correoParte) {
    // Contrato firmado + cotización (Anexo 1). Los demás anexos van dentro del PDF.
    const adjuntos = await adjuntosContrato(
      supabase,
      c.quote_id,
      { url: signedUrl?.signedUrl ?? null, name: `Contrato-${code}${empresa ? "-empresa" : ""}-firmado.pdf` },
      code,
    );
    const anexo1 = adjuntos.conCotizacion ? " y la cotización como Anexo No. 1" : "";
    const envio = await enviarCorreoContrato({
      code,
      nombre: signerName,
      email: correoParte,
      telefono: telefonoFirmante,
      ruta: vars.ruta_nombre || null,
      fecha_inicio: vars.fecha_inicio || null,
      personas: Number(vars.num_personas) || 1,
      alojamiento: vars.modalidad || null,
      total_eur: null,
      pdf_url: adjuntos.pdf_url,
      attachments: adjuntos.attachments,
      subject: `${empresa ? nombreParte : signerName} - Contrato firmado - ${code}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      body: (empresa
        ? [
            `Hola ${signerName.split(/\s+/)[0]},`,
            ``,
            `¡Listo! El contrato de ${vars.empresa_razon_social || "la empresa"} quedó firmado el ${fechaFirmaTexto}.`,
            ``,
            `Adjunto encuentras la copia del Acuerdo de Prestación de Servicios Turísticos No. ${code}, con la relación de viajeros en el Anexo No. 2 y el Informe de Firmas en la última página${anexo1}.`,
            `Huella digital del documento (SHA-256): ${docHash}`,
            `Puedes comprobar su autenticidad en: ${urlVerificacion}`,
            ``,
            `Si aún faltan pasaportes de algún viajero, envíalos a este mismo correo: los necesitamos para confirmar las reservas.`,
            ``,
            `Buen Camino,`,
            `Camino Sacro · reservas@caminosacro.com`,
          ]
        : [
            `Hola ${signerName.split(/\s+/)[0]},`,
            ``,
            `¡Listo! Tu contrato quedó firmado el ${fechaFirmaTexto}.`,
            ``,
            `Adjunto encuentras tu copia del Acuerdo de Prestación de Servicios Turísticos No. ${code}, con el Informe de Firmas en la última página${anexo1}.`,
            `Huella digital del documento (SHA-256): ${docHash}`,
            `Puedes comprobar su autenticidad en: ${urlVerificacion}`,
            ``,
            `Nuestro equipo continúa con la gestión de tus reservas y te iremos contando cada avance.`,
            ``,
            `Buen Camino,`,
            `Camino Sacro · reservas@caminosacro.com`,
          ]
      ).join("\n"),
      attachment_name: adjuntos.attachment_name,
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
        `Fecha de firma: ${fechaFirmaTexto}`,
        `Verificado por código al correo: ${correoParte}`,
        `IP: ${huella.ip ?? "—"}${geo ? ` · Ubicación aprox.: ${geo}` : ""}`,
        `Huella SHA-256: ${docHash}`,
        `Verificación: ${urlVerificacion}`,
        ``,
        `Contrato firmado y pasaporte disponibles en Seguimiento:`,
        `${baseUrlApp()}/seguimiento`,
      ].join("\n"),
    }, { supabase, quoteId: c.quote_id });
    emailEnviado = envio.ok;
    // Si la copia no salió, la firma ya está registrada y el viajero ve la pantalla de
    // éxito: el motivo queda en `email_log` (tipo `contrato`) para que se pueda reenviar
    // sabiendo qué pasó, en vez de perderse en los logs del servidor.
    if (!envio.ok) console.error("[firmar] la copia al firmante no salió:", envio.error);
  }

  // Nota: sin revalidatePath aquí — invalidaría el router del navegador del
  // peregrino y la página se recargaría, tapando la pantalla de éxito. Seguimiento es
  // dinámico y verá el contrato firmado en la próxima carga sin necesidad de revalidar.
  return { ok: true, emailEnviado, huella: huellaLegible(docHash), urlVerificacion };
}
