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
