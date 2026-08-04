"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { isQuoteStatus } from "@/lib/quoteStatus";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { rutaCotizacion, rutaHoteles, rutaRecibo, sinBucket } from "@/lib/storage/paths";
import { enviarCorreoWebhook } from "@/lib/email/webhook";
import { armarCorreoPilgrim, getPilgrimSettings } from "@/lib/quotes/pilgrimEmail";

// Borra un archivo de Storage a partir de su ruta "bucket/archivo".
async function removeStoragePath(
  supabase: Awaited<ReturnType<typeof createCommercialClient>>,
  storagePath: string | null | undefined,
) {
  if (!storagePath) return;
  const [bucket, ...rest] = storagePath.split("/");
  const filePath = rest.join("/");
  if (!bucket || !filePath) return;
  await supabase.storage.from(bucket).remove([filePath]).catch(() => {});
}

const num = (v: FormDataEntryValue | null) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const str = (v: FormDataEntryValue | null) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

export async function updateQuote(id: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const newBase = num(formData.get("total_eur"));
  const seasonKindRaw = str(formData.get("season_kind"));
  const seasonKind = (seasonKindRaw === "high_season" || seasonKindRaw === "easter") ? seasonKindRaw : "regular";
  // Precios por persona de las tarjetas del PDF (migración 0016). Campo vacío = null =
  // el PDF vuelve a sacarlos del catálogo.
  let priceBlocks: unknown = null;
  const blocksRaw = str(formData.get("price_blocks"));
  if (blocksRaw) {
    try { priceBlocks = JSON.parse(blocksRaw); } catch { priceBlocks = null; }
  }
  const patch = {
    client_name: str(formData.get("client_name")),
    client_phone: str(formData.get("client_phone")),
    client_email: str(formData.get("client_email")),
    route_name: str(formData.get("route_name")),
    start_date: str(formData.get("start_date")),
    end_date: str(formData.get("end_date")),
    people: num(formData.get("people")),
    modality: str(formData.get("modality")),
    base_eur: newBase, // base = ruta + alojamiento (sin suplemento ni opcionales)
    season_supplement_eur: num(formData.get("season_supplement_eur")) ?? 0,
    season_kind: seasonKind,
    // Lado Pilgrim, espejo del lado cliente. `cost_eur` NO se escribe: es derivado.
    cost_base_eur: num(formData.get("cost_base_eur")),
    season_supplement_cost_eur: num(formData.get("season_supplement_cost_eur")) ?? 0,
    status: str(formData.get("status")) || "enviada",
    valid_until: str(formData.get("valid_until")),
    notes: str(formData.get("notes")),
    price_blocks: priceBlocks,
  };
  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) return { error: mensajeError(error) };
  // Recalcula total_eur y cost_eur: base + suplemento + opcionales de cada lado.
  await supabase.rpc("recompute_quote_total", { p_quote_id: id });
  revalidatePath(`/seguimiento/${id}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

// Cambio rápido de estado desde el listado (sin entrar a editar).
export async function updateQuoteStatus(id: string, status: string) {
  if (!isQuoteStatus(status)) return { error: "Estado inválido" };
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/seguimiento");
  revalidatePath(`/seguimiento/${id}`);
  revalidatePath("/calendario");
  return { ok: true };
}

// Borra una cotización por completo (incluye sus PDFs en Storage).
// Las tablas hijas (quote_lines, client_payments, provider_payments, quote_hotels)
// se borran solas por ON DELETE CASCADE.
export async function deleteQuote(id: string) {
  const supabase = await createCommercialClient();
  const { data: q } = await supabase
    .from("quotes")
    .select("pdf_path, hotels_pdf_path")
    .eq("id", id)
    .maybeSingle();
  if (q) {
    await removeStoragePath(supabase, q.pdf_path);
    await removeStoragePath(supabase, q.hotels_pdf_path);
  }
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/seguimiento");
  revalidatePath("/calendario");
  return { ok: true };
}

export async function toggleQuoteOptional(quoteId: string, optionalId: string, on: boolean, peopleHint?: number | null) {
  const supabase = await createCommercialClient();
  if (on) {
    const { data: opt } = await supabase
      .from("optional_services")
      .select("name,unit,price_cs,price_pilgrim")
      .eq("id", optionalId)
      .maybeSingle();
    if (!opt) return { error: "Opcional no encontrado" };
    // Cantidad por defecto: si es por persona, usa people; si es por noche/vehículo/unidad, 1
    const isPerPerson = (opt.unit || "").toLowerCase().includes("persona");
    const qty = isPerPerson ? Math.max(1, peopleHint ?? 1) : 1;
    const description = `${opt.name} (${opt.unit})`;
    const { error } = await supabase.from("quote_lines").insert({
      quote_id: quoteId,
      type: "optional",
      description,
      quantity: qty,
      unit_price: Number(opt.price_cs) || 0,
      cost_unit: Number(opt.price_pilgrim) || 0,
      reference_id: optionalId,
    });
    if (error) return { error: mensajeError(error) };
  } else {
    const { error } = await supabase
      .from("quote_lines")
      .delete()
      .eq("quote_id", quoteId)
      .eq("reference_id", optionalId);
    if (error) return { error: mensajeError(error) };
  }
  await supabase.rpc("recompute_quote_total", { p_quote_id: quoteId });
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function updateQuoteLineQuantity(quoteId: string, lineId: string, quantity: number) {
  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("quote_lines")
    .update({ quantity: Math.max(1, quantity) })
    .eq("id", lineId)
    .eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };
  await supabase.rpc("recompute_quote_total", { p_quote_id: quoteId });
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function addClientPayment(id: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const amount = num(formData.get("amount")) ?? 0;
  const currency = (str(formData.get("currency")) || "EUR") as "EUR" | "COP" | "USD";
  const trm = num(formData.get("trm_eur_cop"));
  const amountEur = currency === "EUR" ? amount : currency === "COP" && trm ? amount / trm : null;

  const { error } = await supabase.from("client_payments").insert({
    quote_id: id,
    paid_at: str(formData.get("paid_at")) || new Date().toISOString().slice(0, 10),
    amount,
    currency,
    trm_eur_cop: trm,
    amount_eur: amountEur,
    method: str(formData.get("method")),
    account: str(formData.get("account")),
    reference: str(formData.get("reference")),
    notes: str(formData.get("notes")),
  });
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${id}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function updateClientPayment(quoteId: string, paymentId: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const amount = num(formData.get("amount")) ?? 0;
  const currency = (str(formData.get("currency")) || "EUR") as "EUR" | "COP" | "USD";
  const trm = num(formData.get("trm_eur_cop"));
  const amountEur = currency === "EUR" ? amount : currency === "COP" && trm ? amount / trm : null;

  const { error } = await supabase
    .from("client_payments")
    .update({
      paid_at: str(formData.get("paid_at")) || new Date().toISOString().slice(0, 10),
      amount,
      currency,
      trm_eur_cop: trm,
      amount_eur: amountEur,
      method: str(formData.get("method")),
      account: str(formData.get("account")),
      reference: str(formData.get("reference")),
      notes: str(formData.get("notes")),
    })
    .eq("id", paymentId)
    .eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  revalidatePath("/finanzas");
  return { ok: true };
}

export async function deleteClientPayment(quoteId: string, paymentId: string) {
  const supabase = await createCommercialClient();
  const { data: pago } = await supabase
    .from("client_payments")
    .select("receipt_path")
    .eq("id", paymentId)
    .maybeSingle();
  const { error } = await supabase.from("client_payments").delete().eq("id", paymentId);
  if (error) return { error: mensajeError(error) };
  await removeStoragePath(supabase, pago?.receipt_path);
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

// Genera (o regenera) el recibo PDF de un pago del cliente y lo deja en Storage.
export async function generateClientReceipt(quoteId: string, paymentId: string) {
  const supabase = await createCommercialClient();
  const [{ data: quote }, { data: payments }] = await Promise.all([
    supabase
      .from("quotes")
      .select("code,client_name,client_phone,client_email,route_name,start_date,end_date,people,total_eur")
      .eq("id", quoteId)
      .maybeSingle(),
    supabase
      .from("client_payments")
      .select("id,paid_at,amount,currency,trm_eur_cop,amount_eur,method,account,reference,receipt_number,receipt_path")
      .eq("quote_id", quoteId),
  ]);
  if (!quote) return { error: "Cotización no encontrada" };
  const payment = (payments || []).find((p) => p.id === paymentId);
  if (!payment) return { error: "Pago no encontrado" };

  // Número estable REC-{code}-{n}: se asigna la primera vez y no cambia aunque
  // se borren otros pagos (por eso n sale del máximo ya emitido, no del conteo).
  let receiptNumber = (payment.receipt_number as string | null) ?? null;
  if (!receiptNumber) {
    let maxN = 0;
    for (const p of payments || []) {
      const m = /-(\d+)$/.exec(p.receipt_number || "");
      if (m) maxN = Math.max(maxN, Number(m[1]));
    }
    receiptNumber = `REC-${quote.code}-${maxN + 1}`;
  }

  const cobrado = (payments || []).reduce((acc, p) => acc + (Number(p.amount_eur) || 0), 0);
  const saldo = (Number(quote.total_eur) || 0) - cobrado;

  const React = await import("react");
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ReceiptPDF } = await import("@/lib/receiptPdf");
  const { accountLabel } = await import("@/lib/accounts");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(ReceiptPDF as any, {
    quote: {
      code: quote.code,
      client_name: quote.client_name,
      client_phone: quote.client_phone,
      client_email: quote.client_email,
      route_name: quote.route_name,
      start_date: quote.start_date,
      end_date: quote.end_date,
      people: quote.people,
      total_eur: Number(quote.total_eur) || 0,
    },
    payment: {
      receipt_number: receiptNumber,
      paid_at: payment.paid_at,
      amount: Number(payment.amount) || 0,
      currency: payment.currency || "EUR",
      trm_eur_cop: payment.trm_eur_cop != null ? Number(payment.trm_eur_cop) : null,
      amount_eur: payment.amount_eur != null ? Number(payment.amount_eur) : null,
      method: payment.method,
      account_label: payment.account ? accountLabel(payment.account) : null,
      reference: payment.reference,
    },
    cobradoEur: cobrado,
    saldoEur: saldo,
  });

  let buffer: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(element as any);
  } catch (e) {
    console.error("[generateClientReceipt] render falló:", e);
    return { error: mensajeError(e as Error, "No se pudo generar el recibo.") };
  }

  const pdfPath = rutaRecibo(receiptNumber, quote.code, quote.client_name, quote.route_name);

  if (payment.receipt_path && payment.receipt_path !== pdfPath) {
    await removeStoragePath(supabase, payment.receipt_path);
  }

  const { error: upErr } = await supabase.storage
    .from("comercial-receipts")
    .upload(sinBucket(pdfPath), buffer, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (upErr) return { error: mensajeError(upErr) };

  const { error: dbErr } = await supabase
    .from("client_payments")
    .update({ receipt_path: pdfPath, receipt_number: receiptNumber })
    .eq("id", paymentId);
  if (dbErr) return { error: mensajeError(dbErr) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

export async function addProviderPayment(id: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("provider_payments").insert({
    quote_id: id,
    paid_at: str(formData.get("paid_at")) || new Date().toISOString().slice(0, 10),
    amount_eur: num(formData.get("amount_eur")) ?? 0,
    invoice_number: str(formData.get("invoice_number")),
    account: str(formData.get("account")),
    notes: str(formData.get("notes")),
  });
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${id}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function updateProviderPayment(quoteId: string, paymentId: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("provider_payments")
    .update({
      paid_at: str(formData.get("paid_at")) || new Date().toISOString().slice(0, 10),
      amount_eur: num(formData.get("amount_eur")) ?? 0,
      invoice_number: str(formData.get("invoice_number")),
      account: str(formData.get("account")),
      notes: str(formData.get("notes")),
    })
    .eq("id", paymentId)
    .eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  revalidatePath("/finanzas");
  return { ok: true };
}

export async function deleteProviderPayment(quoteId: string, paymentId: string) {
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("provider_payments").delete().eq("id", paymentId);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function getQuotePdfUrl(quoteId: string) {
  const supabase = await createCommercialClient();
  const { data: q } = await supabase.from("quotes").select("pdf_path").eq("id", quoteId).maybeSingle();
  if (!q?.pdf_path) return { url: null };
  const [bucket, ...rest] = q.pdf_path.split("/");
  const filePath = rest.join("/");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60 * 10);
  if (error) return { error: mensajeError(error) };
  return { url: data.signedUrl };
}

export async function getSignedUrl(storagePath: string) {
  if (!storagePath) return { url: null };
  const supabase = await createCommercialClient();
  const [bucket, ...rest] = storagePath.split("/");
  const filePath = rest.join("/");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60 * 10);
  if (error) return { error: mensajeError(error) };
  return { url: data.signedUrl };
}

export async function generateQuotePdf(quoteId: string) {
  const supabase = await createCommercialClient();
  const result = await renderAndStoreQuotePdf(supabase, quoteId);
  if (result.ok) revalidatePath(`/seguimiento/${quoteId}`);
  return result;
}

// TTL del enlace del PDF que viaja al correo: Brevo lo descarga al enviar, pero
// se firma a 7 días (igual que el contrato) por si hay reintentos o demoras.
const EMAIL_PDF_TTL = 60 * 60 * 24 * 7;

/**
 * Envía la cotización al cliente desde reservas@caminosacro.com con el PDF
 * adjunto, por el webhook n8n → Brevo. El asunto y el cuerpo son los que el
 * equipo ve (y pudo editar) en la tarjeta de correo del CRM.
 *
 * El destinatario SIEMPRE sale de `client_email` en la base: lo que llega del
 * navegador es solo el texto del mensaje.
 */
export async function enviarCorreoCotizacion(
  quoteId: string,
  mensaje: { subject: string; body: string },
): Promise<{ ok?: true; email?: string; error?: string }> {
  const subject = mensaje.subject.trim();
  const body = mensaje.body.trim();
  if (!subject) return { error: "El asunto no puede estar vacío." };
  if (!body) return { error: "El cuerpo del correo no puede estar vacío." };

  const supabase = await createCommercialClient();
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id,code,client_name,client_email,client_phone,route_name,start_date,people,modality,total_eur,pdf_path")
    .eq("id", quoteId)
    .maybeSingle();
  if (qErr) return { error: mensajeError(qErr) };
  if (!quote) return { error: "No encontré la cotización." };

  const email = String(quote.client_email || "").trim();
  if (!email) return { error: "La cotización no tiene correo del cliente. Agrégalo y vuelve a intentar." };

  // Sin PDF no hay adjunto: lo generamos antes de enviar.
  let pdfPath = quote.pdf_path as string | null;
  if (!pdfPath) {
    const gen = await renderAndStoreQuotePdf(supabase, quoteId);
    if (gen.error) return { error: `No se pudo generar el PDF: ${gen.error}` };
    const { data: fresh } = await supabase.from("quotes").select("pdf_path").eq("id", quoteId).maybeSingle();
    pdfPath = (fresh?.pdf_path as string | null) ?? null;
  }
  if (!pdfPath) return { error: "La cotización no tiene PDF y no se pudo generar." };

  const [bucket, ...rest] = pdfPath.split("/");
  const { data: signed, error: urlErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(rest.join("/"), EMAIL_PDF_TTL);
  if (urlErr || !signed?.signedUrl) {
    return { error: `No se pudo preparar el PDF adjunto: ${mensajeError(urlErr)}` };
  }

  const nombre = String(quote.client_name || "").trim();
  const envio = await enviarCorreoWebhook({
    code: quote.code,
    nombre,
    email,
    telefono: quote.client_phone ?? null,
    ruta: quote.route_name ?? null,
    fecha_inicio: quote.start_date ?? null,
    personas: Number(quote.people) || 1,
    alojamiento: quote.modality ?? null,
    total_eur: quote.total_eur != null ? Number(quote.total_eur) : null,
    pdf_url: signed.signedUrl,
    subject,
    body,
    attachment_name: `Cotizacion-${quote.code}.pdf`,
    // Sin aviso interno: lo mandó alguien del equipo desde el CRM, así que ya lo
    // sabe y el aviso solo duplicaba el correo en reservas@. El asunto/cuerpo se
    // dejan puestos porque, si algún día se vuelve a encender, el aviso por
    // defecto del workflow ("Nuevo lead del cotizador web") aquí sería falso.
    aviso: false,
    aviso_subject: `${nombre || "Cliente"} - Cotización enviada - ${quote.code}${quote.route_name ? ` - ${quote.route_name}` : ""}`,
    aviso_body: [
      `Se envió una cotización al cliente desde el CRM.`,
      ``,
      `Cotización: ${quote.code}`,
      `Cliente: ${nombre || "-"}`,
      `Correo: ${email}`,
      `WhatsApp: ${quote.client_phone || "-"}`,
      ``,
      `Ruta: ${quote.route_name || "-"}`,
      `Salida: ${quote.start_date || "-"}`,
      `Personas: ${quote.people ?? "-"}`,
      `Alojamiento: ${quote.modality || "-"}`,
      `Total: ${quote.total_eur != null ? `${quote.total_eur} EUR` : "-"}`,
      ``,
      `Respondiendo a este mensaje le escribes directo al cliente.`,
    ].join("\n"),
  });
  if (!envio.ok) return { error: envio.error ?? "No se pudo enviar el correo." };

  await supabase.from("quotes").update({ email_sent_at: new Date().toISOString() }).eq("id", quoteId);
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, email };
}

// ---------------- CORREO A PILGRIM ----------------

/**
 * Le envía a Pilgrim el detalle de la reserva a sus precios, con los pasaportes de
 * los viajeros adjuntos, y le pide el link de pago.
 *
 * `pruebaEmail` desvía el correo a esa dirección: sirve para ensayar el envío (con 1,
 * 2, 3 o 20 viajeros) sin escribirle a Pilgrim. En prueba NO se marca
 * `pilgrim_email_sent_at`, así se puede repetir sin ensuciar el expediente.
 */
export async function enviarCorreoPilgrim(
  quoteId: string,
  mensaje: { subject: string; body: string; pruebaEmail?: string | null },
): Promise<{ ok?: true; email?: string; adjuntos?: number; error?: string }> {
  const subject = mensaje.subject.trim();
  const body = mensaje.body.trim();
  if (!subject) return { error: "El asunto no puede estar vacío." };
  if (!body) return { error: "El cuerpo del correo no puede estar vacío." };

  const supabase = await createCommercialClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("id,code,client_name,client_phone,route_name,start_date,people,modality,cost_eur")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { error: "No encontré la cotización." };

  const esPrueba = !!mensaje.pruebaEmail?.trim();
  const ajustes = await getPilgrimSettings(supabase);
  const destino = (mensaje.pruebaEmail?.trim() || ajustes.email).trim();
  if (!destino) {
    return { error: "Falta el correo de Pilgrim. Configúralo en Configuración → Proveedor Pilgrim." };
  }

  // Los adjuntos se recalculan en el servidor: el cuerpo es editable, la lista de
  // pasaportes no debe serlo.
  const armado = await armarCorreoPilgrim(supabase, quoteId);
  if (!armado.ok) return { error: armado.error };

  const attachments: { url: string; name: string }[] = [];
  for (const a of armado.correo.adjuntos) {
    const [bucket, ...rest] = a.path.split("/");
    const { data: signed } = await supabase.storage
      .from(bucket)
      .createSignedUrl(rest.join("/"), EMAIL_PDF_TTL);
    if (signed?.signedUrl) attachments.push({ url: signed.signedUrl, name: a.nombre });
  }

  const prefijo = esPrueba ? "[PRUEBA] " : "";
  const envio = await enviarCorreoWebhook({
    code: quote.code,
    nombre: ajustes.contacto || ajustes.nombre || "Pilgrim",
    email: destino,
    telefono: null,
    ruta: quote.route_name ?? null,
    fecha_inicio: quote.start_date ?? null,
    personas: Number(quote.people) || 1,
    alojamiento: quote.modality ?? null,
    total_eur: quote.cost_eur != null ? Number(quote.cost_eur) : null,
    // Compatibilidad: mientras el workflow no lea `attachments`, al menos va el
    // primer pasaporte por la vía de siempre.
    pdf_url: attachments[0]?.url ?? null,
    attachment_name: attachments[0]?.name,
    attachments,
    subject: `${prefijo}${subject}`,
    body: esPrueba
      ? `(Correo de PRUEBA. El destinatario real sería ${ajustes.email || "—"}.)\n\n${body}`
      : body,
    // Sin aviso interno: lo dispara alguien del equipo desde el CRM.
    aviso: false,
    aviso_subject: `${prefijo}Reserva enviada a Pilgrim - ${quote.code}${quote.route_name ? ` - ${quote.route_name}` : ""}`,
    aviso_body: [
      esPrueba ? `PRUEBA: se envió a ${destino} en vez de a Pilgrim.` : `Se le envió la reserva a Pilgrim pidiendo el link de pago.`,
      ``,
      `Cotización: ${quote.code}`,
      `Cliente: ${quote.client_name || "-"}`,
      `Ruta: ${quote.route_name || "-"}`,
      `Salida: ${quote.start_date || "-"}`,
      `Personas: ${quote.people ?? "-"}`,
      ``,
      `Total a pagarle a Pilgrim: ${quote.cost_eur != null ? `${quote.cost_eur} EUR` : "-"}`,
      `Pasaportes adjuntos: ${attachments.length}`,
      ...(armado.correo.pendientes.length
        ? [`Sin pasaporte todavía: ${armado.correo.pendientes.join(", ")}`]
        : []),
    ].join("\n"),
  });
  if (!envio.ok) return { error: envio.error ?? "No se pudo enviar el correo." };

  if (!esPrueba) {
    await supabase.from("quotes").update({ pilgrim_email_sent_at: new Date().toISOString() }).eq("id", quoteId);
    revalidatePath(`/seguimiento/${quoteId}`);
  }
  return { ok: true, email: destino, adjuntos: attachments.length };
}

// ---------------- LISTADO DE HOTELES ----------------

export type HotelInput = {
  night_date: string | null;
  city: string | null;
  hotel_name: string | null;
  address: string | null;
  contact: string | null;
  notes: string | null;
};

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Reemplaza por completo el listado de hoteles de una cotización.
export async function saveQuoteHotels(quoteId: string, rows: HotelInput[]) {
  const supabase = await createCommercialClient();
  const { error: delErr } = await supabase.from("quote_hotels").delete().eq("quote_id", quoteId);
  if (delErr) return { error: mensajeError(delErr) };
  const clean = rows.filter((r) => r.city || r.hotel_name || r.address || r.contact || r.notes || r.night_date);
  if (clean.length > 0) {
    const payload = clean.map((r, i) => ({
      quote_id: quoteId,
      position: i,
      night_date: r.night_date || null,
      city: r.city || null,
      hotel_name: r.hotel_name || null,
      address: r.address || null,
      contact: r.contact || null,
      notes: r.notes || null,
    }));
    const { error: insErr } = await supabase.from("quote_hotels").insert(payload);
    if (insErr) return { error: mensajeError(insErr) };
  }
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

// Sugiere filas a partir del itinerario de la ruta (no guarda; el usuario las edita y guarda).
export async function prefillHotelsFromItinerary(quoteId: string): Promise<{ rows?: HotelInput[]; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("route_name,start_date")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote?.route_name) return { error: "La cotización no tiene ruta asignada." };

  const { data: r } = await supabase.from("routes").select("id").eq("name", quote.route_name).maybeSingle();
  if (!r) return { error: "No se encontró la ruta en el catálogo." };

  const { data: st } = await supabase
    .from("route_stages")
    .select("day,to_place,accommodation")
    .eq("route_id", r.id)
    .order("day");

  const stages = (st || []) as Array<{ day: number; to_place: string | null; accommodation: string | null }>;
  // Una noche por cada etapa con alojamiento (excluye "Fin de servicios").
  const nights = stages.filter((s) => s.accommodation);
  const rows: HotelInput[] = nights.map((s, i) => ({
    night_date: quote.start_date ? addDays(quote.start_date, i) : null,
    city: s.accommodation,
    hotel_name: null,
    address: null,
    contact: null,
    notes: null,
  }));
  return { rows };
}

export async function generateHotelsPdf(quoteId: string) {
  const supabase = await createCommercialClient();
  const [{ data: quote }, { data: hotelsRaw }] = await Promise.all([
    supabase
      .from("quotes")
      .select("code,client_name,route_name,start_date,end_date,people,status,hotels_pdf_path")
      .eq("id", quoteId)
      .maybeSingle(),
    supabase
      .from("quote_hotels")
      .select("night_date,city,hotel_name,address,contact,notes,position")
      .eq("quote_id", quoteId)
      .order("position"),
  ]);
  if (!quote) return { error: "Cotización no encontrada" };

  const hotels = ((hotelsRaw || []) as Array<HotelInput & { position: number }>).map((h) => ({
    night_date: h.night_date,
    city: h.city,
    hotel_name: h.hotel_name,
    address: h.address,
    contact: h.contact,
    notes: h.notes,
  }));

  const React = await import("react");
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { HotelsPDF } = await import("@/lib/hotelsPdf");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(HotelsPDF as any, {
    quote: {
      code: quote.code,
      client_name: quote.client_name,
      route_name: quote.route_name,
      start_date: quote.start_date,
      end_date: quote.end_date,
      people: quote.people,
    },
    hotels,
  });

  let buffer: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(element as any);
  } catch (e) {
    console.error("[generateHotelsPdf] render falló:", e);
    return { error: mensajeError(e as Error, "No se pudo generar el PDF de hoteles.") };
  }

  const pdfPath = rutaHoteles(quote.code, quote.client_name, quote.route_name);

  if (quote.hotels_pdf_path && quote.hotels_pdf_path !== pdfPath) {
    await removeStoragePath(supabase, quote.hotels_pdf_path);
  }

  const { error: upErr } = await supabase.storage
    .from("comercial-hotels")
    .upload(sinBucket(pdfPath), buffer, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (upErr) return { error: mensajeError(upErr) };

  const { error: dbErr } = await supabase.from("quotes").update({ hotels_pdf_path: pdfPath }).eq("id", quoteId);
  if (dbErr) return { error: mensajeError(dbErr) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

export async function uploadQuotePdf(quoteId: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Sin archivo" };
  if (file.type !== "application/pdf") return { error: "Solo PDFs" };
  if (file.size > 20 * 1024 * 1024) return { error: "PDF demasiado grande (>20MB)" };

  const { data: q } = await supabase
    .from("quotes")
    .select("code, client_name, route_name, pdf_path")
    .eq("id", quoteId)
    .maybeSingle();
  if (!q) return { error: "Cotización no encontrada" };

  const pdfPath = rutaCotizacion(q.code, q.client_name, q.route_name);

  if (q.pdf_path && q.pdf_path !== pdfPath) {
    await removeStoragePath(supabase, q.pdf_path);
  }

  const buffer = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage
    .from("comercial-quotes")
    .upload(sinBucket(pdfPath), buffer, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (upErr) return { error: mensajeError(upErr) };

  const { error: dbErr } = await supabase.from("quotes").update({ pdf_path: pdfPath }).eq("id", quoteId);
  if (dbErr) return { error: mensajeError(dbErr) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}
