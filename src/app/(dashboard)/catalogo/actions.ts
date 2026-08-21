"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";

export async function updatePricing(id: string, field: "price_pilgrim" | "price_cs", value: number | null) {
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("pricing").update({ [field]: value }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/catalogo");
  revalidatePath("/seguimiento");
  return { ok: true };
}

// Para filas "virtuales" de la tabla del catálogo: rutas sin fila en pricing para
// una modalidad. Al teclear el primer precio se crea la fila y se devuelve su id.
export async function upsertPricing(
  routeId: string,
  modality: string,
  field: "price_pilgrim" | "price_cs",
  value: number | null,
  year: number,
) {
  const supabase = await createCommercialClient();
  const { data, error } = await supabase
    .from("pricing")
    .insert({ route_id: routeId, modality, season: "regular", year, [field]: value })
    .select("id")
    .single();
  if (error) return { error: mensajeError(error) };
  revalidatePath("/catalogo");
  revalidatePath("/cotizaciones/nueva");
  revalidatePath("/seguimiento");
  return { ok: true, id: data.id as string };
}

export async function applyMarkupRule(year: number) {
  // Regla: max(pilgrim+100, pilgrim/0.85). Aplica a las filas del año con price_pilgrim > 0.
  const supabase = await createCommercialClient();
  const { data, error } = await supabase
    .from("pricing")
    .select("id,price_pilgrim")
    .eq("year", year)
    .not("price_pilgrim", "is", null);
  if (error) return { error: mensajeError(error) };

  let updated = 0;
  for (const row of data || []) {
    const p = Number(row.price_pilgrim);
    if (!p) continue;
    const cs = Math.round(Math.max(p + 100, p / 0.85));
    await supabase.from("pricing").update({ price_cs: cs }).eq("id", row.id);
    updated++;
  }
  revalidatePath("/catalogo");
  return { ok: true, updated };
}

/**
 * Arranca el catálogo de un año copiando el del año anterior — tarifas de ruta y precios
 * de opcionales: crea SOLO las filas que faltan, nunca pisa un precio ya cargado. Es un
 * punto de partida para editar encima, no una vigencia automática.
 */
export async function copyPricingFromPreviousYear(year: number) {
  const supabase = await createCommercialClient();
  const from = year - 1;

  const [
    { data: source, error: errSource },
    { data: target, error: errTarget },
    { data: optSource, error: errOptSource },
    { data: optTarget, error: errOptTarget },
    { data: bikeSource, error: errBikeSource },
    { data: bikeTarget, error: errBikeTarget },
  ] = await Promise.all([
    supabase.from("pricing").select("route_id,modality,price_pilgrim,price_cs,notes").eq("year", from).eq("season", "regular"),
    supabase.from("pricing").select("route_id,modality").eq("year", year).eq("season", "regular"),
    supabase.from("optional_prices").select("optional_id,price_pilgrim,price_cs").eq("year", from),
    supabase.from("optional_prices").select("optional_id").eq("year", year),
    // El alquiler de bici es (bici × ruta × año): se arrastra `days` porque la tarifa
    // cubre esos días y sin ese dato la fila copiada no se puede contrastar con Pilgrim.
    supabase.from("bike_prices").select("bike_id,route_id,days,price_pilgrim,price_cs,notes").eq("year", from),
    supabase.from("bike_prices").select("bike_id,route_id").eq("year", year),
  ]);
  for (const e of [errSource, errTarget, errOptSource, errOptTarget, errBikeSource, errBikeTarget]) {
    if (e) return { error: mensajeError(e) };
  }
  if ((source?.length ?? 0) === 0 && (optSource?.length ?? 0) === 0 && (bikeSource?.length ?? 0) === 0) {
    return { error: `No hay precios ${from} para copiar.` };
  }

  const existing = new Set((target || []).map((r) => `${r.route_id}:${r.modality}`));
  const nuevas = (source || [])
    .filter((r) => !existing.has(`${r.route_id}:${r.modality}`))
    .map((r) => ({
      route_id: r.route_id,
      modality: r.modality,
      season: "regular",
      year,
      price_pilgrim: r.price_pilgrim,
      price_cs: r.price_cs,
      notes: r.notes,
    }));
  if (nuevas.length > 0) {
    const { error } = await supabase.from("pricing").insert(nuevas);
    if (error) return { error: mensajeError(error) };
  }

  const existingOpt = new Set((optTarget || []).map((r) => r.optional_id));
  const nuevosOpt = (optSource || [])
    .filter((r) => !existingOpt.has(r.optional_id))
    .map((r) => ({ optional_id: r.optional_id, year, price_pilgrim: r.price_pilgrim, price_cs: r.price_cs }));
  if (nuevosOpt.length > 0) {
    const { error } = await supabase.from("optional_prices").insert(nuevosOpt);
    if (error) return { error: mensajeError(error) };
  }

  const existingBike = new Set((bikeTarget || []).map((r) => `${r.bike_id}:${r.route_id}`));
  const nuevasBici = (bikeSource || [])
    .filter((r) => !existingBike.has(`${r.bike_id}:${r.route_id}`))
    .map((r) => ({
      bike_id: r.bike_id,
      route_id: r.route_id,
      year,
      days: r.days,
      price_pilgrim: r.price_pilgrim,
      price_cs: r.price_cs,
      notes: r.notes,
    }));
  if (nuevasBici.length > 0) {
    const { error } = await supabase.from("bike_prices").insert(nuevasBici);
    if (error) return { error: mensajeError(error) };
  }

  revalidatePath("/catalogo");
  revalidatePath("/cotizaciones/nueva");
  revalidatePath("/seguimiento");
  return { ok: true, copied: nuevas.length, copiedOptionals: nuevosOpt.length, copiedBikes: nuevasBici.length, from };
}

export async function getResourceUrl(storagePath: string) {
  if (!storagePath) return { url: null };
  const supabase = await createCommercialClient();
  const [bucket, ...rest] = storagePath.split("/");
  const filePath = rest.join("/");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60 * 10);
  if (error) return { error: mensajeError(error) };
  return { url: data.signedUrl };
}

export async function updateOptionalService(
  id: string,
  field: "price_pilgrim" | "price_cs" | "name",
  value: string | number | null,
  year: number,
) {
  const supabase = await createCommercialClient();
  // El nombre vive en el servicio; los precios, en la fila del año (migración 0019).
  if (field === "name") {
    const { error } = await supabase.from("optional_services").update({ name: value }).eq("id", id);
    if (error) return { error: mensajeError(error) };
  } else {
    const { error } = await supabase
      .from("optional_prices")
      .upsert({ optional_id: id, year, [field]: value }, { onConflict: "optional_id,year" });
    if (error) return { error: mensajeError(error) };
  }
  revalidatePath("/catalogo");
  revalidatePath("/seguimiento");
  return { ok: true };
}

// =============================================================
// Tarifas de alquiler de bicicleta (comercial.bike_prices, migración 0021)
// =============================================================

/**
 * Guarda una celda de la grilla bici × ruta del año.
 *
 * Upsert sobre la unique (bike_id, route_id, year): la fila casi siempre existe ya (el
 * seed las crea vacías), pero si Nico agrega una ruta de bici nueva la primera tecleada
 * la crea. `days` no va en el payload a propósito: en un conflicto PostgREST solo pisa
 * las columnas enviadas, así que los días de alquiler cargados sobreviven.
 *
 * `value` en null es un caso legítimo, no un error: des-cargar una tarifa la devuelve a
 * "sin cargar" (celda en ámbar), que es distinto de un precio de 0.
 */
export async function updateBikePrice(
  bikeId: string,
  routeId: string,
  year: number,
  field: "price_pilgrim" | "price_cs",
  value: number | null,
) {
  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("bike_prices")
    .upsert({ bike_id: bikeId, route_id: routeId, year, [field]: value }, { onConflict: "bike_id,route_id,year" });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/catalogo");
  revalidatePath("/seguimiento");
  return { ok: true };
}

/**
 * Regla de precio del alquiler de bici: `price_cs = round(price_pilgrim / 0.85)`, o sea la
 * comisión de agencia del 15 % sobre el precio de venta.
 *
 * OJO: NO es la regla de las rutas (`applyMarkupRule`, que usa max(pilgrim+100, pilgrim/0.85)).
 * Ese +100 es un piso pensado para un paquete de varios días de alojamiento; sobre un
 * alquiler de 265 € sería un margen del 27 %, fuera de mercado frente a Pilgrim.
 *
 * Solo toca filas con Pilgrim cargado: una tarifa sin cargar tiene que seguir viéndose en
 * ámbar hasta que Pilgrim la mande, no convertirse en un 0 con margen inventado.
 */
export async function applyBikeRule(year: number) {
  const supabase = await createCommercialClient();
  const { data, error } = await supabase
    .from("bike_prices")
    .select("id,price_pilgrim")
    .eq("year", year)
    .not("price_pilgrim", "is", null);
  if (error) return { error: mensajeError(error) };

  let updated = 0;
  for (const row of data || []) {
    const p = Number(row.price_pilgrim);
    if (!p) continue;
    const cs = Math.round(p / 0.85);
    const { error: upErr } = await supabase.from("bike_prices").update({ price_cs: cs }).eq("id", row.id);
    if (upErr) return { error: mensajeError(upErr) };
    updated++;
  }
  revalidatePath("/catalogo");
  revalidatePath("/seguimiento");
  return { ok: true, updated };
}

// =============================================================
// Alta de rutas + precios
// =============================================================

type CommercialClient = Awaited<ReturnType<typeof createCommercialClient>>;

function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "ruta"
  );
}

async function uniqueRouteSlug(supabase: CommercialClient, base: string): Promise<string> {
  const { data } = await supabase.from("routes").select("slug").like("slug", `${base}%`);
  const taken = new Set(((data as { slug: string }[]) || []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export type NewRoutePrice = { modality: string; price_pilgrim: number | null; price_cs: number | null };

export type NewRouteInput = {
  name: string;
  family: string | null;
  origin: string | null;
  destination: string | null;
  days: number | null;
  nights: number | null;
  km: number | null;
  modality: string; // senderismo | bici | mixto
  difficulty: string | null;
  description: string | null;
  web?: boolean; // visible en el cotizador de caminosacro.com (default false)
  prices: NewRoutePrice[];
  year: number; // año de vigencia de las tarifas que trae `prices`
};

export async function createRoute(input: NewRouteInput) {
  const supabase = await createCommercialClient();
  const name = (input.name || "").trim();
  if (!name) return { error: "El nombre de la ruta es obligatorio." };

  const slug = await uniqueRouteSlug(supabase, slugify(name));

  const { data: route, error: insErr } = await supabase
    .from("routes")
    .insert({
      slug,
      name,
      family: input.family?.trim() || null,
      origin: input.origin?.trim() || null,
      destination: input.destination?.trim() || null,
      days: input.days ?? null,
      nights: input.nights ?? null,
      km: input.km ?? null,
      modality: input.modality || "senderismo",
      difficulty: input.difficulty?.trim() || null,
      description: input.description?.trim() || null,
      web: input.web ?? false,
      active: true,
    })
    .select("id")
    .single();
  if (insErr) return { error: mensajeError(insErr) };

  // Una fila de precio por modalidad con al menos un precio cargado.
  const priceRows = (input.prices || [])
    .filter((p) => p.price_pilgrim != null || p.price_cs != null)
    .map((p) => ({
      route_id: route.id,
      modality: p.modality,
      season: "regular",
      year: input.year,
      price_pilgrim: p.price_pilgrim,
      price_cs: p.price_cs,
    }));
  if (priceRows.length > 0) {
    const { error: prErr } = await supabase.from("pricing").insert(priceRows);
    if (prErr) return { error: mensajeError(prErr) };
  }

  revalidatePath("/catalogo");
  revalidatePath("/cotizaciones/nueva");
  revalidatePath("/seguimiento");
  return { ok: true, routeId: route.id };
}

export type NewStageInput = {
  from_place: string | null;
  to_place: string | null;
  km: number | null;
  accommodation: string | null;
};

// Crea/reemplaza el itinerario completo de una ruta (patrón delete + insert en lote).
export async function createItinerary(routeId: string, stages: NewStageInput[]) {
  const supabase = await createCommercialClient();
  if (!routeId) return { error: "Elegí una ruta." };

  const { error: delErr } = await supabase.from("route_stages").delete().eq("route_id", routeId);
  if (delErr) return { error: mensajeError(delErr) };

  const rows = (stages || []).map((s, i) => ({
    route_id: routeId,
    day: i + 1,
    from_place: s.from_place?.trim() || null,
    to_place: s.to_place?.trim() || null,
    km: s.km ?? null,
    accommodation: s.accommodation?.trim() || null,
  }));
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("route_stages").insert(rows);
    if (insErr) return { error: mensajeError(insErr) };
  }

  // Contador de etapas caminadas (km > 0) para el aviso de coherencia.
  const walking = rows.filter((r) => (Number(r.km) || 0) > 0).length;
  await supabase.from("routes").update({ stages: walking || null }).eq("id", routeId);

  revalidatePath("/catalogo");
  revalidatePath("/seguimiento");
  return { ok: true };
}

export type RouteForEdit = {
  id: string;
  name: string;
  family: string | null;
  origin: string | null;
  destination: string | null;
  days: number | null;
  nights: number | null;
  km: number | null;
  modality: string;
  difficulty: string | null;
  description: string | null;
  web: boolean;
  prices: NewRoutePrice[];
};

export async function getRouteForEdit(routeId: string, year: number): Promise<{ route: RouteForEdit } | { error: string }> {
  const supabase = await createCommercialClient();
  const { data: r, error } = await supabase
    .from("routes")
    .select("id,name,family,origin,destination,days,nights,km,modality,difficulty,description,web")
    .eq("id", routeId)
    .maybeSingle();
  if (error) return { error: mensajeError(error) };
  if (!r) return { error: "Ruta no encontrada" };
  const { data: prices } = await supabase
    .from("pricing")
    .select("modality,price_pilgrim,price_cs")
    .eq("route_id", routeId)
    .eq("season", "regular")
    .eq("year", year);
  const priceRows: NewRoutePrice[] = ((prices as { modality: string; price_pilgrim: string | number | null; price_cs: string | number | null }[]) || []).map((p) => ({
    modality: p.modality,
    price_pilgrim: p.price_pilgrim == null ? null : Number(p.price_pilgrim),
    price_cs: p.price_cs == null ? null : Number(p.price_cs),
  }));
  return {
    route: {
      id: r.id,
      name: r.name,
      family: r.family,
      origin: r.origin,
      destination: r.destination,
      days: r.days,
      nights: r.nights,
      km: r.km == null ? null : Number(r.km),
      modality: r.modality || "senderismo",
      difficulty: r.difficulty,
      description: r.description,
      web: !!r.web,
      prices: priceRows,
    },
  };
}

export async function updateRoute(routeId: string, input: NewRouteInput) {
  const supabase = await createCommercialClient();
  const name = (input.name || "").trim();
  if (!name) return { error: "El nombre de la ruta es obligatorio." };

  const { error: upErr } = await supabase
    .from("routes")
    .update({
      name,
      family: input.family?.trim() || null,
      origin: input.origin?.trim() || null,
      destination: input.destination?.trim() || null,
      days: input.days ?? null,
      nights: input.nights ?? null,
      km: input.km ?? null,
      modality: input.modality || "senderismo",
      difficulty: input.difficulty?.trim() || null,
      description: input.description?.trim() || null,
      web: input.web ?? false,
    })
    .eq("id", routeId);
  if (upErr) return { error: mensajeError(upErr) };

  // Sincroniza precios DEL AÑO ACTIVO: fila existente → update; con valores y sin fila →
  // insert; vaciada → delete. Los otros años quedan intactos.
  const { data: existing, error: selErr } = await supabase
    .from("pricing")
    .select("id,modality")
    .eq("route_id", routeId)
    .eq("season", "regular")
    .eq("year", input.year);
  if (selErr) return { error: mensajeError(selErr) };
  const byMod = new Map(((existing as { id: string; modality: string }[]) || []).map((e) => [e.modality, e.id]));

  for (const p of input.prices || []) {
    const has = p.price_pilgrim != null || p.price_cs != null;
    const id = byMod.get(p.modality);
    if (has && id) {
      const { error } = await supabase.from("pricing").update({ price_pilgrim: p.price_pilgrim, price_cs: p.price_cs }).eq("id", id);
      if (error) return { error: mensajeError(error) };
    } else if (has && !id) {
      const { error } = await supabase.from("pricing").insert({ route_id: routeId, modality: p.modality, season: "regular", year: input.year, price_pilgrim: p.price_pilgrim, price_cs: p.price_cs });
      if (error) return { error: mensajeError(error) };
    } else if (!has && id) {
      const { error } = await supabase.from("pricing").delete().eq("id", id);
      if (error) return { error: mensajeError(error) };
    }
  }

  revalidatePath("/catalogo");
  revalidatePath("/cotizaciones/nueva");
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function deleteRoute(routeId: string) {
  const supabase = await createCommercialClient();
  if (!routeId) return { error: "Ruta no especificada." };
  // FK on delete cascade borra pricing y route_stages de la ruta.
  const { error } = await supabase.from("routes").delete().eq("id", routeId);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/catalogo");
  revalidatePath("/cotizaciones/nueva");
  revalidatePath("/seguimiento");
  return { ok: true };
}

// =============================================================
// Etapas de ruta (route_stages)
// =============================================================

export type RouteStageField = "from_place" | "to_place" | "km" | "accommodation" | "notes";

export async function updateRouteStageField(
  stageId: string,
  field: RouteStageField,
  value: string | number | null,
) {
  const supabase = await createCommercialClient();
  const v = field === "km" ? (value === "" || value == null ? null : Number(value)) : (value === "" ? null : value);
  const { error } = await supabase.from("route_stages").update({ [field]: v }).eq("id", stageId);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/catalogo");
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function addRouteStage(routeId: string) {
  const supabase = await createCommercialClient();
  const { data: existing, error: selErr } = await supabase
    .from("route_stages")
    .select("day")
    .eq("route_id", routeId)
    .order("day", { ascending: false })
    .limit(1);
  if (selErr) return { error: mensajeError(selErr) };
  const nextDay = (existing?.[0]?.day ?? 0) + 1;
  const { data, error } = await supabase
    .from("route_stages")
    .insert({ route_id: routeId, day: nextDay, from_place: null, to_place: null, km: null, accommodation: null })
    .select("id,day")
    .single();
  if (error) return { error: mensajeError(error) };
  revalidatePath("/catalogo");
  return { ok: true, stage: data };
}

export async function deleteRouteStage(stageId: string) {
  const supabase = await createCommercialClient();
  // Lee el day y route_id antes de borrar para renumerar los siguientes
  const { data: row, error: selErr } = await supabase
    .from("route_stages")
    .select("route_id,day")
    .eq("id", stageId)
    .maybeSingle();
  if (selErr) return { error: mensajeError(selErr) };
  if (!row) return { error: "Etapa no encontrada" };

  const { error: delErr } = await supabase.from("route_stages").delete().eq("id", stageId);
  if (delErr) return { error: mensajeError(delErr) };

  // Renumerar etapas posteriores: day -= 1.
  // Por la unique (route_id, day), hacemos un dance via days negativos.
  const { data: posteriores, error: postErr } = await supabase
    .from("route_stages")
    .select("id,day")
    .eq("route_id", row.route_id)
    .gt("day", row.day)
    .order("day", { ascending: true });
  if (postErr) return { error: mensajeError(postErr) };

  for (const p of posteriores || []) {
    await supabase.from("route_stages").update({ day: -p.day }).eq("id", p.id);
  }
  for (const p of posteriores || []) {
    await supabase.from("route_stages").update({ day: p.day - 1 }).eq("id", p.id);
  }

  revalidatePath("/catalogo");
  return { ok: true };
}

export async function swapRouteStages(stageIdA: string, stageIdB: string) {
  const supabase = await createCommercialClient();
  const { data: rows, error } = await supabase
    .from("route_stages")
    .select("id,route_id,day")
    .in("id", [stageIdA, stageIdB]);
  if (error) return { error: mensajeError(error) };
  if (!rows || rows.length !== 2) return { error: "Etapas no encontradas" };
  if (rows[0].route_id !== rows[1].route_id) return { error: "Etapas de rutas distintas" };

  const a = rows.find((r) => r.id === stageIdA)!;
  const b = rows.find((r) => r.id === stageIdB)!;

  // Dance: A → -1 (temporal), B → A.day, A → B.day. Evita choque con unique (route_id, day).
  const e1 = await supabase.from("route_stages").update({ day: -1 }).eq("id", a.id);
  if (e1.error) return { error: mensajeError(e1.error) };
  const e2 = await supabase.from("route_stages").update({ day: a.day }).eq("id", b.id);
  if (e2.error) return { error: mensajeError(e2.error) };
  const e3 = await supabase.from("route_stages").update({ day: b.day }).eq("id", a.id);
  if (e3.error) return { error: mensajeError(e3.error) };

  revalidatePath("/catalogo");
  return { ok: true };
}
