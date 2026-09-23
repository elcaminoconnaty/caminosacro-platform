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
import { correoContratoFirmado } from "@/lib/contracts/correos";
import type { FirmanteInforme, InformeFirmasProps } from "@/lib/contracts/informeFirmas";
import { baseUrlApp } from "@/lib/email/versionWeb";
import { cifrasConjunto } from "@/lib/contracts/cifrasConjunto";
import { mismoDocumento, sellarContratoConjunto, firmasEnOrden, SIGNER_COLUMNS, type SignerRow } from "@/lib/contracts/conjunto";

export type ResultadoFirma =
  | { ok: true; emailEnviado: boolean; huella: string; urlVerificacion: string }
  // Contrato conjunto: esta firma quedó, pero faltan otras. No es "contrato firmado".
  | { ok: true; parcial: true; faltan: string[] }
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
async function anotar(
  supabase: Admin,
  contractId: string,
  event: string,
  huella?: Huella,
  detail?: unknown,
  signerId?: string | null,
) {
  try {
    await supabase.from("contract_events").insert({
      contract_id: contractId,
      // Solo si hay firmante: los contratos de siempre no tocan la columna de la 0054.
      ...(signerId ? { signer_id: signerId } : {}),
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

const COLUMNAS_CONTRATO =
  "id,quote_id,traveler_id,company_id,status,token_expires_at,variables_json,payment_plan_json,kind,travelers_json,org_signer,created_at,sent_at";

/** El contrato que hay detrás de un token, si está habilitado para firmar. */
async function contratoFirmable(supabase: Admin, token: string) {
  const { data: directo } = await supabase
    .from("contracts")
    .select(COLUMNAS_CONTRATO)
    .eq("token", token)
    .maybeSingle();
  let c = directo;
  // Contrato conjunto: el token es de un firmante (migración 0054).
  let firmante: SignerRow | null = null;
  if (!c) {
    const { data: s } = await supabase.from("contract_signers").select(SIGNER_COLUMNS).eq("token", token).maybeSingle();
    if (s) {
      firmante = (s as unknown) as SignerRow;
      ({ data: c } = await supabase.from("contracts").select(COLUMNAS_CONTRATO).eq("id", firmante.contract_id).maybeSingle());
      if (c && firmante.signed_at) return { error: "Tu firma ya quedó registrada. Falta que firmen los demás." };
      if (c && firmante.token_expires_at && new Date(firmante.token_expires_at).getTime() < Date.now()) {
        return { error: "Venció el plazo para firmar este contrato. Escríbenos a reservas@caminosacro.com." };
      }
    }
  }
  if (!c) return { error: "Este enlace de firma no existe o fue anulado." };
  if (c.status === "firmado") return { error: "Este contrato ya fue firmado." };
  if (c.status !== "enviado") return { error: "Este contrato no está habilitado para firma." };
  if (c.token_expires_at && new Date(c.token_expires_at).getTime() < Date.now()) {
    return { error: "El enlace venció. Escríbenos a reservas@caminosacro.com y te enviamos uno nuevo." };
  }
  return { c, firmante, error: null };
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
  const f = r.firmante;
  // En el conjunto el código va al correo de ESTE firmante, no al de la primera parte.
  const { email, nombre } = f ? { email: f.email || "", nombre: f.nombre } : destinatarioContrato(vars);
  if (!email) {
    return { ok: false, error: "Este contrato no tiene un correo de notificaciones. Escríbenos a reservas@caminosacro.com." };
  }

  // Freno por contrato (o por firmante), en la base: sobrevive a un reinicio del servidor.
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const consultaOtps = supabase
    .from("contract_otps")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", c.id)
    .gte("created_at", haceUnaHora);
  const { count } = f ? await consultaOtps.eq("signer_id", f.id) : await consultaOtps;
  if ((count ?? 0) >= OTP_MAX_POR_HORA) {
    return { ok: false, error: "Pediste muchos códigos en la última hora. Espera un rato y vuelve a intentarlo." };
  }

  const codigo = nuevoCodigo();
  const { error: errOtp } = await supabase.from("contract_otps").insert({
    contract_id: c.id,
    ...(f ? { signer_id: f.id } : {}),
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
      telefono: f ? f.signer_phone : (esEmpresa(vars) ? vars.empresa_telefono : vars.viajero_telefono) || null,
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

  await anotar(supabase, c.id, envio.ok ? "otp_enviado" : "otp_fallido", huella, envio.ok ? { correo: email } : { error: envio.error }, f?.id);
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
  if (r.firmante) return firmarParteConjunta(supabase, c, r.firmante, formData, huella);

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
    // Texto y HTML del mismo correo, escritos una sola vez en `@/lib/contracts/correos`.
    const correo = correoContratoFirmado({
      code,
      empresa,
      firmante: signerName,
      razonSocial: vars.empresa_razon_social,
      fechaFirma: fechaFirmaTexto,
      huella: docHash,
      urlVerificacion,
      ruta: vars.ruta_nombre || null,
      fechaInicio: vars.fecha_inicio || null,
      personas: Number(vars.num_personas) || 1,
      conCotizacion: adjuntos.conCotizacion,
    });
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
      body: correo.texto,
      html: correo.html,
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

// ---------------------------------------------------------------------------
// Contrato conjunto: la firma de UNA de las partes (migración 0054)
// ---------------------------------------------------------------------------

type ContratoFirmable = NonNullable<Awaited<ReturnType<typeof contratoFirmable>>["c"]>;

/**
 * Registra la firma de un viajero del contrato conjunto. El documento no se sella acá: se
 * sella cuando firma el último (`sellarContratoConjunto`), y hasta entonces a nadie se le
 * dice "contrato firmado".
 *
 * Diferencias con la firma de un contrato por viajero, todas a propósito:
 *  - el número de pasaporte que escribe tiene que COINCIDIR con el del contrato: el texto
 *    ya lo firmaron otros con ese número y no puede cambiar entre una firma y la siguiente;
 *  - acepta la solidaridad en su propia casilla, que queda en el consentimiento archivado;
 *  - el pasaporte es opcional si ya lo teníamos.
 */
async function firmarParteConjunta(
  supabase: Admin,
  c: ContratoFirmable,
  f: SignerRow,
  formData: FormData,
  huella: Huella,
): Promise<ResultadoFirma> {
  const signerName = String(formData.get("signer_name") || "").trim();
  const signerDocument = String(formData.get("signer_document") || "").trim();
  const signature = String(formData.get("signature") || "");
  const codigo = String(formData.get("codigo") || "").replace(/\D/g, "");
  const geoCrudo = String(formData.get("geo") || "");
  const passport = formData.get("passport") as File | null;

  const vars = c.variables_json as ContractVariables;
  const plan = c.payment_plan_json as PaymentPlan;
  const parte = (vars.partes ?? []).find((p) => p.position === f.position);
  if (!parte) return { ok: false, error: "No encontramos tus datos en este contrato. Escríbenos a reservas@caminosacro.com." };

  if (!formData.get("accept")) return { ok: false, error: "Debes aceptar la declaración para firmar." };
  if (!formData.get("accept_solidaridad")) {
    return { ok: false, error: "Debes aceptar que respondes por el valor total del plan para firmar." };
  }
  if (signerName.length < 5) return { ok: false, error: "Escribe tu nombre completo." };
  if (!mismoDocumento(signerDocument, parte.documento)) {
    const cola = parte.documento.replace(/[^0-9a-z]/gi, "").slice(-4);
    return {
      ok: false,
      error:
        `El número que escribiste no coincide con el pasaporte que aparece en el contrato (termina en ${cola}). ` +
        `Revísalo; si el del contrato está mal, escríbenos a reservas@caminosacro.com y lo corregimos antes de que firmes.`,
    };
  }
  const trazo = trazoValido(signature);
  if (!trazo.ok) return { ok: false, error: trazo.error };
  if (codigo.length !== 6) return { ok: false, error: "Escribe el código de seis dígitos que te llegó al correo." };
  const geo = ubicacionPlausible(geoCrudo) ? geoCrudo : null;

  const { data: viajero } = await supabase
    .from("quote_travelers")
    .select("passport_path")
    .eq("id", f.traveler_id)
    .maybeSingle();
  const tienePasaporte = !!viajero?.passport_path;
  const conArchivo = !!passport && passport.size > 0;
  let ext = "";
  if (!conArchivo && !tienePasaporte) return { ok: false, error: "Falta la foto de tu pasaporte." };
  if (conArchivo) {
    ext = PASSPORT_TYPES[passport!.type];
    if (!ext) return { ok: false, error: "El pasaporte debe ser una imagen (JPG, PNG, WebP) o un PDF." };
    if (passport!.size > PASSPORT_MAX_BYTES) return { ok: false, error: "El archivo del pasaporte supera 12 MB." };
  }

  // ---- El código, que es de esta persona ----
  const { data: otp } = await supabase
    .from("contract_otps")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("contract_id", c.id)
    .eq("signer_id", f.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!otp) return { ok: false, error: "Primero pide el código a tu correo." };
  if (new Date(otp.expires_at) < new Date()) return { ok: false, error: "El código venció. Pide uno nuevo." };
  if (otp.attempts >= OTP_MAX_INTENTOS) return { ok: false, error: "Demasiados intentos con ese código. Pide uno nuevo." };
  if (!mismoHash(hashCodigo(codigo, c.id), otp.code_hash)) {
    await supabase.from("contract_otps").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
    await anotar(supabase, c.id, "otp_fallido", huella, { intento: otp.attempts + 1 }, f.id);
    const quedan = OTP_MAX_INTENTOS - otp.attempts - 1;
    return {
      ok: false,
      error: quedan > 0 ? `El código no coincide. Te quedan ${quedan} intentos.` : "Se acabaron los intentos. Pide un código nuevo.",
    };
  }
  await supabase.from("contract_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
  await anotar(supabase, c.id, "otp_validado", huella, undefined, f.id);

  const code = vars.codigo_cotizacion || c.quote_id;
  const signedAt = new Date().toISOString();

  // ---- El documento tal como se le presentó: con las firmas que ya había ----
  let presentado: string | null = null;
  try {
    const { data: otros } = await supabase.from("contract_signers").select(SIGNER_COLUMNS).eq("contract_id", c.id);
    const orgSignature = await getOrgSignature(supabase, c.org_signer as string | null);
    const pdf = await renderContractPdfBuffer(vars, plan, null, orgSignature, null, {
      numero: c.id,
      firmasPartes: firmasEnOrden(vars, ((otros ?? []) as unknown) as SignerRow[]),
    });
    presentado = sha256Hex(pdf);
  } catch (e) {
    // La huella del documento final es la que vale; esta es evidencia adicional.
    console.error("[firma conjunta] no pude calcular la huella del documento presentado:", e);
  }

  // ---- Pasaporte (si lo subió) ----
  let passportPath: string | null = null;
  if (conArchivo) {
    passportPath = rutaPasaporte(code, ext);
    const { error: passErr } = await supabase.storage
      .from("comercial-passports")
      .upload(sinBucket(passportPath), Buffer.from(await passport!.arrayBuffer()), {
        contentType: passport!.type, upsert: true, cacheControl: "no-cache",
      });
    if (passErr) {
      console.error("[firma conjunta] subida de pasaporte falló:", passErr);
      return { ok: false, error: "No pudimos guardar el pasaporte. Inténtalo de nuevo." };
    }
  }

  // Palabra por palabra lo que vio en la página (misma función, mismos datos).
  const cifras = cifrasConjunto(vars, parte.nombre);
  const consentimiento = textoConsentimiento({
    empresa: false,
    financiado: false,
    conjunto: { total: cifras.total, cuota: cifras.cuota, otros: cifras.otros },
  });

  // ---- Su firma (condicionada a que no haya firmado ya) ----
  const { data: registrada, error: updErr } = await supabase
    .from("contract_signers")
    .update({
      signer_name: signerName,
      signer_document: signerDocument,
      signer_email: f.email,
      signer_phone: parte.telefono || null,
      signature_image: signature,
      signed_at: signedAt,
      signer_ip: huella.ip ?? "desconocida",
      signer_user_agent: huella.userAgent,
      signer_geo: geo,
      signer_auth_method: "otp_email",
      consent_text: consentimiento,
      otp_id: otp.id,
      passport_path: passportPath,
      pdf_presentado_sha256: presentado,
    })
    .eq("id", f.id)
    .is("signed_at", null)
    .select("id")
    .maybeSingle();
  if (updErr || !registrada) {
    console.error("[firma conjunta] no pude registrar la firma:", updErr);
    if (passportPath) await supabase.storage.from("comercial-passports").remove([sinBucket(passportPath)]).catch(() => {});
    return { ok: false, error: "No pudimos registrar la firma. Inténtalo de nuevo." };
  }
  await anotar(supabase, c.id, "firmado", huella, { presentado, geo, parcial: true }, f.id);

  // El pasaporte nuevo pasa a la ficha del viajero, de donde lo toma el correo a Pilgrim.
  if (passportPath) {
    const { error: viajeroErr } = await supabase
      .from("quote_travelers")
      .update({ passport_path: passportPath, updated_at: signedAt })
      .eq("id", f.traveler_id);
    if (viajeroErr) console.error("[firma conjunta] no se pudo actualizar el viajero:", viajeroErr);
  }

  // ---- ¿Era la última? Entonces se sella y les llega la copia a todos ----
  const sello = await sellarContratoConjunto(supabase, c.id);
  if (sello.ok && sello.sellado) {
    return {
      ok: true,
      emailEnviado: sello.correos > 0,
      huella: huellaLegible(sello.docHash),
      urlVerificacion: `${baseUrlApp()}/verificar/${sello.docHash}`,
    };
  }
  if (!sello.ok) console.error("[firma conjunta] el sellado falló; se reintenta desde el CRM:", sello.error);

  const { data: pendientes } = await supabase
    .from("contract_signers")
    .select("nombre,signed_at")
    .eq("contract_id", c.id)
    .order("position");
  const faltan = (pendientes ?? []).filter((p) => !p.signed_at).map((p) => String(p.nombre));
  // Si ya no falta nadie pero el sellado falló, no se le dice que falta alguien: la firma de
  // todos está y el equipo cierra el documento desde el CRM.
  return faltan.length > 0
    ? { ok: true, parcial: true, faltan }
    : { ok: true, parcial: true, faltan: ["cerrar el documento (lo hacemos nosotros)"] };
}
