"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { getTRMHoy } from "@/lib/trm";

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
  const patch = {
    client_name: str(formData.get("client_name")),
    client_phone: str(formData.get("client_phone")),
    client_email: str(formData.get("client_email")),
    route_name: str(formData.get("route_name")),
    start_date: str(formData.get("start_date")),
    end_date: str(formData.get("end_date")),
    people: num(formData.get("people")),
    modality: str(formData.get("modality")),
    base_eur: newBase, // base = ruta + alojamiento (lo que ingresa el usuario)
    cost_eur: num(formData.get("cost_eur")),
    status: str(formData.get("status")) || "borrador",
    valid_until: str(formData.get("valid_until")),
    notes: str(formData.get("notes")),
  };
  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) return { error: error.message };
  // Recalcular total_eur = base + opcionales
  await supabase.rpc("recompute_quote_total", { p_quote_id: id });
  revalidatePath(`/seguimiento/${id}`);
  revalidatePath("/seguimiento");
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
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("quote_lines")
      .delete()
      .eq("quote_id", quoteId)
      .eq("reference_id", optionalId);
    if (error) return { error: error.message };
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
  if (error) return { error: error.message };
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
    reference: str(formData.get("reference")),
    notes: str(formData.get("notes")),
  });
  if (error) return { error: error.message };
  revalidatePath(`/seguimiento/${id}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function deleteClientPayment(quoteId: string, paymentId: string) {
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("client_payments").delete().eq("id", paymentId);
  if (error) return { error: error.message };
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
    notes: str(formData.get("notes")),
  });
  if (error) return { error: error.message };
  revalidatePath(`/seguimiento/${id}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function deleteProviderPayment(quoteId: string, paymentId: string) {
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("provider_payments").delete().eq("id", paymentId);
  if (error) return { error: error.message };
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
  if (error) return { error: error.message };
  return { url: data.signedUrl };
}

export async function getSignedUrl(storagePath: string) {
  if (!storagePath) return { url: null };
  const supabase = await createCommercialClient();
  const [bucket, ...rest] = storagePath.split("/");
  const filePath = rest.join("/");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60 * 10);
  if (error) return { error: error.message };
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
  const actualPerPerson = (Number(quote.total_eur) || 0) / Math.max(1, quote.people || 1);

  if (chosenSlug) {
    const isSingle = chosenSlug.endsWith("single");
    const roomLabel = isSingle ? "INDIVIDUAL" : "DOBLE";
    const pensionSlug = `pension_${isSingle ? "single" : "doble"}` as const;
    const hotelSlug = `hotel_${isSingle ? "single" : "doble"}` as const;

    const pensionCat = routePricing.find((p) => p.modality === pensionSlug)?.price_cs ?? 0;
    const hotelCat = routePricing.find((p) => p.modality === hotelSlug)?.price_cs ?? 0;
    const chosenIsPension = chosenSlug === pensionSlug;
    const chosenIsHotel = chosenSlug === hotelSlug;

    // El bloque elegido siempre usa el precio REAL de la cotización (refleja override, descuentos, suplementos).
    // El otro bloque (no elegido) usa el catálogo si está disponible.
    const pensionPrice = chosenIsPension ? actualPerPerson : pensionCat;
    const hotelPrice = chosenIsHotel ? actualPerPerson : hotelCat;

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
  });
  let buffer: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(element as any);
  } catch (e) {
    return { error: `Render PDF: ${(e as Error).message}` };
  }

  const path = `${quote.code}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("comercial-quotes")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (upErr) return { error: upErr.message };

  const pdfPath = `comercial-quotes/${path}`;
  const { error: dbErr } = await supabase.from("quotes").update({ pdf_path: pdfPath }).eq("id", quoteId);
  if (dbErr) return { error: dbErr.message };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

export async function uploadQuotePdf(quoteId: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Sin archivo" };
  if (file.type !== "application/pdf") return { error: "Solo PDFs" };
  if (file.size > 20 * 1024 * 1024) return { error: "PDF demasiado grande (>20MB)" };

  const { data: q } = await supabase.from("quotes").select("code").eq("id", quoteId).maybeSingle();
  if (!q) return { error: "Cotización no encontrada" };

  const path = `${q.code}.pdf`;
  const buffer = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage
    .from("comercial-quotes")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (upErr) return { error: upErr.message };

  const pdfPath = `comercial-quotes/${path}`;
  const { error: dbErr } = await supabase.from("quotes").update({ pdf_path: pdfPath }).eq("id", quoteId);
  if (dbErr) return { error: dbErr.message };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}
