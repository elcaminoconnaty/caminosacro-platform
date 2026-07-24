"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";

// Firma del organizador (Nico), guardada una sola vez en comercial.settings y
// reutilizada en todos los contratos firmados. Se captura desde el celular.

const MAX_CHARS = 400_000; // data URL PNG del canvas

export async function saveOrgSignature(dataUrl: string): Promise<{ ok?: true; error?: string }> {
  if (!dataUrl.startsWith("data:image/png;base64,") || dataUrl.length > MAX_CHARS) {
    return { error: "La firma no es válida. Vuelve a dibujarla." };
  }
  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("settings")
    .upsert(
      { key: "org_signature", value: { data_url: dataUrl, updated_at: new Date().toISOString() } },
      { onConflict: "key" },
    );
  if (error) return { error: mensajeError(error) };
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function clearOrgSignature(): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("settings").delete().eq("key", "org_signature");
  if (error) return { error: mensajeError(error) };
  revalidatePath("/configuracion");
  return { ok: true };
}
