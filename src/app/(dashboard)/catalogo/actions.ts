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

export async function applyMarkupRule() {
  // Regla: max(pilgrim+100, pilgrim/0.85). Aplica a todas las filas con price_pilgrim > 0.
  const supabase = await createCommercialClient();
  const { data, error } = await supabase
    .from("pricing")
    .select("id,price_pilgrim")
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
) {
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("optional_services").update({ [field]: value }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/catalogo");
  return { ok: true };
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
  prices: NewRoutePrice[];
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
