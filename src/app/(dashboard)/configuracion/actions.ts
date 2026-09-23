"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { renderAndStoreAsistencia } from "@/lib/travelDocs/render";
import { PLANTILLAS, type MensajesGuardados } from "@/lib/mensajes/plantillas";
import { MENSAJES_KEY } from "@/lib/mensajes/settings";
import { CARTA_BIENVENIDA_KEY } from "@/lib/bienvenida/render";
import { mezclarTextosCarta } from "@/lib/bienvenida/textos";

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

/**
 * Los textos de los mensajes (WhatsApp al peregrino, correos a Pilgrim).
 *
 * Se guarda SOLO lo que difiere del texto de fábrica —el formulario ya lo depura— y acá
 * se vuelve a comprobar, porque de esta clave depende lo que lee un cliente y lo que lee
 * un proveedor: se aceptan únicamente las piezas que existen en `PLANTILLAS`, y nada más.
 * Una clave desconocida en este jsonb no rompería nada hoy, pero mañana es un texto
 * fantasma que nadie sabe de dónde salió.
 */
export async function saveMensajes(valores: MensajesGuardados): Promise<{ ok?: true; error?: string }> {
  const limpio: MensajesGuardados = {};
  for (const plantilla of PLANTILLAS) {
    const propios = valores[plantilla.id];
    if (!propios) continue;
    for (const pieza of plantilla.piezas) {
      const texto = String(propios[pieza.id] ?? "");
      if (!texto.trim() || texto.trim() === pieza.valor.trim()) continue;
      if (texto.length > 4000) return { error: `«${pieza.etiqueta}» es demasiado largo.` };
      limpio[plantilla.id] = { ...(limpio[plantilla.id] ?? {}), [pieza.id]: texto };
    }
  }

  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key: MENSAJES_KEY, value: limpio }, { onConflict: "key" });
  if (error) return { error: mensajeError(error) };
  // Los borradores se arman en el servidor al pintar cada pantalla: sin esto, el texto
  // nuevo no aparecería hasta que a alguien se le ocurriera recargar con fuerza.
  revalidatePath("/configuracion");
  revalidatePath("/seguimiento");
  return { ok: true };
}

/** Una plantilla de correo al cliente (`comercial.email_templates`). */
export async function savePlantillaCorreo(fila: {
  slug: string;
  subject: string;
  body_md: string;
  active: boolean;
}): Promise<{ ok?: true; error?: string }> {
  const subject = fila.subject.trim();
  const body = fila.body_md.trim();
  if (!subject) return { error: "El asunto no puede quedar vacío." };
  if (!body) return { error: "El cuerpo no puede quedar vacío." };

  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("email_templates")
    .update({ subject, body_md: body, active: fila.active, updated_at: new Date().toISOString() })
    .eq("slug", fila.slug);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/configuracion");
  revalidatePath("/seguimiento");
  return { ok: true };
}

/**
 * Los textos de la carta de bienvenida. Se guardan ya "mezclados" con los de fábrica
 * (ver mezclarTextosCarta): un campo que Nico deje vacío vuelve al texto de siempre en vez
 * de salir en blanco en la carta de un cliente.
 */
export async function saveTextosCarta(value: unknown): Promise<{ ok?: true; error?: string }> {
  const limpio = mezclarTextosCarta(value);
  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key: CARTA_BIENVENIDA_KEY, value: limpio }, { onConflict: "key" });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/configuracion");
  // La tarjeta del seguimiento muestra el párrafo sugerido: sin esto seguiría el viejo.
  revalidatePath("/seguimiento");
  return { ok: true };
}
