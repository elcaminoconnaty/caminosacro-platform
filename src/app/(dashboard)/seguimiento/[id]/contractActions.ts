"use server";

// Acciones del contrato de servicios (card Contrato en Seguimiento).
// El flujo público de firma vive en /contrato/[token] con sus propias acciones.
//
// Una cotización tiene N viajeros y N contratos, uno por persona. Por eso las
// acciones operan por `contractId` y no por cotización: la cotización ya no
// identifica un contrato único.

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

export type TravelerRow = {
  id: string;
  quote_id: string;
  position: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  is_holder: boolean;
};

export type ContractRow = {
  id: string;
  quote_id: string;
  traveler_id: string;
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
  sent_at: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
};

/** Entrada del editor de viajeros: lo que el equipo teclea en el CRM. */
export type TravelerInput = {
  id?: string | null;
  full_name: string;
  email: string | null;
  phone?: string | null;
  document_number?: string | null;
};

// =============================================================
// Viajeros
// =============================================================

/**
 * Reemplaza la lista de viajeros de la cotización por la recibida.
 *
 * Los que ya tienen contrato NO se borran aunque desaparezcan de la lista: eso
 * arrastraría el contrato por el `on delete cascade` y, si estaba firmado,
 * destruiría una prueba legal. En ese caso se avisa y se conservan.
 */
export async function saveTravelers(
  quoteId: string,
  filas: TravelerInput[],
): Promise<{ ok?: true; aviso?: string; error?: string }> {
  const supabase = await createCommercialClient();

  const limpias = filas
    .map((f) => ({ ...f, full_name: (f.full_name || "").trim(), email: (f.email || "").trim() || null }))
    .filter((f) => f.full_name.length > 0);
  if (limpias.length === 0) return { error: "Hace falta al menos un viajero con nombre." };

  const { data: actuales } = await supabase
    .from("quote_travelers")
    .select("id,position")
    .eq("quote_id", quoteId);
  const { data: conContrato } = await supabase
    .from("contracts")
    .select("traveler_id")
    .eq("quote_id", quoteId);
  const protegidos = new Set((conContrato || []).map((c) => c.traveler_id as string));

  const conservados = new Set(limpias.map((f) => f.id).filter(Boolean) as string[]);
  const aBorrar = (actuales || [])
    .map((t) => t.id as string)
    .filter((id) => !conservados.has(id));
  const bloqueados = aBorrar.filter((id) => protegidos.has(id));
  const borrables = aBorrar.filter((id) => !protegidos.has(id));

  if (borrables.length > 0) {
    const { error } = await supabase.from("quote_travelers").delete().in("id", borrables);
    if (error) return { error: mensajeError(error) };
  }

  // La posición se reasigna por orden de la lista para que quede densa (1..N).
  let posicion = 0;
  for (const f of limpias) {
    posicion++;
    const patch = {
      quote_id: quoteId,
      position: posicion,
      full_name: f.full_name,
      email: f.email,
      phone: f.phone ?? null,
      document_number: f.document_number?.trim() || null,
      is_holder: posicion === 1,
      updated_at: new Date().toISOString(),
    };
    if (f.id) {
      const { error } = await supabase.from("quote_travelers").update(patch).eq("id", f.id);
      if (error) return { error: mensajeError(error) };
    } else {
      const { error } = await supabase.from("quote_travelers").insert(patch);
      if (error) return { error: mensajeError(error) };
    }
  }

  revalidatePath(`/seguimiento/${quoteId}`);
  return {
    ok: true,
    aviso: bloqueados.length
      ? `${bloqueados.length} viajero(s) no se eliminaron porque ya tienen contrato. Anula su contrato primero si de verdad quieres quitarlos.`
      : undefined,
  };
}

/** Precarga tantas filas vacías como personas tenga la cotización. */
export async function seedTravelersFromQuote(quoteId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("people,client_name,client_email,client_phone")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { error: "No encontré la cotización." };

  const personas = Math.max(1, Number(quote.people) || 1);
  const { data: existentes } = await supabase
    .from("quote_travelers")
    .select("id,position")
    .eq("quote_id", quoteId)
    .order("position");

  const yaHay = existentes?.length ?? 0;
  if (yaHay >= personas) return { ok: true };

  const nuevas = [];
  for (let p = yaHay + 1; p <= personas; p++) {
    nuevas.push({
      quote_id: quoteId,
      position: p,
      // Nombre provisional: el equipo lo reemplaza. No se deja vacío porque la
      // columna es NOT NULL y así la fila se ve en la tabla para editarla.
      full_name: p === 1 ? String(quote.client_name || "Viajero 1") : `Viajero ${p}`,
      email: p === 1 ? quote.client_email : null,
      phone: p === 1 ? quote.client_phone : null,
      is_holder: p === 1,
    });
  }
  const { error } = await supabase.from("quote_travelers").insert(nuevas);
  if (error) return { error: mensajeError(error) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

// =============================================================
// Contratos
// =============================================================

/** Variables precargadas para el contrato de un viajero concreto. */
export async function refreshContractVariables(
  quoteId: string,
  travelerId?: string | null,
): Promise<{ variables?: ContractVariables; error?: string }> {
  const supabase = await createCommercialClient();
  let seed = null;
  if (travelerId) {
    const { data } = await supabase
      .from("quote_travelers")
      .select("full_name,email,phone,document_type,document_number")
      .eq("id", travelerId)
      .maybeSingle();
    seed = data;
  }
  const defaults = await buildDefaultVariables(supabase, quoteId, seed);
  if (!defaults.ok) return { error: defaults.error };
  return { variables: defaults.variables };
}

/**
 * Crea el contrato de un viajero. Las variables compartidas (el viaje, los valores,
 * los textos del anexo) llegan revisadas desde la tarjeta; las del firmante se
 * sobrescriben con las del viajero para que cada contrato salga a su nombre.
 */
export async function createContractForTraveler(
  quoteId: string,
  travelerId: string,
  shared: ContractVariables,
  plan: PaymentPlan,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();

  const { data: existing } = await supabase
    .from("contracts")
    .select("id")
    .eq("traveler_id", travelerId)
    .maybeSingle();
  if (existing) return { ok: true }; // ya lo tenía: crear en lote es idempotente

  const { data: t } = await supabase
    .from("quote_travelers")
    .select("full_name,email,phone,document_type,document_number,is_holder")
    .eq("id", travelerId)
    .maybeSingle();
  if (!t) return { error: "No encontré el viajero." };

  const variables: ContractVariables = {
    ...shared,
    viajero_nombre: t.full_name,
    viajero_email: t.email || "",
    viajero_telefono: t.phone || "",
    viajero_tipo_documento: t.document_type || "Pasaporte",
    viajero_documento: t.document_number || "",
    // La dirección del titular sí viene de la cotización; la de un acompañante no
    // se conoce hasta que firma.
    viajero_direccion: t.is_holder ? shared.viajero_direccion : "",
  };

  const { error } = await supabase.from("contracts").insert({
    quote_id: quoteId,
    traveler_id: travelerId,
    variables_json: variables,
    payment_plan_json: plan,
    status: "borrador",
  });
  if (error) return { error: mensajeError(error, "No se pudo crear el contrato.") };

  if (t.is_holder) await persistirDatosCliente(supabase, quoteId, variables);

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Crea de una vez los contratos que falten para todos los viajeros cargados. */
export async function createAllContracts(
  quoteId: string,
  shared: ContractVariables,
  plan: PaymentPlan,
): Promise<{ ok?: true; creados?: number; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: travelers } = await supabase
    .from("quote_travelers")
    .select("id")
    .eq("quote_id", quoteId)
    .order("position");
  if (!travelers?.length) return { error: "Primero carga los viajeros." };

  let creados = 0;
  for (const t of travelers) {
    const r = await createContractForTraveler(quoteId, t.id as string, shared, plan);
    if (r.error) return { error: r.error };
    creados++;
  }
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, creados };
}

/** Guarda variables + plan de pago de un contrato. Un contrato firmado es inmutable. */
export async function saveContract(
  contractId: string,
  variables: ContractVariables,
  plan: PaymentPlan,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,quote_id,traveler_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe todavía." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado y no puede modificarse." };

  const { error } = await supabase
    .from("contracts")
    .update({ variables_json: variables, payment_plan_json: plan })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };

  // El nombre/documento editados aquí también actualizan la ficha del viajero,
  // que es de donde salen los datos del correo a Pilgrim.
  await supabase
    .from("quote_travelers")
    .update({
      full_name: variables.viajero_nombre,
      email: variables.viajero_email || null,
      phone: variables.viajero_telefono || null,
      document_type: variables.viajero_tipo_documento || null,
      document_number: variables.viajero_documento || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", c.traveler_id);

  const { data: t } = await supabase
    .from("quote_travelers")
    .select("is_holder")
    .eq("id", c.traveler_id)
    .maybeSingle();
  if (t?.is_holder) await persistirDatosCliente(supabase, c.quote_id as string, variables);

  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true };
}

/** Aplica las variables compartidas a todos los borradores, respetando los datos
 *  propios de cada firmante. Útil tras cambiar fechas o valores del viaje. */
export async function applySharedToAll(
  quoteId: string,
  shared: ContractVariables,
  plan: PaymentPlan,
): Promise<{ ok?: true; actualizados?: number; omitidos?: number; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: contratos } = await supabase
    .from("contracts")
    .select("id,status,variables_json")
    .eq("quote_id", quoteId);
  if (!contratos?.length) return { ok: true, actualizados: 0, omitidos: 0 };

  let actualizados = 0;
  let omitidos = 0;
  for (const c of contratos) {
    if (c.status === "firmado") { omitidos++; continue; }
    const previas = c.variables_json as ContractVariables;
    const merged: ContractVariables = {
      ...shared,
      viajero_nombre: previas.viajero_nombre,
      viajero_email: previas.viajero_email,
      viajero_telefono: previas.viajero_telefono,
      viajero_tipo_documento: previas.viajero_tipo_documento,
      viajero_documento: previas.viajero_documento,
      viajero_direccion: previas.viajero_direccion,
    };
    const { error } = await supabase
      .from("contracts")
      .update({ variables_json: merged, payment_plan_json: plan })
      .eq("id", c.id);
    if (error) return { error: mensajeError(error) };
    actualizados++;
  }
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, actualizados, omitidos };
}

async function persistirDatosCliente(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  quoteId: string,
  variables: ContractVariables,
) {
  const { data: q } = await supabase.from("quotes").select("client_id").eq("id", quoteId).maybeSingle();
  if (!q?.client_id) return;
  await supabase
    .from("clients")
    .update({
      document_type: variables.viajero_tipo_documento || null,
      document_number: variables.viajero_documento || null,
      address: variables.viajero_direccion || null,
    })
    .eq("id", q.client_id);
}

/** Genera (o regenera) el PDF sin firmar del contrato, lo deja en Storage y
 *  devuelve un enlace firmado (10 min) para abrirlo de inmediato. */
export async function generateContractPdf(
  contractId: string,
): Promise<{ ok?: true; url?: string; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,quote_id,traveler_id,variables_json,payment_plan_json,pdf_path")
    .eq("id", contractId)
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

  // La posición del viajero entra en el nombre del archivo: si no, los contratos
  // de un mismo grupo se pisarían entre ellos en Storage.
  const { data: t } = await supabase
    .from("quote_travelers")
    .select("position")
    .eq("id", c.traveler_id)
    .maybeSingle();

  const vars = c.variables_json as ContractVariables;
  const pdfPath = rutaContrato(vars.codigo_cotizacion || String(c.quote_id), false, t?.position ?? null);
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

  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true, url: signed?.signedUrl };
}

function baseUrl(h: Headers): string {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * Activa (o renueva) el link público de firma y opcionalmente lo envía por correo.
 *
 * `pruebaEmail` desvía el correo a esa dirección sin tocar el destinatario real:
 * sirve para ensayar un envío de 20 contratos sin escribirle a nadie de verdad.
 */
export async function sendContractLink(
  contractId: string,
  opts: { email: boolean; pruebaEmail?: string | null },
): Promise<{ ok?: true; url?: string; emailEnviado?: boolean; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,token,quote_id,variables_json,payment_plan_json,pdf_path")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe todavía. Guárdalo primero." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado." };

  // Asegura que el PDF de preview exista y refleje lo último guardado.
  const gen = await generateContractPdf(contractId);
  if (gen.error) return { error: gen.error };

  const esPrueba = !!opts.pruebaEmail;
  const token = c.token || newContractToken();
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86400000).toISOString();
  const { error } = await supabase
    .from("contracts")
    .update({
      token,
      token_expires_at: expires,
      status: "enviado",
      // Reenviar a mano reinicia el ciclo de recordatorios automáticos: el siguiente
      // sale 4 días después de este envío, no del anterior. En modo prueba no se
      // toca, para no meter contratos de ensayo en el cron de recordatorios.
      ...(opts.email && !esPrueba
        ? { sent_at: new Date().toISOString(), last_reminder_at: null, reminder_count: 0 }
        : {}),
    })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };

  const h = await headers();
  const url = `${baseUrl(h)}/contrato/${token}`;

  let emailEnviado = false;
  if (opts.email) {
    const vars = c.variables_json as ContractVariables;
    const destino = opts.pruebaEmail || vars.viajero_email;
    if (!destino) {
      return { ok: true, url, emailEnviado: false, error: `${vars.viajero_nombre} no tiene correo.` };
    }
    // Enlace firmado al PDF de preview para que el viajero pueda leerlo desde el correo.
    let pdfUrl: string | null = null;
    const { data: fresh } = await supabase.from("contracts").select("pdf_path").eq("id", c.id).maybeSingle();
    if (fresh?.pdf_path) {
      const { data: signed } = await supabase.storage
        .from("comercial-contracts")
        .createSignedUrl(sinBucket(String(fresh.pdf_path)), 60 * 60 * 24 * 7);
      pdfUrl = signed?.signedUrl ?? null;
    }
    const prefijo = esPrueba ? "[PRUEBA] " : "";
    emailEnviado = await enviarCorreoContrato({
      code: vars.codigo_cotizacion,
      nombre: vars.viajero_nombre,
      email: destino,
      telefono: vars.viajero_telefono,
      ruta: vars.ruta_nombre,
      fecha_inicio: vars.fecha_inicio,
      personas: Number(vars.num_personas) || 1,
      alojamiento: vars.modalidad,
      total_eur: null,
      pdf_url: pdfUrl,
      subject: `${prefijo}${vars.viajero_nombre} - Contrato para firma - ${vars.codigo_cotizacion}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      body: [
        ...(esPrueba
          ? [`(Correo de PRUEBA. El destinatario real sería ${vars.viajero_email || "—"}.)`, ``]
          : []),
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
      aviso_subject: `${prefijo}${vars.viajero_nombre} - Contrato enviado para firma - ${vars.codigo_cotizacion}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      aviso_body: [
        esPrueba ? `PRUEBA: se envió a ${destino} en vez del viajero.` : `Se envió un contrato para firma.`,
        ``,
        `Contrato: ${vars.codigo_cotizacion}`,
        `Cliente: ${vars.viajero_nombre}`,
        `Ruta: ${vars.ruta_nombre || "-"}`,
        ``,
        `Cuando el cliente firme, te llegará el aviso de "Contrato firmado".`,
      ].join("\n"),
    });
  }

  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true, url, emailEnviado };
}

/** Envía para firma todos los contratos que aún no estén firmados. */
export async function sendAllContractLinks(
  quoteId: string,
  opts: { pruebaEmail?: string | null },
): Promise<{ ok?: true; enviados?: number; fallos?: string[]; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: contratos } = await supabase
    .from("contracts")
    .select("id,status,variables_json")
    .eq("quote_id", quoteId);
  if (!contratos?.length) return { error: "Todavía no hay contratos creados." };

  let enviados = 0;
  const fallos: string[] = [];
  for (const c of contratos) {
    if (c.status === "firmado") continue;
    const vars = c.variables_json as ContractVariables;
    const r = await sendContractLink(c.id as string, { email: true, pruebaEmail: opts.pruebaEmail });
    if (r.error || !r.emailEnviado) {
      fallos.push(`${vars.viajero_nombre}: ${r.error ?? "el servicio de correo no aceptó el envío"}`);
      continue;
    }
    enviados++;
  }
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, enviados, fallos };
}

/** Anula el link de firma (invalida el token). */
export async function revokeContractLink(contractId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,quote_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado." };
  const { error } = await supabase
    .from("contracts")
    .update({ token: null, token_expires_at: null, status: "borrador" })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true };
}
