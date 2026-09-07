"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { renderAndStoreAsistencia } from "@/lib/travelDocs/render";

// Firmas de quienes firman por Camino Sacro (Nico y Nathalia), guardadas en
// `settings.firmantes` y reutilizadas en todos los contratos. Cada uno la captura una sola
// vez desde su celular. Migración 0037.
//
// `settings.org_signature` sigue existiendo por compatibilidad con lo anterior a la 0037;
// la lectura cae en ella si un firmante todavía no tiene la suya (ver getOrgSignature).

const MAX_CHARS = 400_000; // data URL PNG del canvas

/** Guarda la firma dibujada de UN firmante dentro de `settings.firmantes`. */
export async function saveFirmanteSignature(
  slug: string,
  dataUrl: string,
): Promise<{ ok?: true; error?: string }> {
  if (!dataUrl.startsWith("data:image/png;base64,") || dataUrl.length > MAX_CHARS) {
    return { error: "La firma no es válida. Vuelve a dibujarla." };
  }
  const supabase = await createCommercialClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "firmantes").maybeSingle();
  const lista = (data?.value as { slug: string; data_url?: string | null }[] | null) ?? [];
  if (!lista.some((f) => f.slug === slug)) return { error: "Ese firmante no existe." };

  const nueva = lista.map((f) => (f.slug === slug ? { ...f, data_url: dataUrl } : f));
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "firmantes", value: nueva }, { onConflict: "key" });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/configuracion");
  return { ok: true };
}

/** Borra la firma de un firmante. Sus contratos vuelven a salir con la firma mecánica. */
export async function clearFirmanteSignature(slug: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "firmantes").maybeSingle();
  const lista = (data?.value as { slug: string; data_url?: string | null }[] | null) ?? [];
  const nueva = lista.map((f) => (f.slug === slug ? { ...f, data_url: null } : f));
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "firmantes", value: nueva }, { onConflict: "key" });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/configuracion");
  return { ok: true };
}

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

/**
 * Textos del Documento de Viaje (servicios, condiciones y contacto).
 *
 * Viven en settings y no en el código porque cambian sin desplegar: un teléfono de
 * asistencia, un horario de la Oficina del Peregrino, un porcentaje de penalidad. Los
 * números de cancelación tienen que decir LO MISMO que la cláusula sexta del contrato
 * (src/lib/contracts/template.ts): si alguna vez se cambian allá, hay que cambiarlos acá.
 */
export async function saveTravelDocTexts(value: unknown) {
  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "travel_doc", value }, { onConflict: "key" });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/configuracion");
  revalidatePath("/seguimiento");
  return { ok: true };
}

/** Textos y teléfonos de la Asistencia en Viaje, que es una sola para todos los viajes. */
export async function saveAsistenciaTexts(value: unknown) {
  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "asistencia_viaje", value }, { onConflict: "key" });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/configuracion");
  return { ok: true };
}

/**
 * Regenera el PDF de la Asistencia en Viaje. Hay uno solo y se sobrescribe, así que en
 * cuanto termina, también los viajes ya enviados sirven la versión corregida: la página
 * pública del cliente lee siempre el archivo vigente, no una copia del momento del envío.
 */
export async function regenerarAsistencia() {
  const supabase = await createCommercialClient();
  const r = await renderAndStoreAsistencia(supabase);
  if (r.error) return { error: r.error };
  revalidatePath("/configuracion");
  revalidatePath("/seguimiento");
  return { ok: true };
}
