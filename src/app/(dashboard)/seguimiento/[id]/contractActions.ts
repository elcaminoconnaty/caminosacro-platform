"use server";

// Acciones del contrato de servicios (card Contrato en Seguimiento).
// El flujo público de firma vive en /contrato/[token] con sus propias acciones.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import {
  buildDefaultVariables,
  renderContractPdfBuffer,
  newContractToken,
} from "@/lib/contracts/render";
import type { ContractVariables, PaymentPlan } from "@/lib/contracts/template";
import { enviarCorreoContrato } from "@/lib/contracts/email";
import { rutaContrato, sinBucket } from "@/lib/storage/paths";

const TOKEN_TTL_DAYS = 21;

export type ContractRow = {
  id: string;
  quote_id: string;
  variables_json: ContractVariables;
  payment_plan_json: PaymentPlan;
  status: "borrador" | "enviado" | "firmado" | "anulado";
  token: string | null;
  token_expires_at: string | null;
  pdf_path: string | null;
  signed_pdf_path: string | null;
  passport_path: string | null;
  signer_name: string | null;
  signer_document: string | null;
  signed_at: string | null;
  signer_ip: string | null;
  doc_hash: string | null;
};

/** Devuelve el contrato de la cotización; si no existe, lo crea como borrador
 *  con las variables precargadas desde la cotización + cliente + catálogo. */
export async function getOrCreateContract(quoteId: string): Promise<{ contract?: ContractRow; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: existing } = await supabase
    .from("contracts")
    .select("*")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (existing) return { contract: existing as ContractRow };

  const defaults = await buildDefaultVariables(supabase, quoteId);
  if (!defaults.ok) return { error: defaults.error };

  const { data: created, error } = await supabase
    .from("contracts")
    .insert({
      quote_id: quoteId,
      variables_json: defaults.variables,
      payment_plan_json: { type: "contado" },
      status: "borrador",
    })
    .select("*")
    .single();
  if (error || !created) return { error: mensajeError(error, "No se pudo crear el contrato.") };
  revalidatePath(`/seguimiento/${quoteId}`);
  return { contract: created as ContractRow };
}

/** Re-precarga las variables desde la cotización (pisa los cambios manuales). */
export async function refreshContractVariables(quoteId: string): Promise<{ variables?: ContractVariables; error?: string }> {
  const supabase = await createCommercialClient();
  const defaults = await buildDefaultVariables(supabase, quoteId);
  if (!defaults.ok) return { error: defaults.error };
  return { variables: defaults.variables };
}

/** Crea el contrato con las variables ya revisadas por el equipo (no con los
 *  valores por defecto). Se usa tras revisar el formulario precargado. */
export async function createContract(
  quoteId: string,
  variables: ContractVariables,
  plan: PaymentPlan,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: existing } = await supabase
    .from("contracts")
    .select("id")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (existing) {
    // Ya existía: no duplicar, solo guardar lo revisado.
    return saveContract(quoteId, variables, plan);
  }
  const { error } = await supabase.from("contracts").insert({
    quote_id: quoteId,
    variables_json: variables,
    payment_plan_json: plan,
    status: "borrador",
  });
  if (error) return { error: mensajeError(error, "No se pudo crear el contrato.") };

  const { data: q } = await supabase.from("quotes").select("client_id").eq("id", quoteId).maybeSingle();
  if (q?.client_id) {
    await supabase
      .from("clients")
      .update({
        document_type: variables.viajero_tipo_documento || null,
        document_number: variables.viajero_documento || null,
        address: variables.viajero_direccion || null,
      })
      .eq("id", q.client_id);
  }

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Guarda variables + plan de pago del borrador. Un contrato firmado es inmutable. */
export async function saveContract(
  quoteId: string,
  variables: ContractVariables,
  plan: PaymentPlan,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase.from("contracts").select("id,status").eq("quote_id", quoteId).maybeSingle();
  if (!c) return { error: "El contrato no existe todavía." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado y no puede modificarse." };

  const { error } = await supabase
    .from("contracts")
    .update({ variables_json: variables, payment_plan_json: plan })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };

  // Los datos de identificación del viajero se persisten también en el cliente,
  // para que la próxima cotización del mismo peregrino ya los precargue.
  const { data: q } = await supabase.from("quotes").select("client_id").eq("id", quoteId).maybeSingle();
  if (q?.client_id) {
    await supabase
      .from("clients")
      .update({
        document_type: variables.viajero_tipo_documento || null,
        document_number: variables.viajero_documento || null,
        address: variables.viajero_direccion || null,
      })
      .eq("id", q.client_id);
  }

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Genera (o regenera) el PDF sin firmar del contrato, lo deja en Storage y
 *  devuelve un enlace firmado (10 min) para abrirlo de inmediato. */
export async function generateContractPdf(
  quoteId: string,
): Promise<{ ok?: true; url?: string; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,variables_json,payment_plan_json,pdf_path")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe todavía." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado; descarga el firmado." };

  let buffer: Buffer;
  try {
    buffer = await renderContractPdfBuffer(
      c.variables_json as ContractVariables,
      c.payment_plan_json as PaymentPlan,
      null,
    );
  } catch (e) {
    console.error("[generateContractPdf] render falló:", e);
    return { error: mensajeError(e as Error, "No se pudo generar el PDF del contrato.") };
  }

  const vars = c.variables_json as ContractVariables;
  const pdfPath = rutaContrato(vars.codigo_cotizacion || quoteId);
  const filePath = sinBucket(pdfPath);
  const { error: upErr } = await supabase.storage
    .from("comercial-contracts")
    .upload(filePath, buffer, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (upErr) return { error: mensajeError(upErr) };

  const { error: dbErr } = await supabase
    .from("contracts")
    .update({ pdf_path: pdfPath })
    .eq("id", c.id);
  if (dbErr) return { error: mensajeError(dbErr) };

  const { data: signed } = await supabase.storage
    .from("comercial-contracts")
    .createSignedUrl(filePath, 60 * 10);

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, url: signed?.signedUrl };
}

function baseUrl(h: Headers): string {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/** Activa (o renueva) el link público de firma y opcionalmente lo envía por correo. */
export async function sendContractLink(
  quoteId: string,
  opts: { email: boolean },
): Promise<{ ok?: true; url?: string; emailEnviado?: boolean; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,token,variables_json,payment_plan_json,pdf_path")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe todavía. Guárdalo primero." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado." };

  // Asegura que el PDF de preview exista y refleje lo último guardado.
  const gen = await generateContractPdf(quoteId);
  if (gen.error) return { error: gen.error };

  const token = c.token || newContractToken();
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86400000).toISOString();
  const { error } = await supabase
    .from("contracts")
    .update({ token, token_expires_at: expires, status: "enviado" })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };

  const h = await headers();
  const url = `${baseUrl(h)}/contrato/${token}`;

  let emailEnviado = false;
  if (opts.email) {
    const vars = c.variables_json as ContractVariables;
    // Enlace firmado al PDF de preview para que el viajero pueda leerlo desde el correo.
    let pdfUrl: string | null = null;
    const { data: fresh } = await supabase.from("contracts").select("pdf_path").eq("id", c.id).maybeSingle();
    if (fresh?.pdf_path) {
      const { data: signed } = await supabase.storage
        .from("comercial-contracts")
        .createSignedUrl(sinBucket(String(fresh.pdf_path)), 60 * 60 * 24 * 7);
      pdfUrl = signed?.signedUrl ?? null;
    }
    emailEnviado = await enviarCorreoContrato({
      code: vars.codigo_cotizacion,
      nombre: vars.viajero_nombre,
      email: vars.viajero_email,
      telefono: vars.viajero_telefono,
      ruta: vars.ruta_nombre,
      fecha_inicio: vars.fecha_inicio,
      personas: Number(vars.num_personas) || 1,
      alojamiento: vars.modalidad,
      total_eur: null,
      pdf_url: pdfUrl,
      subject: `${vars.viajero_nombre} - Contrato para firma - ${vars.codigo_cotizacion}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      body: [
        `Hola ${vars.viajero_nombre.split(/\s+/)[0] || ""},`,
        ``,
        `¡Buenas noticias! Tu reserva del ${vars.ruta_nombre} está lista para el último paso: la firma del contrato de servicios.`,
        ``,
        `En este enlace puedes revisar el contrato, firmarlo digitalmente y subir la foto de tu pasaporte (la necesitamos para gestionar tus reservas):`,
        ``,
        url,
        ``,
        `El enlace es personal y vence en ${TOKEN_TTL_DAYS} días. Al firmar te llegará una copia del contrato a este correo.`,
        ``,
        `Si tienes cualquier duda, respóndenos por aquí.`,
        ``,
        `Buen Camino,`,
        `Camino Sacro · reservas@caminosacro.com`,
      ].join("\n"),
      attachment_name: `Contrato-${vars.codigo_cotizacion}.pdf`,
      aviso_subject: `${vars.viajero_nombre} - Contrato enviado para firma - ${vars.codigo_cotizacion}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      aviso_body: [
        `Se envió un contrato para firma.`,
        ``,
        `Contrato: ${vars.codigo_cotizacion}`,
        `Cliente: ${vars.viajero_nombre}`,
        `Ruta: ${vars.ruta_nombre || "-"}`,
        ``,
        `Cuando el cliente firme, te llegará el aviso de "Contrato firmado".`,
      ].join("\n"),
    });
  }

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, url, emailEnviado };
}

/** Anula el link de firma (invalida el token). */
export async function revokeContractLink(quoteId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase.from("contracts").select("id,status").eq("quote_id", quoteId).maybeSingle();
  if (!c) return { error: "El contrato no existe." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado." };
  const { error } = await supabase
    .from("contracts")
    .update({ token: null, token_expires_at: null, status: "borrador" })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}
