"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { getTRMHoy } from "@/lib/trm";
import { detectSeason, DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { isQuoteStatus } from "@/lib/quoteStatus";

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

function sanitizeFilenamePart(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function buildPdfFilename(code: string, clientName: string | null, routeName: string | null): string {
  const parts = [code, sanitizeFilenamePart(clientName), sanitizeFilenamePart(routeName)].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}

export async function updateQuote(id: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const newBase = num(formData.get("total_eur"));
  const seasonKindRaw = str(formData.get("season_kind"));
  const seasonKind = (seasonKindRaw === "high_season" || seasonKindRaw === "easter") ? seasonKindRaw : "regular";
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
    cost_eur: num(formData.get("cost_eur")),
    status: str(formData.get("status")) || "enviada",
    valid_until: str(formData.get("valid_until")),
    notes: str(formData.get("notes")),
  };
  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) return { error: mensajeError(error) };
  // Recalcular total_eur = base + suplemento + opcionales
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
  const { error } = await supabase.from("client_payments").delete().eq("id", paymentId);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
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

  const [{ data: quote }, { data: optionalsRaw }, { data: selectedLines }, { data: seasonSetting }, trmRow] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle(),
    supabase
      .from("optional_services")
      .select("category,name,unit,price_cs")
      .eq("active", true),
    supabase
      .from("quote_lines")
      .select("description,quantity,unit_price,total")
      .eq("quote_id", quoteId)
      .eq("type", "optional"),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
    getTRMHoy().catch(() => null),
  ]);
  if (!quote) return { error: "Cotización no encontrada" };

  const seasonConfig: SeasonSupplements = ((seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS);

  // Resolver suplemento "efectivo" para los bloques de comparación.
  // Si la cotización es nueva (post-migración 0002), usa season_supplement_eur guardado.
  // Si es legacy (suplemento embebido en base_eur, season_supplement_eur=0), detecta desde fecha
  // para que ambos bloques (elegido vs no-elegido) muestren el mismo suplemento de comparación.
  const peopleCountForSeason = Math.max(1, Number(quote.people) || 1);
  const storedSuppPerPerson = (Number(quote.season_supplement_eur) || 0) / peopleCountForSeason;
  let effectiveSuppPerPerson = storedSuppPerPerson;
  let effectiveSeasonKind: "regular" | "high_season" | "easter" =
    (quote.season_kind === "high_season" || quote.season_kind === "easter") ? quote.season_kind : "regular";
  if (effectiveSuppPerPerson === 0 && quote.start_date) {
    const detected = detectSeason(quote.start_date, quote.end_date, seasonConfig);
    if (detected.type !== "regular") {
      effectiveSuppPerPerson = detected.surcharge_per_person_cs;
      // No mutamos season_kind guardado — solo lo usamos para que el resumen también muestre la línea si aplica.
      effectiveSeasonKind = detected.type;
    }
  }
  const effectiveSeasonTotal = effectiveSuppPerPerson * peopleCountForSeason;

  // Cargar metadata de la ruta y etapas
  let route: { days: number | null; nights: number | null; origin: string | null; destination: string | null; km: number | null; difficulty: string | null; modality: string | null } | null = null;
  let stages: Array<{ day: number; from_place: string | null; to_place: string | null; km: number | null; accommodation: string | null }> = [];

  // Pricing del catálogo para la ruta (todas las modalidades)
  let routePricing: Array<{ modality: string; price_cs: number }> = [];
  let routeId: string | null = null;

  if (quote.route_name) {
    const { data: r } = await supabase
      .from("routes")
      .select("id,days,nights,origin,destination,km,difficulty,modality")
      .eq("name", quote.route_name)
      .maybeSingle();
    if (r) {
      routeId = r.id;
      route = {
        days: r.days,
        nights: r.nights,
        origin: r.origin,
        destination: r.destination,
        km: r.km != null ? Number(r.km) : null,
        difficulty: r.difficulty,
        modality: r.modality,
      };
      const { data: st } = await supabase
        .from("route_stages")
        .select("day,from_place,to_place,km,accommodation")
        .eq("route_id", r.id)
        .order("day");
      stages = ((st || []) as Array<{ day: number; from_place: string | null; to_place: string | null; km: number | string | null; accommodation: string | null }>).map((x) => ({
        ...x,
        km: x.km != null ? Number(x.km) : null,
      }));
      const { data: prc } = await supabase
        .from("pricing")
        .select("modality,price_cs")
        .eq("route_id", r.id)
        .eq("season", "regular");
      routePricing = ((prc || []) as Array<{ modality: string; price_cs: number | string | null }>)
        .map((p) => ({ modality: p.modality, price_cs: Number(p.price_cs) || 0 }))
        .filter((p) => p.price_cs > 0);
    }
  }

  // Determinar qué slug eligió el cliente y armar bloques
  const m = (quote.modality || "").toLowerCase();
  let chosenSlug: "pension_doble" | "pension_single" | "hotel_doble" | "hotel_single" | null = null;
  if (m.includes("pensión single") || m.includes("pension single") || m.includes("pensión individual") || m.includes("pension individual")) chosenSlug = "pension_single";
  else if (m.includes("pensión doble") || m.includes("pension doble")) chosenSlug = "pension_doble";
  else if (m.includes("hotel single") || m.includes("hotel individual")) chosenSlug = "hotel_single";
  else if (m.includes("hotel doble")) chosenSlug = "hotel_doble";

  type Block = { label: string; subLabel: string; pricePerPerson: number; isSelected: boolean };
  const priceBlocks: Block[] = [];
  const peopleCount = peopleCountForSeason;
  // Precio del bloque ELEGIDO = base / people. Si es legacy, base ya incluye suplemento embebido.
  // Si es nueva, base es puro y le sumamos el suplemento explícito guardado.
  const basePerPerson = (Number(quote.base_eur) || Number(quote.total_eur) || 0) / peopleCount;
  const actualPerPerson = basePerPerson + storedSuppPerPerson;

  if (chosenSlug) {
    const isSingle = chosenSlug.endsWith("single");
    const roomLabel = isSingle ? "INDIVIDUAL" : "DOBLE";
    const pensionSlug = `pension_${isSingle ? "single" : "doble"}` as const;
    const hotelSlug = `hotel_${isSingle ? "single" : "doble"}` as const;

    const pensionCat = routePricing.find((p) => p.modality === pensionSlug)?.price_cs ?? 0;
    const hotelCat = routePricing.find((p) => p.modality === hotelSlug)?.price_cs ?? 0;
    const chosenIsPension = chosenSlug === pensionSlug;
    const chosenIsHotel = chosenSlug === hotelSlug;

    // El bloque elegido refleja el precio REAL.
    // El bloque NO-elegido = catálogo + suplemento efectivo (resuelto: storedSupp si existe, o detectado por fecha si legacy).
    const pensionPrice = chosenIsPension ? actualPerPerson : (pensionCat > 0 ? pensionCat + effectiveSuppPerPerson : 0);
    const hotelPrice = chosenIsHotel ? actualPerPerson : (hotelCat > 0 ? hotelCat + effectiveSuppPerPerson : 0);

    if (pensionPrice > 0) {
      priceBlocks.push({
        label: `PENSIÓN ${roomLabel}`,
        subLabel: "baño privado · por persona",
        pricePerPerson: pensionPrice,
        isSelected: chosenIsPension,
      });
    }
    if (hotelPrice > 0) {
      priceBlocks.push({
        label: `HOTEL ${roomLabel}`,
        subLabel: "baño privado · por persona",
        pricePerPerson: hotelPrice,
        isSelected: chosenIsHotel,
      });
    }
  }

  // Fallback: modalidad custom (Doble + Triple, Personalizada) o sin chosenSlug
  if (priceBlocks.length === 0) {
    priceBlocks.push({
      label: (quote.modality || "Precio").toUpperCase(),
      subLabel: "baño privado · por persona",
      pricePerPerson: actualPerPerson,
      isSelected: true,
    });
  }

  const optionals = ((optionalsRaw || []) as Array<{ category: string; name: string; unit: string | null; price_cs: number | string | null }>).map((o) => ({
    category: o.category,
    name: o.name,
    unit: o.unit || "",
    price_cs: Number(o.price_cs) || 0,
  })).filter((o) => o.price_cs > 0);

  // Cargar imagen de cover
  const fsMod = await import("node:fs");
  const pathMod = await import("node:path");
  const coverPath = pathMod.join(process.cwd(), "src/lib/cover.jpg");
  let coverImage: Buffer | undefined;
  try {
    coverImage = fsMod.readFileSync(coverPath);
  } catch {
    // sin foto, continúa sin cover
  }

  const seasonValues = seasonSetting?.value as { high_season?: { price_cs: number }; easter?: { price_cs: number } } | null;
  const seasonNote = seasonValues
    ? { high: seasonValues.high_season?.price_cs ?? 80, easter: seasonValues.easter?.price_cs ?? 40 }
    : { high: 80, easter: 40 };

  // Render PDF
  const React = await import("react");
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { QuotePDF } = await import("@/lib/quotePdf");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(QuotePDF as any, {
    quote: {
      code: quote.code,
      client_name: quote.client_name,
      client_phone: quote.client_phone,
      client_email: quote.client_email,
      route_name: quote.route_name,
      start_date: quote.start_date,
      end_date: quote.end_date,
      people: quote.people,
      modality: quote.modality,
      total_eur: Number(quote.total_eur) || 0,
      valid_until: quote.valid_until,
      notes: quote.notes,
    },
    route,
    stages,
    optionals,
    trm: trmRow,
    coverImage,
    seasonNote,
    priceBlocks,
    selectedOptionals: ((selectedLines || []) as Array<{ description: string; quantity: number | string; unit_price: number | string; total: number | string }>).map((l) => ({
      description: l.description,
      quantity: Number(l.quantity) || 1,
      unit_price: Number(l.unit_price) || 0,
      total: Number(l.total) || 0,
    })),
    baseEur: Number(quote.base_eur) || Number(quote.total_eur) || 0,
    seasonSupplement: {
      kind: (quote.season_kind === "high_season" || quote.season_kind === "easter" ? quote.season_kind : "regular") as "regular" | "high_season" | "easter",
      total: Number(quote.season_supplement_eur) || 0,
      perPerson: (Number(quote.season_supplement_eur) || 0) / Math.max(1, Number(quote.people) || 1),
    },
  });
  let buffer: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(element as any);
  } catch (e) {
    console.error("[generateQuotePdf] render falló:", e);
    return { error: mensajeError(e as Error, "No se pudo generar el PDF de la cotización.") };
  }

  const path = buildPdfFilename(quote.code, quote.client_name, quote.route_name);
  const pdfPath = `comercial-quotes/${path}`;

  if (quote.pdf_path && quote.pdf_path !== pdfPath) {
    const oldFilePath = quote.pdf_path.replace(/^comercial-quotes\//, "");
    await supabase.storage.from("comercial-quotes").remove([oldFilePath]).catch(() => {});
  }

  // cacheControl "no-cache": la ruta del archivo es determinista (mismo nombre al regenerar),
  // así que sin esto la CDN/URL firmada seguiría sirviendo el PDF viejo tras regenerar.
  const { error: upErr } = await supabase.storage
    .from("comercial-quotes")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (upErr) return { error: mensajeError(upErr) };

  const { error: dbErr } = await supabase.from("quotes").update({ pdf_path: pdfPath }).eq("id", quoteId);
  if (dbErr) return { error: mensajeError(dbErr) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
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

  const filename = buildPdfFilename(`${quote.code}_hoteles`, quote.client_name, quote.route_name);
  const pdfPath = `comercial-hotels/${filename}`;

  if (quote.hotels_pdf_path && quote.hotels_pdf_path !== pdfPath) {
    const oldFilePath = quote.hotels_pdf_path.replace(/^comercial-hotels\//, "");
    await supabase.storage.from("comercial-hotels").remove([oldFilePath]).catch(() => {});
  }

  const { error: upErr } = await supabase.storage
    .from("comercial-hotels")
    .upload(filename, buffer, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
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

  const path = buildPdfFilename(q.code, q.client_name, q.route_name);
  const pdfPath = `comercial-quotes/${path}`;

  if (q.pdf_path && q.pdf_path !== pdfPath) {
    const oldFilePath = q.pdf_path.replace(/^comercial-quotes\//, "");
    await supabase.storage.from("comercial-quotes").remove([oldFilePath]).catch(() => {});
  }

  const buffer = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage
    .from("comercial-quotes")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (upErr) return { error: mensajeError(upErr) };

  const { error: dbErr } = await supabase.from("quotes").update({ pdf_path: pdfPath }).eq("id", quoteId);
  if (dbErr) return { error: mensajeError(dbErr) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}
