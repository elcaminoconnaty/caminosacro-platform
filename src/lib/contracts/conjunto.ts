import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { renderContractPdfBuffer, sha256Hex, getOrgSignature, getFirmante, contarPaginas } from "./render";
import { rotuloFirmaConjunta, type ContractVariables, type PaymentPlan } from "./template";
import type { ContractSignature } from "./contractPdf";
import type { FirmanteInforme, InformeFirmasProps } from "./informeFirmas";
import { huellaLegible } from "./firma";
import { enviarCorreoContrato } from "./email";
import { adjuntosContrato } from "./adjuntos";
import { correoContratoFirmado } from "./correos";
import { rutaContratoConjunto, sinBucket } from "@/lib/storage/paths";
import { baseUrlApp } from "@/lib/email/versionWeb";

/**
 * CONTRATO CONJUNTO (migración 0054): un solo contrato con todos los viajeros como parte,
 * obligados solidariamente por el valor total. Cada uno firma con su enlace
 * (`contract_signers`) y el documento se sella cuando firma el último.
 *
 * Lo que vive acá lo usan dos orillas: la página pública de firma (al firmar el último) y el
 * CRM (el botón de reintentar el sellado si aquello falló a mitad de camino).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type SignerRow = {
  id: string;
  contract_id: string;
  traveler_id: string;
  position: number;
  nombre: string;
  email: string | null;
  token: string | null;
  token_expires_at: string | null;
  sent_at: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
  signer_name: string | null;
  signer_document: string | null;
  signer_email: string | null;
  signer_phone: string | null;
  signature_image: string | null;
  signed_at: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  signer_geo: string | null;
  otp_id: string | null;
  passport_path: string | null;
};

export const SIGNER_COLUMNS =
  "id,contract_id,traveler_id,position,nombre,email,token,token_expires_at,sent_at,last_reminder_at,reminder_count," +
  "signer_name,signer_document,signer_email,signer_phone,signature_image,signed_at,signer_ip,signer_user_agent,signer_geo,otp_id,passport_path";

/** La firma de un firmante en la forma que dibuja el PDF, o null si todavía no firmó. */
export function firmaDe(s: SignerRow | null | undefined): ContractSignature | null {
  if (!s?.signed_at) return null;
  return {
    signer_name: s.signer_name || s.nombre,
    signer_document: s.signer_document || "",
    signature_image: s.signature_image,
    signed_at: s.signed_at,
    signer_ip: s.signer_ip,
    signer_user_agent: s.signer_user_agent,
    doc_hash: null,
  };
}

/** Las firmas en el orden de `variables.partes`, que es el orden en que salen en el documento. */
export function firmasEnOrden(v: ContractVariables, firmantes: SignerRow[]): (ContractSignature | null)[] {
  const porPosicion = new Map(firmantes.map((s) => [s.position, s]));
  return (v.partes ?? []).map((p) => firmaDe(porPosicion.get(p.position)));
}

/** Documento tal como se imprime en el contrato: sin espacios, puntos ni guiones, en mayúsculas. */
export function mismoDocumento(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (x: string | null | undefined) => (x ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  return n(a).length > 0 && n(a) === n(b);
}

const zonaBogota = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", dateStyle: "long", timeStyle: "medium",
});
const enBogota = (d: Date | string) => zonaBogota.format(typeof d === "string" ? new Date(d) : d);

const SIGNED_COPY_TTL = 60 * 60 * 24 * 30;

export type ResultadoSellado =
  | { ok: true; sellado: false; faltan: number }
  | { ok: true; sellado: true; docHash: string; correos: number }
  | { ok: false; error: string };

/**
 * Cierra el contrato conjunto si ya firmaron todos: arma el PDF con todas las firmas y el
 * Informe de Firmas, lo guarda, marca el contrato firmado y le manda la copia a cada uno.
 *
 * Si falta alguien, no hace nada (`sellado: false`). Dos firmantes que terminan al mismo
 * tiempo no pueden sellar dos veces: el primero "reserva" el contrato poniendo `signed_at`
 * con la condición de que siga vacío, y el otro se retira. Si el sellado falla después de
 * reservarlo, se libera, y desde el CRM se puede volver a intentar.
 */
export async function sellarContratoConjunto(supabase: AnyClient, contractId: string): Promise<ResultadoSellado> {
  const { data: c } = await supabase
    .from("contracts")
    .select("id,quote_id,kind,status,variables_json,payment_plan_json,org_signer,created_at,sent_at,signed_at")
    .eq("id", contractId)
    .maybeSingle();
  if (!c || c.kind !== "conjunto") return { ok: false, error: "El contrato conjunto no existe." };
  if (c.status === "firmado") return { ok: true, sellado: false, faltan: 0 };

  const { data: filas } = await supabase
    .from("contract_signers")
    .select(SIGNER_COLUMNS)
    .eq("contract_id", c.id)
    .order("position");
  const firmantes = ((filas ?? []) as unknown) as SignerRow[];
  const faltan = firmantes.filter((s) => !s.signed_at).length;
  if (firmantes.length === 0 || faltan > 0) return { ok: true, sellado: false, faltan };

  // Reserva: solo uno sella.
  const ahora = new Date();
  const { data: reservado } = await supabase
    .from("contracts")
    .update({ signed_at: ahora.toISOString() })
    .eq("id", c.id)
    .eq("status", "enviado")
    .is("signed_at", null)
    .select("id")
    .maybeSingle();
  if (!reservado) return { ok: true, sellado: false, faltan: 0 };
  const liberar = async () => {
    await supabase.from("contracts").update({ signed_at: null }).eq("id", c.id).eq("status", "enviado");
  };

  const vars = c.variables_json as ContractVariables;
  const plan = c.payment_plan_json as PaymentPlan;
  const code = vars.codigo_cotizacion || String(c.quote_id);
  const firmas = firmasEnOrden(vars, firmantes);
  const urlVerificacionBase = `${baseUrlApp()}/verificar`;

  let signedPdf: Buffer;
  let originalHash: string;
  try {
    const firmanteOrg = await getFirmante(supabase, c.org_signer as string | null);
    const orgSignature = await getOrgSignature(supabase, c.org_signer as string | null);

    // Primera pasada: el documento con sus firmas y sin informe. Su huella va en el informe.
    const original = await renderContractPdfBuffer(vars, plan, null, orgSignature, null, { numero: c.id, firmasPartes: firmas });
    originalHash = sha256Hex(original);

    const porPosicion = new Map(firmantes.map((s) => [s.position, s]));
    const informeFirmantes: FirmanteInforme[] = [
      {
        rol: "camino_sacro", rolTexto: "Camino Sacro", token: c.id,
        nombre: firmanteOrg.nombre, documento: `${firmanteOrg.documento_tipo} ${firmanteOrg.documento}`,
        email: "reservas@caminosacro.com", telefono: null,
        firmadoEn: enBogota((c.sent_at as string | null) ?? (c.created_at as string)),
        ip: null, dispositivo: null, ubicacion: null,
        metodo: "Firmado desde la plataforma al aprobar y enviar, con sesión autenticada",
        trazo: orgSignature,
      },
      ...(vars.partes ?? []).map((p, i): FirmanteInforme => {
        const s = porPosicion.get(p.position)!;
        return {
          rol: "contratante",
          rolTexto: rotuloFirmaConjunta(i),
          token: s.otp_id ?? s.id,
          nombre: s.signer_name || p.nombre,
          documento: `${p.documento_tipo || "Documento"} ${s.signer_document || p.documento}`,
          email: s.signer_email || s.email || "—",
          telefono: s.signer_phone,
          firmadoEn: enBogota(s.signed_at as string),
          ip: s.signer_ip,
          dispositivo: s.signer_user_agent,
          ubicacion: s.signer_geo,
          metodo: "Validado por código único enviado por correo electrónico",
          trazo: s.signature_image,
        };
      }),
    ];
    const informe: InformeFirmasProps = {
      numero: c.id,
      documento: `Acuerdo de Prestación de Servicios Turísticos · Contrato No. ${code} (conjunto)`,
      creadoEn: enBogota(c.created_at as string),
      actualizadoEn: enBogota(ahora),
      huellaOriginal: huellaLegible(originalHash),
      urlVerificacion: urlVerificacionBase,
      firmantes: informeFirmantes,
      paginas: contarPaginas(original) + 1,
    };

    signedPdf = await renderContractPdfBuffer(vars, plan, null, orgSignature, null, { informe, numero: c.id, firmasPartes: firmas });
    const paginasReales = contarPaginas(signedPdf);
    if (paginasReales !== informe.paginas) {
      informe.paginas = paginasReales;
      signedPdf = await renderContractPdfBuffer(vars, plan, null, orgSignature, null, { informe, numero: c.id, firmasPartes: firmas });
    }
  } catch (e) {
    console.error("[conjunto] render del PDF sellado falló:", e);
    await liberar();
    return { ok: false, error: "No se pudo generar el contrato firmado." };
  }
  const docHash = sha256Hex(signedPdf);

  const signedPdfPath = rutaContratoConjunto(code, true);
  const { error: pdfErr } = await supabase.storage
    .from("comercial-contracts")
    .upload(sinBucket(signedPdfPath), signedPdf, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (pdfErr) {
    console.error("[conjunto] subida del PDF sellado falló:", pdfErr);
    await liberar();
    return { ok: false, error: "No se pudo guardar el contrato firmado." };
  }

  const nombres = firmantes.map((s) => s.signer_name || s.nombre);
  const { data: cerrado, error: updErr } = await supabase
    .from("contracts")
    .update({
      status: "firmado",
      signed_pdf_path: signedPdfPath,
      signer_name: nombres.join(" y "),
      signer_document: firmantes.map((s) => s.signer_document || "").join(" · "),
      signer_auth_method: "otp_email",
      pdf_original_sha256: originalHash,
      doc_hash: docHash,
    })
    .eq("id", c.id)
    .eq("status", "enviado")
    .select("id")
    .maybeSingle();
  if (updErr || !cerrado) {
    console.error("[conjunto] no pude cerrar el contrato:", updErr);
    await liberar();
    return { ok: false, error: "No se pudo registrar el cierre del contrato." };
  }

  try {
    await supabase.from("contract_events").insert({
      contract_id: c.id,
      event: "pdf_sellado",
      detail: { ruta: signedPdfPath, sha256: docHash, original: originalHash, firmantes: firmantes.length },
    });
  } catch (e) {
    console.error("[conjunto] no pude anotar el sellado", e);
  }

  // ---- La copia a cada firmante, y un solo aviso a reservas@ ----
  const urlVerificacion = `${urlVerificacionBase}/${docHash}`;
  const fechaFirmaTexto = enBogota(ahora);
  const { data: signedUrl } = await supabase.storage
    .from("comercial-contracts")
    .createSignedUrl(sinBucket(signedPdfPath), SIGNED_COPY_TTL);
  const adjuntos = await adjuntosContrato(
    supabase,
    c.quote_id as string,
    { url: signedUrl?.signedUrl ?? null, name: `Contrato-${code}-firmado.pdf` },
    code,
  );

  let correos = 0;
  let avisado = false;
  for (const s of firmantes) {
    const destino = s.signer_email || s.email;
    if (!destino) continue;
    const firmante = s.signer_name || s.nombre;
    const correo = correoContratoFirmado({
      code,
      empresa: false,
      firmante,
      fechaFirma: fechaFirmaTexto,
      huella: docHash,
      urlVerificacion,
      ruta: vars.ruta_nombre || null,
      fechaInicio: vars.fecha_inicio || null,
      personas: Number(vars.num_personas) || 1,
      conCotizacion: adjuntos.conCotizacion,
      cofirmantes: nombres.filter((n) => n !== firmante),
    });
    const envio = await enviarCorreoContrato({
      code,
      nombre: firmante,
      email: destino,
      telefono: s.signer_phone,
      ruta: vars.ruta_nombre || null,
      fecha_inicio: vars.fecha_inicio || null,
      personas: Number(vars.num_personas) || 1,
      alojamiento: vars.modalidad || null,
      total_eur: null,
      pdf_url: adjuntos.pdf_url,
      attachments: adjuntos.attachments,
      subject: `${firmante} - Contrato firmado - ${code}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      body: correo.texto,
      html: correo.html,
      attachment_name: adjuntos.attachment_name,
      // Un solo aviso interno por contrato, no uno por firmante.
      aviso: !avisado,
      aviso_subject: `Firmaron todos: ${nombres.join(" y ")} - ${code}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      aviso_body: [
        `Se firmó un contrato conjunto: firmaron las ${firmantes.length} personas.`,
        ``,
        `Contrato: ${code} (conjunto, responden solidariamente por el total)`,
        ...firmantes.map(
          (f) =>
            `- ${f.signer_name || f.nombre} · ${f.signer_document || "-"} · ${f.signed_at ? enBogota(f.signed_at) : "-"} · IP ${f.signer_ip ?? "—"}`,
        ),
        `Ruta: ${vars.ruta_nombre || "-"}`,
        `Huella SHA-256: ${docHash}`,
        `Verificación: ${urlVerificacion}`,
        ``,
        `Contrato firmado y pasaportes disponibles en Seguimiento:`,
        `${baseUrlApp()}/seguimiento`,
      ].join("\n"),
    }, { supabase, quoteId: c.quote_id as string });
    if (envio.ok) {
      correos++;
      avisado = true;
    } else {
      console.error("[conjunto] la copia no salió a", destino, envio.error);
    }
  }

  return { ok: true, sellado: true, docHash, correos };
}
