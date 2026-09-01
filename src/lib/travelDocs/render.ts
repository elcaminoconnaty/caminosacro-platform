import "server-only";

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ComercialClient } from "@/lib/quotes/pdf";
import { mensajeError } from "@/lib/errors";
import { rutaAsistencia, rutaDocViaje, sinBucket } from "@/lib/storage/paths";
import { getAsistenciaTexts, getTravelDocTexts } from "@/lib/travelDocs/texts";
import type { TravelNight } from "@/lib/travelDocPdf";

/**
 * Genera y guarda los PDF de la documentación de viaje.
 *
 * Está fuera de las server actions a propósito, igual que lib/quotes/pdf.ts: lo llaman
 * la tarjeta del expediente y el envío del correo (que regenera si hace falta). Un solo
 * lugar decide qué sale en el documento.
 */

/** Enlace público permanente. 32 bytes, igual que el de firma del contrato. */
export function newTravelDocToken(): string {
  return randomBytes(32).toString("hex");
}

/** Las claves de servicio que conoce el documento, en el orden en que se imprimen. */
export const SERVICIOS_CONOCIDOS = ["asistencia_telefonica", "credencial", "seguro", "mochilas"] as const;

/**
 * Propone qué bloques de "Servicios incluidos" lleva el viaje a partir de sus opcionales.
 *
 * Solo PROPONE: lo elegido se guarda en travel_docs.services y manda sobre esto. Derivarlo
 * en cada render significaría que un opcional escrito distinto ("traslado de mochila" en vez
 * de "transporte de mochilas") borra del documento todo el procedimiento del equipaje sin
 * que nadie se dé cuenta hasta que el viajero deja la maleta en recepción sin etiqueta.
 */
export function serviciosSugeridos(descripciones: string[]): string[] {
  const texto = descripciones.join(" | ").toLowerCase();
  const claves: string[] = ["asistencia_telefonica", "credencial"];
  if (/seguro/.test(texto)) claves.push("seguro");
  if (/mochila|equipaje|maleta/.test(texto)) claves.push("mochilas");
  return SERVICIOS_CONOCIDOS.filter((c) => claves.includes(c));
}

type QuoteHotelRow = {
  position: number;
  day: number | null;
  night_date: string | null;
  stage_label: string | null;
  km: number | string | null;
  city: string | null;
  hotel_name: string | null;
  address: string | null;
  contact: string | null;
  notes: string | null;
  room_label: string | null;
  regimen: string | null;
  hotel_id: string | null;
};

type HotelRow = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  notes: string | null;
  photos: { path: string; position?: number }[] | null;
};

const CATEGORIA_ES: Record<string, string> = {
  pension: "Pensión",
  hotel: "Hotel",
  hostal: "Hostal",
  albergue: "Albergue",
  casa_rural: "Casa rural",
};

/**
 * Baja una foto de Storage a Buffer. react-pdf necesita los bytes: una URL firmada
 * caducaría a mitad del render y, peor, dejaría el hueco en silencio.
 *
 * Una foto que no se puede leer NO tumba el documento: se omite. Es preferible una ficha
 * con dos fotos que ninguna documentación.
 */
async function bajarFoto(supabase: ComercialClient, storagePath: string): Promise<Buffer | null> {
  try {
    const [bucket, ...rest] = storagePath.split("/");
    const { data, error } = await supabase.storage.from(bucket).download(rest.join("/"));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Funde cada noche de la cotización con la ficha de su hotel.
 *
 * La regla: si la noche apunta al catálogo (hotel_id), el nombre, la dirección, los
 * contactos, la categoría y las fotos salen de ahí y nada más. Las columnas de texto libre
 * de quote_hotels solo se usan cuando no hay hotel_id, que es el caso de las cotizaciones
 * anteriores a la migración 0030.
 */
export async function construirNoches(
  supabase: ComercialClient,
  quoteId: string,
): Promise<TravelNight[]> {
  const { data: filas } = await supabase
    .from("quote_hotels")
    .select("position,day,night_date,stage_label,km,city,hotel_name,address,contact,notes,room_label,regimen,hotel_id")
    .eq("quote_id", quoteId)
    .order("position");

  const noches = (filas || []) as QuoteHotelRow[];
  if (noches.length === 0) return [];

  const ids = [...new Set(noches.map((n) => n.hotel_id).filter((x): x is string => !!x))];
  const hoteles = new Map<string, HotelRow>();
  if (ids.length > 0) {
    const { data: hs } = await supabase
      .from("hotels")
      .select("id,name,city,address,phone,email,category,notes,photos")
      .in("id", ids);
    for (const h of (hs || []) as HotelRow[]) hoteles.set(h.id, h);
  }

  // Las fotos se bajan UNA vez por hotel aunque el hotel se repita en varias noches (el
  // Hostal Suso sale dos veces en un Sarria-Santiago típico). Sin esta caché, un viaje de
  // 7 noches con repetición bajaba el mismo JPG dos veces.
  const cache = new Map<string, Buffer[]>();
  async function fotosDe(h: HotelRow): Promise<Buffer[]> {
    const ya = cache.get(h.id);
    if (ya) return ya;
    const rutas = [...(h.photos || [])]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .slice(0, 3)
      .map((f) => f.path)
      .filter(Boolean);
    const bufs = (await Promise.all(rutas.map((r) => bajarFoto(supabase, r)))).filter(
      (b): b is Buffer => b !== null,
    );
    cache.set(h.id, bufs);
    return bufs;
  }

  const out: TravelNight[] = [];
  for (const n of noches) {
    const h = n.hotel_id ? hoteles.get(n.hotel_id) : undefined;
    out.push({
      day: n.day,
      night_date: n.night_date,
      stage_label: n.stage_label,
      km: n.km != null ? Number(n.km) : null,
      city: h?.city || n.city,
      hotel_name: h?.name || n.hotel_name,
      category: h?.category ? (CATEGORIA_ES[h.category] || h.category) : null,
      address: h?.address || n.address,
      // Sin catálogo solo existe la columna `contact`, que mezclaba teléfono y correo en
      // un mismo campo. Va al teléfono y el email queda vacío: es lo que había.
      phone: h?.phone || n.contact,
      email: h?.email || null,
      room_label: n.room_label,
      regimen: n.regimen,
      hotel_notes: h?.notes || null,
      night_notes: n.notes,
      photos: h ? await fotosDe(h) : [],
    });
  }
  return out;
}

/** Devuelve el expediente de la cotización, creándolo con su token si aún no existe. */
export async function ensureTravelDoc(supabase: ComercialClient, quoteId: string) {
  const { data: ya } = await supabase
    .from("travel_docs")
    .select("id,token,doc_pdf_path,insurance_pdf_path,luggage_tag_pdf_path,services,sent_at,revoked_at")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (ya) return { doc: ya };

  const { data: creado, error } = await supabase
    .from("travel_docs")
    .insert({ quote_id: quoteId, token: newTravelDocToken() })
    .select("id,token,doc_pdf_path,insurance_pdf_path,luggage_tag_pdf_path,services,sent_at,revoked_at")
    .maybeSingle();
  if (error) return { error: mensajeError(error) };
  return { doc: creado };
}

/**
 * Genera el Documento de Viaje y lo deja en Storage.
 *
 * `services` opcional: si no viene, se usa lo guardado en el expediente y, si el
 * expediente todavía no tiene nada, lo sugerido a partir de los opcionales.
 */
export async function renderAndStoreTravelDoc(
  supabase: ComercialClient,
  quoteId: string,
  services?: string[],
): Promise<{ ok?: true; path?: string; error?: string }> {
  const [{ data: quote }, { data: lineas }] = await Promise.all([
    supabase
      .from("quotes")
      .select("code,client_name,client_phone,client_email,route_name,start_date,end_date,people,modality")
      .eq("id", quoteId)
      .maybeSingle(),
    supabase.from("quote_lines").select("description").eq("quote_id", quoteId).eq("type", "optional"),
  ]);
  if (!quote) return { error: "Cotización no encontrada." };

  const exp = await ensureTravelDoc(supabase, quoteId);
  if (exp.error) return { error: exp.error };

  const guardados = Array.isArray(exp.doc?.services) ? (exp.doc!.services as string[]) : [];
  const elegidos =
    services && services.length > 0
      ? services
      : guardados.length > 0
        ? guardados
        : serviciosSugeridos(((lineas || []) as { description: string }[]).map((l) => l.description || ""));

  const [texts, nights] = await Promise.all([
    getTravelDocTexts(supabase),
    construirNoches(supabase, quoteId),
  ]);

  // Portada propia del documento de viaje, distinta de la de la cotización: aquí el
  // cliente ya compró, así que la foto es del Camino que va a caminar, no un gancho de
  // venta. Si faltara el archivo, la portada sale sobre el verde de la marca y ya.
  let coverImage: Buffer | undefined;
  try {
    coverImage = fs.readFileSync(path.join(process.cwd(), "src/lib/coverViaje.jpg"));
  } catch {
    coverImage = undefined;
  }

  // Carga diferida: @react-pdf pesa y solo hace falta al generar. Todo el render vive en
  // renderPdf.tsx para que el paquete y los componentes se resuelvan por el mismo camino.
  const { renderTravelDocBuffer } = await import("@/lib/travelDocs/renderPdf");

  let buffer: Buffer;
  try {
    buffer = await renderTravelDocBuffer({ quote, nights, texts, services: elegidos, coverImage });
  } catch (e) {
    console.error("[travelDoc] el render falló:", e);
    return { error: mensajeError(e as Error, "No se pudo generar el Documento de Viaje.") };
  }

  const destino = rutaDocViaje(quote.code, quote.client_name, quote.route_name);
  const { error: upErr } = await supabase.storage
    .from("comercial-docs")
    .upload(sinBucket(destino), buffer, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "no-cache",
    });
  if (upErr) return { error: mensajeError(upErr) };

  const { error: dbErr } = await supabase
    .from("travel_docs")
    .update({ doc_pdf_path: destino, doc_generated_at: new Date().toISOString(), services: elegidos })
    .eq("quote_id", quoteId);
  if (dbErr) return { error: mensajeError(dbErr) };

  return { ok: true, path: destino };
}

/**
 * Genera la Asistencia en Viaje genérica. No lleva datos de nadie: hay una sola y se
 * sobrescribe, así que todos los viajes —también los ya enviados— pasan a ver la versión
 * corregida en cuanto se regenera.
 */
export async function renderAndStoreAsistencia(
  supabase: ComercialClient,
): Promise<{ ok?: true; path?: string; error?: string }> {
  const texts = await getAsistenciaTexts(supabase);
  if (texts.secciones.length === 0) {
    return { error: "No hay contenido de asistencia configurado todavía." };
  }

  const { renderAsistenciaBuffer } = await import("@/lib/travelDocs/renderPdf");

  let buffer: Buffer;
  try {
    buffer = await renderAsistenciaBuffer(texts);
  } catch (e) {
    console.error("[asistencia] el render falló:", e);
    return { error: mensajeError(e as Error, "No se pudo generar la Asistencia en Viaje.") };
  }

  const destino = rutaAsistencia();
  const { error: upErr } = await supabase.storage
    .from("comercial-docs")
    .upload(sinBucket(destino), buffer, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "no-cache",
    });
  if (upErr) return { error: mensajeError(upErr) };
  return { ok: true, path: destino };
}
