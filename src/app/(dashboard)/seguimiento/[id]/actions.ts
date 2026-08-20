"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { isQuoteStatus } from "@/lib/quoteStatus";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { rutaCotizacion, rutaHoteles, rutaRecibo, sinBucket } from "@/lib/storage/paths";
import { alternarOpcional } from "@/lib/quotes/optionals";
import { enviarCorreoCliente } from "@/lib/quotes/clientEmail";
import { enviarCorreoAPilgrim } from "@/lib/quotes/sendPilgrimEmail";

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
  const r = await alternarOpcional(supabase, quoteId, optionalId, on, peopleHint);
  if (r.error) return { error: r.error };
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
  const supabase = await createCommercialClient();
  const r = await enviarCorreoCliente(supabase, quoteId, mensaje);
  if (r.ok) revalidatePath(`/seguimiento/${quoteId}`);
  return r;
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
  const supabase = await createCommercialClient();
  const r = await enviarCorreoAPilgrim(supabase, quoteId, mensaje);
  // En prueba no se marca el expediente, así que tampoco hay nada que revalidar.
  if (r.ok && !mensaje.pruebaEmail?.trim()) revalidatePath(`/seguimiento/${quoteId}`);
  return r;
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
