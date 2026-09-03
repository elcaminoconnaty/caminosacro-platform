"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { rutaEtiquetaEquipaje, rutaSeguroViaje, sinBucket } from "@/lib/storage/paths";
import {
  ensureTravelDoc,
  newTravelDocToken,
  renderAndStoreTravelDoc,
  serviciosSugeridos,
} from "@/lib/travelDocs/render";
import { enviarCorreoDocumentacionViaje } from "@/lib/travelDocs/email";
import { hotelParaLugar } from "@/lib/travelDocs/lugares";

/**
 * Acciones del expediente de documentación de viaje de una cotización.
 *
 * OJO: en un archivo "use server" solo pueden exportarse FUNCIONES. Un `export type`
 * reexportado tumba el chunk entero de actions en producción, y el error que se ve en
 * pantalla no dice nada del tipo. Los tipos de la tarjeta viven en el componente.
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024;

/**
 * Propone las noches del viaje a partir del itinerario del catálogo.
 *
 * No guarda: devuelve filas para que se revisen y se elija el hotel de cada una. Trae
 * día, etapa y kilómetros de route_stages, y propone un hotel del catálogo cuando la
 * localidad de la etapa coincide con la ciudad de una ficha.
 */
export async function prefillTravelNights(quoteId: string) {
  const supabase = await createCommercialClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("route_name,start_date,people,modality")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote?.route_name) return { error: "La cotización no tiene ruta asignada." };

  const { data: r } = await supabase.from("routes").select("id").eq("name", quote.route_name).maybeSingle();
  if (!r) return { error: "No encontré la ruta en el catálogo." };

  const { data: st } = await supabase
    .from("route_stages")
    .select("day,from_place,to_place,km,accommodation")
    .eq("route_id", r.id)
    .order("day");

  type Etapa = { day: number; from_place: string | null; to_place: string | null; km: number | string | null; accommodation: string | null };
  // Una noche por etapa CON alojamiento: las etapas de "fin de servicios" no lo traen.
  const etapas = ((st || []) as Etapa[]).filter((s) => s.accommodation);
  if (etapas.length === 0) return { error: "La ruta no tiene etapas con alojamiento cargadas en el catálogo." };

  // .order("name"): con dos fichas en la misma localidad el desempate lo hace hotelParaLugar
  // con el primero del array, y sin orden explícito ese primero lo decide Postgres — un UPDATE
  // en una ficha podía cambiar qué pensión se propone sin tocar una línea de código.
  const { data: hotelesRaw } = await supabase
    .from("hotels")
    .select("id,name,city")
    .eq("active", true)
    .order("name");
  const hoteles = (hotelesRaw || []) as { id: string; name: string; city: string | null }[];

  const rows = etapas.map((s, i) => {
    const ciudad = (s.accommodation || "").trim();
    // Con dos hoteles en la misma localidad gana el primero por orden alfabético: no hay
    // forma de adivinar cuál, pero al menos el desempate es estable y explicable, y esto es
    // una propuesta que se revisa fila por fila antes de generar.
    const sugerido = hotelParaLugar(ciudad, hoteles);
    return {
      day: s.day,
      night_date: quote.start_date ? sumarDias(quote.start_date, i) : null,
      stage_label:
        s.from_place && s.to_place && s.from_place !== s.to_place
          ? `${s.from_place} - ${s.to_place}`
          : (s.to_place || ciudad),
      km: s.km != null ? Number(s.km) : null,
      city: ciudad,
      hotel_id: sugerido?.id ?? null,
      hotel_name_sugerido: sugerido?.name ?? null,
      room_label: etiquetaHabitacion(Number(quote.people) || 1, quote.modality),
      regimen: "AD",
      notes: "",
    };
  });

  return { rows };
}

function sumarDias(isoDate: string, dias: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "1 Habitación individual" / "2 Habitaciones dobles", a partir de la modalidad vendida. */
function etiquetaHabitacion(personas: number, modality: string | null): string {
  const m = (modality || "").toLowerCase();
  if (m.includes("individual") || m.includes("single") || personas === 1) {
    return personas === 1 ? "1 Habitación individual" : `${personas} Habitaciones individuales`;
  }
  const dobles = Math.ceil(personas / 2);
  return dobles === 1 ? "1 Habitación doble" : `${dobles} Habitaciones dobles`;
}

/** Reemplaza por completo las noches del viaje. */
export async function saveTravelNights(
  quoteId: string,
  rows: {
    day: number | null;
    night_date: string | null;
    stage_label: string | null;
    km: number | null;
    city: string | null;
    hotel_id: string | null;
    room_label: string | null;
    regimen: string | null;
    notes: string | null;
  }[],
) {
  const supabase = await createCommercialClient();
  const { error: delErr } = await supabase.from("quote_hotels").delete().eq("quote_id", quoteId);
  if (delErr) return { error: mensajeError(delErr) };

  const limpias = rows.filter((r) => r.hotel_id || r.city || r.stage_label || r.night_date);
  if (limpias.length > 0) {
    const payload = limpias.map((r, i) => ({
      quote_id: quoteId,
      position: i,
      day: r.day,
      night_date: r.night_date || null,
      stage_label: r.stage_label || null,
      km: r.km,
      city: r.city || null,
      hotel_id: r.hotel_id || null,
      room_label: r.room_label || null,
      regimen: r.regimen || null,
      notes: r.notes || null,
    }));
    const { error: insErr } = await supabase.from("quote_hotels").insert(payload);
    if (insErr) return { error: mensajeError(insErr) };
  }
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Genera (o regenera) el Documento de Viaje con los servicios marcados. */
export async function generateTravelDoc(quoteId: string, services: string[]) {
  const supabase = await createCommercialClient();
  const r = await renderAndStoreTravelDoc(supabase, quoteId, services);
  if (r.error) return { error: r.error };
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Guarda qué servicios lleva el viaje sin regenerar el PDF. */
export async function saveTravelServices(quoteId: string, services: string[]) {
  const supabase = await createCommercialClient();
  const exp = await ensureTravelDoc(supabase, quoteId);
  if (exp.error) return { error: exp.error };
  const { error } = await supabase.from("travel_docs").update({ services }).eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Servicios propuestos a partir de los opcionales contratados, para el botón de sugerir. */
export async function suggestTravelServices(quoteId: string) {
  const supabase = await createCommercialClient();
  const { data } = await supabase
    .from("quote_lines")
    .select("description")
    .eq("quote_id", quoteId)
    .eq("type", "optional");
  return { services: serviciosSugeridos(((data || []) as { description: string }[]).map((l) => l.description || "")) };
}

/**
 * Sube el seguro o la etiqueta de equipaje. No los generamos: los emite la aseguradora
 * y el transportista, y llegan como PDF ya hecho.
 */
export async function uploadTravelFile(quoteId: string, formData: FormData) {
  const supabase = await createCommercialClient();
  const tipo = String(formData.get("tipo") || "");
  if (tipo !== "seguro" && tipo !== "etiqueta") return { error: "Tipo de documento no válido." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Sin archivo." };
  if (file.type !== "application/pdf") return { error: "Solo PDFs." };
  if (file.size > MAX_PDF_BYTES) return { error: "El PDF pesa más de 20 MB." };

  const { data: quote } = await supabase.from("quotes").select("code").eq("id", quoteId).maybeSingle();
  if (!quote) return { error: "Cotización no encontrada." };

  const exp = await ensureTravelDoc(supabase, quoteId);
  if (exp.error) return { error: exp.error };

  const destino = tipo === "seguro" ? rutaSeguroViaje(quote.code) : rutaEtiquetaEquipaje(quote.code);
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from("comercial-docs")
    .upload(sinBucket(destino), buf, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (upErr) return { error: mensajeError(upErr) };

  const columna = tipo === "seguro" ? "insurance_pdf_path" : "luggage_tag_pdf_path";
  const { error } = await supabase.from("travel_docs").update({ [columna]: destino }).eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

export async function removeTravelFile(quoteId: string, tipo: "seguro" | "etiqueta") {
  const supabase = await createCommercialClient();
  const columna = tipo === "seguro" ? "insurance_pdf_path" : "luggage_tag_pdf_path";
  const { data: doc } = await supabase
    .from("travel_docs")
    .select("insurance_pdf_path,luggage_tag_pdf_path")
    .eq("quote_id", quoteId)
    .maybeSingle();
  const ruta = doc?.[columna] as string | null | undefined;

  const { error } = await supabase.from("travel_docs").update({ [columna]: null }).eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };
  if (ruta) {
    const [bucket, ...rest] = ruta.split("/");
    await supabase.storage.from(bucket).remove([rest.join("/")]);
  }
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Crea el expediente y su enlace si aún no existen; devuelve el token. */
export async function ensureTravelDocLink(quoteId: string) {
  const supabase = await createCommercialClient();
  const exp = await ensureTravelDoc(supabase, quoteId);
  if (exp.error) return { error: exp.error };
  revalidatePath(`/seguimiento/${quoteId}`);
  return { token: exp.doc?.token as string };
}

/**
 * Anula el enlace público. El expediente y los archivos se quedan; lo que deja de
 * funcionar es la URL que ya tiene el cliente.
 */
export async function revokeTravelDocLink(quoteId: string) {
  const supabase = await createCommercialClient();
  const { error } = await supabase
    .from("travel_docs")
    .update({ revoked_at: new Date().toISOString() })
    .eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Reactiva el enlace con un token nuevo: el anterior queda muerto para siempre. */
export async function rotateTravelDocToken(quoteId: string) {
  const supabase = await createCommercialClient();
  const exp = await ensureTravelDoc(supabase, quoteId);
  if (exp.error) return { error: exp.error };
  const token = newTravelDocToken();
  const { error } = await supabase
    .from("travel_docs")
    .update({ token, revoked_at: null })
    .eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${quoteId}`);
  return { token };
}

/**
 * Envía la documentación. `destinatarios` puede traer varias direcciones (el grupo entero,
 * un familiar); vacío = el correo del titular de la cotización.
 */
export async function enviarCorreoDocumentacion(
  quoteId: string,
  mensaje: { subject: string; intro: string; destinatarios?: string[]; pruebaEmail?: string },
) {
  const supabase = await createCommercialClient();
  const r = await enviarCorreoDocumentacionViaje(supabase, quoteId, mensaje);
  // En modo prueba no se marca el expediente como enviado, así que no hay nada que refrescar.
  if (r.ok && !mensaje.pruebaEmail?.trim()) revalidatePath(`/seguimiento/${quoteId}`);
  return r;
}
