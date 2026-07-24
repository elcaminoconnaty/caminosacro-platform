import "server-only";

import { createCommercialClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mensajeError } from "@/lib/errors";
import { getTRMHoy } from "@/lib/trm";
import { detectSeason, DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";

/**
 * Cliente del schema `comercial`: el de sesión (dashboard) o el admin (cotizador público,
 * que no tiene usuario logueado y por RLS no vería nada con la llave anónima).
 */
export type ComercialClient =
  | Awaited<ReturnType<typeof createCommercialClient>>
  | ReturnType<typeof createAdminClient>;

function sanitizeFilenamePart(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function buildPdfFilename(code: string, clientName: string | null, routeName: string | null): string {
  const parts = [code, sanitizeFilenamePart(clientName), sanitizeFilenamePart(routeName)].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}

export async function renderAndStoreQuotePdf(supabase: ComercialClient, quoteId: string) {

  const [{ data: quote }, { data: optionalsRaw }, { data: selectedLines }, { data: seasonSetting }, trmRow] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle(),
    supabase
      .from("optional_services")
      .select("id,category,name,unit,price_cs")
      .eq("active", true),
    supabase
      .from("quote_lines")
      .select("description,quantity,unit_price,total,reference_id")
      .eq("quote_id", quoteId)
      .eq("type", "optional"),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
    getTRMHoy(supabase).catch(() => null),
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

  // Determinar qué slug eligió el cliente y armar bloques.
  // Tipo y habitación se detectan por separado para cubrir tanto los labels viejos
  // ("Pensión doble") como los del reparto de habitaciones ("Pensión, habitación doble").
  // Un label mixto ("Pensión · 2 dobles + 1 individual") menciona ambas habitaciones
  // y no produce slug: ese caso lo cubre roomBreakdown más abajo.
  const m = (quote.modality || "").toLowerCase();
  const tipoAloj = m.includes("hotel") ? "hotel" : m.includes("pensión") || m.includes("pension") ? "pension" : null;
  const hasDoble = m.includes("doble");
  const hasSingle = m.includes("single") || m.includes("individual");
  let chosenSlug: "pension_doble" | "pension_single" | "hotel_doble" | "hotel_single" | null = null;
  if (tipoAloj && hasSingle && !hasDoble) chosenSlug = `${tipoAloj}_single`;
  else if (tipoAloj && hasDoble && !hasSingle) chosenSlug = `${tipoAloj}_doble`;

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

  // Reparto mixto del cotizador web (N dobles + 1 individual): sin chosenSlug único,
  // las tarjetas muestran la tarifa de cada tipo de habitación (guardada en rooms_json
  // al cotizar, para que el PDF no cambie si el catálogo cambia después).
  const rooms = (quote.rooms_json ?? null) as {
    tipo?: string;
    dobles?: number;
    individuales?: number;
    tarifa_doble?: number;
    tarifa_single?: number;
  } | null;
  const roomBreakdown =
    rooms && (Number(rooms.dobles) || 0) > 0 && (Number(rooms.individuales) || 0) > 0
      ? {
          tipo: (rooms.tipo === "hotel" ? "hotel" : "pension") as "pension" | "hotel",
          dobles: Number(rooms.dobles) || 0,
          individuales: Number(rooms.individuales) || 0,
          tarifa_doble: Number(rooms.tarifa_doble) || 0,
          tarifa_single: Number(rooms.tarifa_single) || 0,
        }
      : null;

  if (priceBlocks.length === 0 && roomBreakdown && roomBreakdown.tarifa_doble > 0 && roomBreakdown.tarifa_single > 0) {
    const tipoLabel = roomBreakdown.tipo === "hotel" ? "HOTEL" : "PENSIÓN";
    priceBlocks.push(
      {
        label: `${tipoLabel} DOBLE`,
        subLabel: "baño privado · por persona",
        pricePerPerson: roomBreakdown.tarifa_doble + effectiveSuppPerPerson,
        isSelected: true,
      },
      {
        label: `${tipoLabel} INDIVIDUAL`,
        subLabel: "baño privado · por persona",
        pricePerPerson: roomBreakdown.tarifa_single + effectiveSuppPerPerson,
        isSelected: false,
      },
    );
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

  // Extras del itinerario: noches extra en Santiago y tours contratados, derivados de las
  // líneas opcionales seleccionadas. El componente los usa para extender el itinerario, el
  // conteo de días/noches y el rango de fechas del PDF.
  const categoryById = new Map<string, string>();
  for (const o of (optionalsRaw || []) as Array<{ id: string; category: string }>) {
    categoryById.set(o.id, o.category);
  }
  // Habitaciones del reparto: convierten "cantidad = habitaciones × noches" en noches.
  const roomsCount = roomBreakdown
    ? roomBreakdown.dobles + roomBreakdown.individuales
    : chosenSlug
      ? (chosenSlug.endsWith("single") ? peopleCount : Math.ceil(peopleCount / 2))
      : 1;
  const roomsSafe = Math.max(1, roomsCount);
  let extraNights = 0;
  let extraNightTipo: "pension" | "hotel" = "pension";
  const tours: string[] = [];
  for (const l of ((selectedLines || []) as Array<{ description: string; quantity: number | string; reference_id: string | null }>)) {
    const cat = l.reference_id ? categoryById.get(l.reference_id) : undefined;
    if (cat === "noche_extra") {
      extraNights += Math.round((Number(l.quantity) || 0) / roomsSafe);
      if (/hotel|casa rural/i.test(l.description)) extraNightTipo = "hotel";
    } else if (cat === "tour") {
      // El nombre viene como "Tour X (por persona)"; quito la unidad entre paréntesis.
      tours.push(l.description.replace(/\s*\([^)]*\)\s*$/, "").trim());
    }
  }
  const itineraryExtras = extraNights > 0 || tours.length > 0
    ? { extraNights, extraNightTipo, tours }
    : null;

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
    roomBreakdown,
    itineraryExtras,
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

  return { ok: true };
}
