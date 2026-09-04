"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { DEFAULT_STATUS, isQuoteStatus } from "@/lib/quoteStatus";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { rutaCotizacion, rutaDocumentoPilgrim, rutaRecibo, sinBucket } from "@/lib/storage/paths";
import {
  agregarOpcionalLibre,
  alternarOpcional,
  cambiarCantidadOpcional,
  editarOpcionalLibre,
  eliminarOpcionalLibre,
} from "@/lib/quotes/optionals";
import type { OpcionalLibre } from "@/lib/quotes/opcionalLibre";
import { enviarCorreoCliente } from "@/lib/quotes/clientEmail";
import { enviarCorreoAPilgrim } from "@/lib/quotes/sendPilgrimEmail";
import { duplicarCotizacion } from "@/lib/quotes/duplicar";
import { resolverPagoCliente, esMonedaPago, type MonedaPago } from "@/lib/quotes/pagoCliente";

/**
 * Mueve el estado de la venta según lo cobrado. Se llama después de cada alta, edición o
 * borrado de un pago del cliente.
 *
 * Existe porque registrar un pago NO cambiaba el estado: había que acordarse de moverlo a
 * mano en un desplegable, y la tarjeta que genera la documentación de viaje solo se dibujaba
 * si el estado decía «pago completo». O sea que un cliente que ya pagó no recibía sus
 * documentos porque la plataforma creía que no había pagado (§2.6). Le pasaba a CS-2026-004:
 * 970 de 970 € cobrados.
 *
 * Solo avanza, nunca retrocede por su cuenta más allá de lo que el dinero justifica, y no
 * toca los estados que son decisión de una persona: `cancelada` y `completada` se quedan
 * como están. `sin_enviar` tampoco se toca sin dinero de por medio: una cotización que nadie
 * ha mandado no pasa a «aceptada» sola.
 */
async function sincronizarEstadoPorCobro(
  supabase: Awaited<ReturnType<typeof createCommercialClient>>,
  quoteId: string,
) {
  const [{ data: q }, { data: pagos }] = await Promise.all([
    supabase.from("quotes").select("status,total_eur").eq("id", quoteId).maybeSingle(),
    supabase.from("client_payments").select("amount_eur,amount,currency").eq("quote_id", quoteId),
  ]);
  if (!q) return;
  // Estos dos los decide una persona, no el saldo.
  if (q.status === "cancelada" || q.status === "completada") return;

  const cobrado = (pagos ?? []).reduce((s, p) => {
    const v = p.amount_eur ?? (p.currency === "EUR" ? p.amount : 0);
    return s + (Number(v) || 0);
  }, 0);
  const total = Number(q.total_eur) || 0;

  // Con un céntimo de margen: los redondeos de tasa no pueden dejar un viaje pagado
  // figurando como "parcial" por dos céntimos.
  const nuevo =
    cobrado <= 0 ? null : total > 0 && cobrado >= total - 0.01 ? "pago_completo" : "pago_parcial";
  if (!nuevo || nuevo === q.status) return;

  await supabase.from("quotes").update({ status: nuevo }).eq("id", quoteId);
}

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

/**
 * ¿Estos dos valores dicen lo mismo, vengan de donde vengan?
 *
 * Hace falta porque los dos lados llegan en formatos distintos: Postgres devuelve los
 * `numeric` como cadena ("585.00") y las fechas como "2026-10-19", mientras el formulario
 * manda números y cadenas ya normalizados. Sin esto, comparar 585 con "585.00" diría que
 * cambió el precio en cada guardado y no serviría de nada.
 */
function mismoValor(a: unknown, b: unknown): boolean {
  const vacio = (v: unknown) => v == null || v === "";
  if (vacio(a) && vacio(b)) return true;
  if (vacio(a) !== vacio(b)) return false;
  if (typeof a === "object" || typeof b === "object") {
    // `price_blocks` y `rooms_json`: se comparan por contenido con las claves ordenadas,
    // porque el orden en que Postgres devuelve un jsonb no es el que armó el formulario.
    const orden = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(orden);
      if (v && typeof v === "object") {
        return Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)).map(([k, val]) => [k, orden(val)]),
        );
      }
      return v;
    };
    return JSON.stringify(orden(a)) === JSON.stringify(orden(b));
  }
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

export async function updateQuote(id: string, formData: FormData) {
  const supabase = await createCommercialClient();
  // Cómo está ahora, para saber después si de verdad cambió algo (ver más abajo).
  const { data: antesRaw } = await supabase
    .from("quotes")
    .select("client_name,client_phone,client_email,route_name,start_date,end_date,people,modality,base_eur,season_supplement_eur,season_kind,cost_base_eur,season_supplement_cost_eur,valid_until,notes,price_blocks,rooms_json,pdf_path")
    .eq("id", id)
    .maybeSingle();
  const antes = (antesRaw ?? null) as Record<string, unknown> | null;
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
  // Reparto de habitaciones a medida. Se escribe SOLO si el formulario lo mandó: el editor
  // omite el campo cuando la cotización no está en ese modo, y ahí `rooms_json` tiene que
  // quedar como está (una cotización del cotizador web trae ahí su reparto automático, y
  // pisarlo con null le borraría el desglose mixto del PDF).
  const roomsRaw = formData.get("rooms_json");
  let roomsJson: unknown;
  if (roomsRaw != null) {
    const t = String(roomsRaw).trim();
    if (t === "") roomsJson = null;
    else {
      try { roomsJson = JSON.parse(t); } catch { roomsJson = null; }
    }
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
    status: str(formData.get("status")) || DEFAULT_STATUS,
    valid_until: str(formData.get("valid_until")),
    notes: str(formData.get("notes")),
    price_blocks: priceBlocks,
    ...(roomsRaw != null ? { rooms_json: roomsJson } : {}),
  };
  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) return { error: mensajeError(error) };
  // Recalcula total_eur y cost_eur: base + suplemento + opcionales de cada lado.
  await supabase.rpc("recompute_quote_total", { p_quote_id: id });

  // El PDF se regenera SOLO si cambió algo que sale en él.
  //
  // Antes se regeneraba en cada guardado, aunque no se hubiera tocado nada (§2.4): abrir un
  // expediente y pulsar Guardar por costumbre pisaba el PDF que el cliente ya tenía en su
  // correo, y con él se quemaba el único rastro que quedaba de la versión anterior. Como el
  // archivo se sobrescribe en la misma ruta de Storage, eso no se puede deshacer.
  //
  // `status` queda fuera de la comparación a propósito: no aparece en el documento. El
  // resto del parche sí, y `pdf_path` vacío fuerza la generación —una cotización sin PDF
  // todavía siempre lo necesita—.
  const cambiaElPdf =
    !antes?.pdf_path ||
    (Object.keys(patch) as Array<keyof typeof patch>).some(
      (k) => k !== "status" && !mismoValor(antes[k], patch[k]),
    );

  const pdf = cambiaElPdf ? await renderAndStoreQuotePdf(supabase, id) : null;
  const pdfAviso = pdf && "error" in pdf && pdf.error ? "Se guardó, pero el PDF no se pudo regenerar." : null;
  revalidatePath(`/seguimiento/${id}`);
  revalidatePath("/seguimiento");
  return pdfAviso ? { ok: true as const, aviso: pdfAviso } : { ok: true as const };
}

// Cambio rápido de estado desde el listado (sin entrar a editar).
/**
 * Crea una copia de esta cotización y devuelve a dónde ir.
 *
 * Existe porque volver a cotizarle a alguien lo mismo con dos noches más —o armarle a otro
 * cliente lo que ya se armó una vez— obligaba a rehacer el asistente entero y a re-marcar
 * los opcionales uno por uno. El detalle de qué se copia y qué no está en `duplicar.ts`.
 */
export async function duplicateQuote(id: string) {
  const supabase = await createCommercialClient();
  const r = await duplicarCotizacion(supabase, id);
  if (!r.ok) return { error: r.error };
  revalidatePath("/seguimiento");
  revalidatePath("/calendario");
  return { ok: true as const, id: r.id, code: r.code };
}

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

/**
 * Borra una cotización por completo (incluye sus PDFs en Storage).
 * Las tablas hijas (quote_lines, client_payments, provider_payments, quote_hotels)
 * se borran solas por ON DELETE CASCADE.
 *
 * **Se niega si hay un contrato firmado o dinero registrado.** Antes no comprobaba nada:
 * borraba igual una venta con contrato firmado, pagos y documentación enviada, tras un
 * «¿seguro?» genérico que no mencionaba ni una cosa ni la otra. Y borrar es rutina —se han
 * emitido 84 códigos y quedan 44 cotizaciones—, así que el accidente era cuestión de
 * tiempo. Lo peor es lo que SÍ sobrevivía: los archivos quedaban sueltos en el
 * almacenamiento (hay dos pasaportes de cotizaciones borradas, `CS-2026-048` y
 * `CS-2026-044`), o sea que se perdía el registro y se conservaba el dato personal,
 * exactamente al revés de lo deseable.
 *
 * Para eso está `cancelada`, que ya existe en los estados: conserva el rastro y saca la
 * venta de en medio. Mientras no haya copia de seguridad, esta guarda es la única red que
 * hay debajo de un error irreversible.
 */
export async function deleteQuote(id: string) {
  const supabase = await createCommercialClient();

  const [{ data: firmados }, { data: pagosCliente }, { data: pagosProveedor }] = await Promise.all([
    supabase.from("contracts").select("id").eq("quote_id", id).not("signed_at", "is", null),
    supabase.from("client_payments").select("id").eq("quote_id", id),
    supabase.from("provider_payments").select("id").eq("quote_id", id),
  ]);

  const nFirmados = firmados?.length ?? 0;
  const nPagos = (pagosCliente?.length ?? 0) + (pagosProveedor?.length ?? 0);
  if (nFirmados > 0 || nPagos > 0) {
    // El motivo se dice con las cifras concretas: un "no se puede" a secas invita a buscar
    // la forma de saltárselo, y aquí la alternativa buena es real.
    const partes = [
      nFirmados > 0 ? `${nFirmados} contrato${nFirmados === 1 ? "" : "s"} firmado${nFirmados === 1 ? "" : "s"}` : null,
      nPagos > 0 ? `${nPagos} pago${nPagos === 1 ? "" : "s"} registrado${nPagos === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    return {
      error:
        `No se puede borrar: esta cotización tiene ${partes.join(" y ")}. ` +
        `Borrarla se llevaría la prueba de la firma y el rastro del dinero, y no hay vuelta atrás. ` +
        `Si la venta se cayó, cámbiale el estado a «Cancelada»: se queda fuera de en medio y el registro se conserva.`,
    };
  }

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

/**
 * Servicio opcional a la medida de esta cotización: descripción, cantidad, mi precio y el
 * de Pilgrim. Vive solo acá — no se agrega al catálogo — y suma al total y al costo como
 * cualquier otro opcional. Ver la cabecera del bloque en @/lib/quotes/optionals.
 */
export async function addCustomOptional(quoteId: string, datos: OpcionalLibre) {
  const supabase = await createCommercialClient();
  const r = await agregarOpcionalLibre(supabase, quoteId, datos);
  if (r.error) return { error: r.error };
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function updateCustomOptional(quoteId: string, lineId: string, datos: OpcionalLibre) {
  const supabase = await createCommercialClient();
  const r = await editarOpcionalLibre(supabase, quoteId, lineId, datos);
  if (r.error) return { error: r.error };
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function deleteCustomOptional(quoteId: string, lineId: string) {
  const supabase = await createCommercialClient();
  const r = await eliminarOpcionalLibre(supabase, quoteId, lineId);
  if (r.error) return { error: r.error };
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function updateQuoteLineQuantity(quoteId: string, lineId: string, quantity: number) {
  const supabase = await createCommercialClient();
  const r = await cambiarCantidadOpcional(supabase, quoteId, lineId, quantity);
  if (r.error) return { error: r.error };
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function addClientPayment(id: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const amount = num(formData.get("amount")) ?? 0;
  const monedaCruda = str(formData.get("currency")) || "EUR";
  const currency: MonedaPago = esMonedaPago(monedaCruda) ? monedaCruda : "EUR";
  const trm = num(formData.get("trm_eur_cop"));
  const account = str(formData.get("account"));

  // Las tres guardas del euro: ver @/lib/quotes/pagoCliente. La misma llamada está en la
  // edición, para que un pago correcto no pueda corromperse al editarlo.
  const cuentas = resolverPagoCliente({ amount, currency, trm, account });
  if (!cuentas.ok) return { error: cuentas.error };
  const amountEur = cuentas.amountEur;

  const { error } = await supabase.from("client_payments").insert({
    quote_id: id,
    paid_at: str(formData.get("paid_at")) || new Date().toISOString().slice(0, 10),
    amount,
    currency,
    trm_eur_cop: trm,
    amount_eur: amountEur,
    method: str(formData.get("method")),
    account,
    reference: str(formData.get("reference")),
    notes: str(formData.get("notes")),
  });
  if (error) return { error: mensajeError(error) };
  await sincronizarEstadoPorCobro(supabase, id);
  revalidatePath(`/seguimiento/${id}`);
  revalidatePath("/seguimiento");
  revalidatePath("/calendario");
  return cuentas.aviso ? { ok: true as const, aviso: cuentas.aviso } : { ok: true as const };
}

export async function updateClientPayment(quoteId: string, paymentId: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const amount = num(formData.get("amount")) ?? 0;
  const monedaCruda = str(formData.get("currency")) || "EUR";
  const currency: MonedaPago = esMonedaPago(monedaCruda) ? monedaCruda : "EUR";
  const trm = num(formData.get("trm_eur_cop"));
  const account = str(formData.get("account"));

  const cuentas = resolverPagoCliente({ amount, currency, trm, account });
  if (!cuentas.ok) return { error: cuentas.error };
  const amountEur = cuentas.amountEur;

  const { error } = await supabase
    .from("client_payments")
    .update({
      paid_at: str(formData.get("paid_at")) || new Date().toISOString().slice(0, 10),
      amount,
      currency,
      trm_eur_cop: trm,
      amount_eur: amountEur,
      method: str(formData.get("method")),
      account,
      reference: str(formData.get("reference")),
      notes: str(formData.get("notes")),
    })
    .eq("id", paymentId)
    .eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };
  await sincronizarEstadoPorCobro(supabase, quoteId);
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  revalidatePath("/finanzas");
  revalidatePath("/calendario");
  return cuentas.aviso ? { ok: true as const, aviso: cuentas.aviso } : { ok: true as const };
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
  // Borrar un pago también mueve el estado: si se quita el que completaba el total, la venta
  // no puede seguir diciendo «pago completo».
  await sincronizarEstadoPorCobro(supabase, quoteId);
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  revalidatePath("/calendario");
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
/**
 * Manda la cotización al cliente.
 *
 * `pruebaEmail` la desvía a otra dirección para ver cómo queda antes de mandarla de
 * verdad. En prueba no se marca el expediente, así que tampoco hay nada que refrescar.
 */
export async function enviarCorreoCotizacion(
  quoteId: string,
  mensaje: { subject: string; body: string; pruebaEmail?: string },
): Promise<{ ok?: true; email?: string; error?: string }> {
  const supabase = await createCommercialClient();
  const r = await enviarCorreoCliente(supabase, quoteId, mensaje);
  if (r.ok && !mensaje.pruebaEmail?.trim()) revalidatePath(`/seguimiento/${quoteId}`);
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
): Promise<{ ok?: true; email?: string; adjuntos?: number; confirmado?: boolean; error?: string }> {
  const supabase = await createCommercialClient();
  const r = await enviarCorreoAPilgrim(supabase, quoteId, mensaje);
  // En prueba no se marca el expediente, así que tampoco hay nada que revalidar.
  if (r.ok && !mensaje.pruebaEmail?.trim()) revalidatePath(`/seguimiento/${quoteId}`);
  return r;
}

// El listado de hoteles vivía acá: una tabla de texto libre por cotización y un PDF con
// solo esa tabla. Lo reemplazó la documentación de viaje (migración 0030), que arma el
// documento completo leyendo el hotel del catálogo comercial.hotels. Ver
// ./travelDocActions.ts y @/lib/travelDocs/render.ts.
//
// `quotes.hotels_pdf_path` y el bucket comercial-hotels se conservan sin escribirse: los
// PDF ya generados siguen ahí y el borrado de una cotización sigue limpiándolos.

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

// ---------------- DOCUMENTOS QUE NOS MANDA PILGRIM ----------------
//
// El archivo del expediente: confirmaciones, facturas, la documentación que arma Pilgrim.
// Es interno — nunca sale al cliente. Lo que sí recibe el cliente vive en travel_docs y se
// maneja desde ./travelDocActions.ts.

// Generoso a propósito: Pilgrim manda PDF, pero también capturas de pantalla y hojas de
// cálculo. Filtrar de más obligaría a renombrar archivos para poder guardarlos.
const PILGRIM_MAX_BYTES = 20 * 1024 * 1024;

export async function subirDocumentoPilgrim(quoteId: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Sin archivo." };
  if (file.size > PILGRIM_MAX_BYTES) return { error: `"${file.name}" pesa más de 20 MB.` };

  const { data: quote } = await supabase.from("quotes").select("code").eq("id", quoteId).maybeSingle();
  if (!quote) return { error: "Cotización no encontrada." };

  const destino = rutaDocumentoPilgrim(quote.code, file.name);
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from("comercial-docs")
    .upload(sinBucket(destino), buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { error: mensajeError(upErr) };

  const { error } = await supabase.from("quote_pilgrim_files").insert({
    quote_id: quoteId,
    name: file.name,
    kind: (formData.get("kind") as string) || null,
    storage_path: destino,
    mime: file.type || null,
    size_bytes: file.size,
  });
  if (error) {
    // Si no se pudo indexar, el archivo en Storage sería basura invisible: se limpia.
    await removeStoragePath(supabase, destino);
    return { error: mensajeError(error) };
  }

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Renombra o reetiqueta un documento. El archivo en Storage no se mueve. */
export async function editarDocumentoPilgrim(
  quoteId: string,
  fileId: string,
  campos: { name?: string; kind?: string | null; notes?: string | null },
) {
  const supabase = await createCommercialClient();
  const parche: Record<string, string | null> = {};
  if (campos.name !== undefined) {
    const limpio = campos.name.trim();
    if (!limpio) return { error: "El nombre no puede quedar vacío." };
    parche.name = limpio;
  }
  if (campos.kind !== undefined) parche.kind = campos.kind || null;
  if (campos.notes !== undefined) parche.notes = campos.notes?.trim() || null;

  const { error } = await supabase.from("quote_pilgrim_files").update(parche).eq("id", fileId);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

export async function eliminarDocumentoPilgrim(quoteId: string, fileId: string) {
  const supabase = await createCommercialClient();
  const { data: f } = await supabase
    .from("quote_pilgrim_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();

  const { error } = await supabase.from("quote_pilgrim_files").delete().eq("id", fileId);
  if (error) return { error: mensajeError(error) };
  // Después del renglón: un archivo huérfano en Storage molesta menos que un renglón
  // apuntando a un archivo que ya no existe.
  await removeStoragePath(supabase, f?.storage_path as string | null);

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}
