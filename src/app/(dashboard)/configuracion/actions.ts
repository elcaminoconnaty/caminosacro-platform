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

/**
 * Datos del proveedor Pilgrim. Van en `settings` y no en una variable de entorno
 * para poder cambiarlos desde el CRM sin redesplegar.
 */
export async function savePilgrimSettings(datos: {
  email: string;
  nombre: string;
  contacto: string;
}): Promise<{ ok?: true; error?: string }> {
  const email = datos.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Ese correo no es válido." };
  }
  const supabase = await createCommercialClient();
  const { error } = await supabase.from("settings").upsert(
    {
      key: "pilgrim",
      value: {
        email,
        nombre: datos.nombre.trim() || "Pilgrim",
        contacto: datos.contacto.trim(),
        updated_at: new Date().toISOString(),
      },
    },
    { onConflict: "key" },
  );
  if (error) return { error: mensajeError(error) };
  revalidatePath("/configuracion");
  return { ok: true };
}
