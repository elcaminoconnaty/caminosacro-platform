"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { rutaFotoHotel, sinBucket } from "@/lib/storage/paths";

/**
 * Catálogo de hoteles: la ficha de cada alojamiento del Camino.
 *
 * Es la fuente de verdad del nombre, la dirección, los contactos, la categoría, las
 * observaciones fijas y las fotos. La documentación de viaje de cada cotización solo
 * apunta acá; nada de eso se vuelve a teclear por viaje.
 */

const BUCKET = "comercial-hotel-fotos";
const MAX_FOTOS = 3;
// Tres fotos por hotel a 5 MB caben de sobra en el límite de una Server Action, y una
// foto de más de 5 MB en un PDF A4 no se ve mejor: solo lo engorda.
const MAX_BYTES = 5 * 1024 * 1024;

/** "Pensión A Fonte" → "pension-a-fonte". Es la carpeta de sus fotos en Storage. */
function slugify(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function texto(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? "").trim();
  return v.length > 0 ? v : null;
}

export async function guardarHotel(id: string | null, formData: FormData) {
  const supabase = await createCommercialClient();
  const name = texto(formData, "name");
  if (!name) return { error: "El hotel necesita un nombre." };

  const campos = {
    name,
    city: texto(formData, "city"),
    address: texto(formData, "address"),
    phone: texto(formData, "phone"),
    email: texto(formData, "email"),
    website: texto(formData, "website"),
    category: texto(formData, "category"),
    notes: texto(formData, "notes"),
    active: formData.get("active") !== null,
  };

  if (id) {
    const { error } = await supabase.from("hotels").update(campos).eq("id", id);
    if (error) return { error: mensajeError(error) };
    revalidatePath("/hoteles");
    return { ok: true, id };
  }

  // El slug se calcula una sola vez, al crear: es la carpeta de las fotos en Storage y
  // renombrarlo después dejaría las fotos huérfanas en la carpeta vieja.
  const base = slugify(name) || "hotel";
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data: choca } = await supabase.from("hotels").select("id").eq("slug", slug).maybeSingle();
    if (!choca) break;
    slug = `${base}-${i}`;
  }

  const { data, error } = await supabase
    .from("hotels")
    .insert({ ...campos, slug })
    .select("id")
    .maybeSingle();
  if (error) return { error: mensajeError(error) };
  revalidatePath("/hoteles");
  return { ok: true, id: data?.id as string };
}

/**
 * Borra la ficha. Las noches que la usaban quedan con hotel_id en null (la FK es
 * `on delete set null`), así que la documentación ya generada no se rompe: lo que se
 * pierde es el vínculo, y esa noche vuelve a quedar sin hotel asignado.
 */
export async function eliminarHotel(id: string) {
  const supabase = await createCommercialClient();

  const { data: h } = await supabase.from("hotels").select("photos").eq("id", id).maybeSingle();
  const fotos = ((h?.photos as { path: string }[] | null) || []).map((f) => f.path);

  const { error } = await supabase.from("hotels").delete().eq("id", id);
  if (error) return { error: mensajeError(error) };

  // Las fotos se borran después de la ficha: si fallara el borrado del archivo, queda
  // basura en Storage, que es mucho menos grave que una ficha apuntando a nada.
  if (fotos.length > 0) {
    await supabase.storage.from(BUCKET).remove(fotos.map(sinBucket));
  }
  revalidatePath("/hoteles");
  return { ok: true };
}

export async function subirFotoHotel(id: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Sin archivo." };
  if (!file.type.startsWith("image/")) return { error: "Solo imágenes (JPG o PNG)." };
  if (file.size > MAX_BYTES) return { error: "La foto pesa más de 5 MB." };

  const { data: h } = await supabase.from("hotels").select("slug,photos").eq("id", id).maybeSingle();
  if (!h) return { error: "Hotel no encontrado." };
  const fotos = (h.photos as { path: string; position?: number }[] | null) || [];
  if (fotos.length >= MAX_FOTOS) return { error: `El documento dibuja ${MAX_FOTOS} fotos por noche; borra una antes de subir otra.` };

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const destino = rutaFotoHotel(h.slug as string, fotos.length, ext);
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(sinBucket(destino), buf, { contentType: file.type, upsert: true });
  if (upErr) return { error: mensajeError(upErr) };

  const nuevas = [...fotos, { path: destino, position: fotos.length }];
  const { error } = await supabase.from("hotels").update({ photos: nuevas }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/hoteles");
  return { ok: true };
}

export async function eliminarFotoHotel(id: string, storagePath: string) {
  const supabase = await createCommercialClient();
  const { data: h } = await supabase.from("hotels").select("photos").eq("id", id).maybeSingle();
  if (!h) return { error: "Hotel no encontrado." };

  const quedan = ((h.photos as { path: string; position?: number }[] | null) || [])
    .filter((f) => f.path !== storagePath)
    .map((f, i) => ({ path: f.path, position: i }));

  const { error } = await supabase.from("hotels").update({ photos: quedan }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  await supabase.storage.from(BUCKET).remove([sinBucket(storagePath)]);
  revalidatePath("/hoteles");
  return { ok: true };
}

/** Mueve una foto una posición. El orden es el que sale en el documento. */
export async function moverFotoHotel(id: string, storagePath: string, delta: -1 | 1) {
  const supabase = await createCommercialClient();
  const { data: h } = await supabase.from("hotels").select("photos").eq("id", id).maybeSingle();
  if (!h) return { error: "Hotel no encontrado." };

  const fotos = ((h.photos as { path: string; position?: number }[] | null) || []).slice();
  const i = fotos.findIndex((f) => f.path === storagePath);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= fotos.length) return { ok: true };
  [fotos[i], fotos[j]] = [fotos[j], fotos[i]];

  const { error } = await supabase
    .from("hotels")
    .update({ photos: fotos.map((f, k) => ({ path: f.path, position: k })) })
    .eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/hoteles");
  return { ok: true };
}

/** URL firmada para mostrar una foto. Corta: la página se vuelve a pedir al servidor. */
export async function urlFotoHotel(storagePath: string) {
  const supabase = await createCommercialClient();
  const [bucket, ...rest] = storagePath.split("/");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(rest.join("/"), 60 * 30);
  if (error || !data?.signedUrl) return { error: mensajeError(error) };
  return { url: data.signedUrl };
}
