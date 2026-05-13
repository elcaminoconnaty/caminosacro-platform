"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";

export async function updatePricing(id: string, field: "price_pilgrim" | "price_cs", value: number | null) {
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("pricing").update({ [field]: value }).eq("id", id);
  if (error) return { error: error.message };
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
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };
  return { url: data.signedUrl };
}

export async function updateOptionalService(
  id: string,
  field: "price_pilgrim" | "price_cs" | "name",
  value: string | number | null,
) {
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("optional_services").update({ [field]: value }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/catalogo");
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
  if (error) return { error: error.message };
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
  if (selErr) return { error: selErr.message };
  const nextDay = (existing?.[0]?.day ?? 0) + 1;
  const { data, error } = await supabase
    .from("route_stages")
    .insert({ route_id: routeId, day: nextDay, from_place: null, to_place: null, km: null, accommodation: null })
    .select("id,day")
    .single();
  if (error) return { error: error.message };
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
  if (selErr) return { error: selErr.message };
  if (!row) return { error: "Etapa no encontrada" };

  const { error: delErr } = await supabase.from("route_stages").delete().eq("id", stageId);
  if (delErr) return { error: delErr.message };

  // Renumerar etapas posteriores: day -= 1.
  // Por la unique (route_id, day), hacemos un dance via days negativos.
  const { data: posteriores, error: postErr } = await supabase
    .from("route_stages")
    .select("id,day")
    .eq("route_id", row.route_id)
    .gt("day", row.day)
    .order("day", { ascending: true });
  if (postErr) return { error: postErr.message };

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
  if (error) return { error: error.message };
  if (!rows || rows.length !== 2) return { error: "Etapas no encontradas" };
  if (rows[0].route_id !== rows[1].route_id) return { error: "Etapas de rutas distintas" };

  const a = rows.find((r) => r.id === stageIdA)!;
  const b = rows.find((r) => r.id === stageIdB)!;

  // Dance: A → -1 (temporal), B → A.day, A → B.day. Evita choque con unique (route_id, day).
  const e1 = await supabase.from("route_stages").update({ day: -1 }).eq("id", a.id);
  if (e1.error) return { error: e1.error.message };
  const e2 = await supabase.from("route_stages").update({ day: a.day }).eq("id", b.id);
  if (e2.error) return { error: e2.error.message };
  const e3 = await supabase.from("route_stages").update({ day: b.day }).eq("id", a.id);
  if (e3.error) return { error: e3.error.message };

  revalidatePath("/catalogo");
  return { ok: true };
}
