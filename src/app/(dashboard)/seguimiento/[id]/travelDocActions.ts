"use server";

import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { rutaEtiquetaEquipaje, rutaEtiquetaEquipajeOriginal, rutaSeguroViaje, sinBucket } from "@/lib/storage/paths";
import { type InformeEtiqueta, type MemoriaLogos, quitarLogoProveedor } from "@/lib/etiquetas/logoProveedor";
import type { ModoLogo } from "@/lib/etiquetas/marca";
import { leerMemoriaLogos, leerModoLogo, recordarLogos, recordarModoLogo } from "@/lib/etiquetas/memoria";
import {
  ensureTravelDoc,
  newTravelDocToken,
  renderAndStoreTravelDoc,
  serviciosSugeridos,
} from "@/lib/travelDocs/render";
import { enviarCorreoDocumentacionViaje } from "@/lib/travelDocs/email";
import { hotelParaLugar } from "@/lib/travelDocs/lugares";
import { etapasDeCondiciones } from "@/lib/quotes/itinerario";

/**
 * Acciones del expediente de documentación de viaje de una cotización.
 *
 * OJO: en un archivo "use server" solo pueden exportarse FUNCIONES. Un `export type`
 * reexportado tumba el chunk entero de actions en producción, y el error que se ve en
 * pantalla no dice nada del tipo. Los tipos de la tarjeta viven en el componente.
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024;

/**
 * Propone las noches del viaje a partir del itinerario.
 *
 * No guarda: devuelve filas para que se revisen y se elija el hotel de cada una. Trae
 * día, etapa y kilómetros, y propone un hotel del catálogo cuando la localidad de la etapa
 * coincide con la ciudad de una ficha.
 *
 * Manda el itinerario pactado con este cliente (`condiciones_json.etapas`) si lo tiene, y
 * solo si no, el del catálogo: si el grupo compró una etapa más, las noches que se reservan
 * son las suyas, no las de la ruta genérica. Es el mismo criterio del PDF.
 */
export async function prefillTravelNights(quoteId: string) {
  const supabase = await createCommercialClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("route_name,start_date,people,modality,condiciones_json")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote?.route_name) return { error: "La cotización no tiene ruta asignada." };

  type Etapa = { day: number; from_place: string | null; to_place: string | null; km: number | string | null; accommodation: string | null };

  let crudas: Etapa[] = etapasDeCondiciones(quote.condiciones_json);
  if (crudas.length === 0) {
    const { data: r } = await supabase.from("routes").select("id").eq("name", quote.route_name).maybeSingle();
    if (!r) return { error: "No encontré la ruta en el catálogo." };

    const { data: st } = await supabase
      .from("route_stages")
      .select("day,from_place,to_place,km,accommodation")
      .eq("route_id", r.id)
      .order("day");
    crudas = (st || []) as Etapa[];
  }

  // Una noche por etapa CON alojamiento: las etapas de "fin de servicios" no lo traen.
  const etapas = crudas.filter((s) => s.accommodation);
  if (etapas.length === 0) return { error: "El itinerario no tiene etapas con alojamiento cargadas." };

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

/**
 * Guarda la referencia de reserva de Pilgrim en la cotización.
 *
 * Va en `quotes.pilgrim_ref` y no en el expediente: es un dato de la reserva con el
 * operador (ver migración 0040). Vacío = todavía no hay confirmación de Pilgrim, y el
 * documento sale solo con el código CS. No se valida formato: Pilgrim escribe "47397" y
 * a veces "A47397", y rechazar el número real sería peor que aceptar uno raro.
 */
export async function savePilgrimRef(quoteId: string, ref: string | null) {
  const supabase = await createCommercialClient();
  const limpio = (ref || "").trim() || null;
  const { error } = await supabase.from("quotes").update({ pilgrim_ref: limpio }).eq("id", quoteId);
  if (error) return { error: mensajeError(error) };
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
 *
 * La etiqueta, además, pasa por el módulo de etiquetas: se le quita el logo del
 * intermediario (Pilgrim) y en su lugar queda lo que Nico haya elegido la última vez —la
 * marca de Camino Sacro o nada—. El archivo original se guarda al lado, intacto, para
 * poder volver a él o cambiar de opinión de un clic. Ver `src/lib/etiquetas/`.
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

  const subido = Buffer.from(await file.arrayBuffer());

  if (tipo === "seguro") {
    const destino = rutaSeguroViaje(quote.code);
    const subir = await guardarPdf(supabase, destino, subido);
    if (subir.error) return { error: subir.error };
    const { error } = await supabase.from("travel_docs").update({ insurance_pdf_path: destino }).eq("quote_id", quoteId);
    if (error) return { error: mensajeError(error) };
    revalidatePath(`/seguimiento/${quoteId}`);
    return { ok: true };
  }

  const [memoria, modo] = await Promise.all([leerMemoriaLogos(supabase), leerModoLogo(supabase)]);
  const marcado = await procesarEtiqueta(subido, memoria, modo);

  const destino = rutaEtiquetaEquipaje(quote.code);
  const original = rutaEtiquetaEquipajeOriginal(quote.code);

  // El archivo que se envía conserva SIEMPRE el nombre de siempre, marcado o no: los
  // correos ya enviados y la página pública apuntan a esa ruta.
  const subir = await guardarPdf(supabase, destino, marcado.pdf ? Buffer.from(marcado.pdf) : subido);
  if (subir.error) return { error: subir.error };

  if (marcado.pdf) {
    const copia = await guardarPdf(supabase, original, subido);
    if (copia.error) return { error: copia.error };
    // Solo se aprende de lo que de verdad se guardó.
    await recordarLogos(supabase, { logos: marcado.informe.huellas });
  } else {
    // Una etiqueta sin marcar no deja "original" colgando de la anterior.
    await borrarSiExiste(supabase, original);
  }

  const { error } = await supabase
    .from("travel_docs")
    .update({
      luggage_tag_pdf_path: destino,
      luggage_tag_original_path: marcado.pdf ? original : null,
      luggage_tag_brand: { ...marcado.informe, cuando: new Date().toISOString() },
    })
    .eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/**
 * Cambia de opinión sobre el hueco del logo sin volver a subir nada: la etiqueta se
 * reprocesa desde el original guardado y queda con nuestra marca o con el hueco limpio.
 *
 * Se parte SIEMPRE del original y nunca de la que está publicada, porque la publicada ya
 * no tiene el logo del proveedor: reprocesarla no encontraría nada que quitar y, si lo
 * encontrara, sería nuestro propio relleno. Y la decisión queda además como la de las
 * próximas etiquetas, que es lo que Nico quiere decir cuando la toma.
 */
export async function cambiarLogoEtiqueta(quoteId: string, modoPedido: string) {
  if (modoPedido !== "marca" && modoPedido !== "sin-logo") return { error: "Opción no válida." };
  const modo: ModoLogo = modoPedido;

  const supabase = await createCommercialClient();
  const { data: doc } = await supabase
    .from("travel_docs")
    .select("luggage_tag_pdf_path,luggage_tag_original_path")
    .eq("quote_id", quoteId)
    .maybeSingle();

  const original = doc?.luggage_tag_original_path as string | null | undefined;
  const destino = doc?.luggage_tag_pdf_path as string | null | undefined;
  if (!original || !destino) return { error: "Esta etiqueta no tiene copia del original." };

  const [bucket, ...resto] = original.split("/");
  const { data: archivo, error: bajarErr } = await supabase.storage.from(bucket).download(resto.join("/"));
  if (bajarErr || !archivo) return { error: mensajeError(bajarErr) || "No encontré el original." };

  const memoria = await leerMemoriaLogos(supabase);
  const marcado = await procesarEtiqueta(new Uint8Array(await archivo.arrayBuffer()), memoria, modo);
  // El original sigue teniendo el logo del proveedor: si ahora no se reconoce es que algo
  // va mal, y lo que NO se hace es publicar el original con su logo sin que nadie lo pida.
  if (!marcado.pdf) return { error: marcado.informe.detalle.join(" ") };

  const subir = await guardarPdf(supabase, destino, Buffer.from(marcado.pdf));
  if (subir.error) return { error: subir.error };
  await recordarModoLogo(supabase, modo);

  const { error } = await supabase
    .from("travel_docs")
    .update({ luggage_tag_brand: { ...marcado.informe, cuando: new Date().toISOString() } })
    .eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/**
 * Deja como etiqueta buena la que subió el transportista, con su logo y todo, y anota la
 * huella para no volver a tocarla nunca.
 *
 * Es la salida cuando el marcado se equivoca: en vez de esperar un arreglo, Nico recupera
 * en un clic la etiqueta que le sirve, y la plataforma aprende de paso.
 */
export async function dejarEtiquetaOriginal(quoteId: string) {
  const supabase = await createCommercialClient();
  const { data: doc } = await supabase
    .from("travel_docs")
    .select("luggage_tag_pdf_path,luggage_tag_original_path,luggage_tag_brand")
    .eq("quote_id", quoteId)
    .maybeSingle();

  const original = doc?.luggage_tag_original_path as string | null | undefined;
  const destino = doc?.luggage_tag_pdf_path as string | null | undefined;
  if (!original || !destino) return { error: "Esta etiqueta no tiene copia del original." };

  const [bucket, ...resto] = original.split("/");
  const { data: archivo, error: bajarErr } = await supabase.storage.from(bucket).download(resto.join("/"));
  if (bajarErr || !archivo) return { error: mensajeError(bajarErr) || "No encontré el original." };

  const subir = await guardarPdf(supabase, destino, Buffer.from(await archivo.arrayBuffer()));
  if (subir.error) return { error: subir.error };
  await borrarSiExiste(supabase, original);

  // Lo que se quitó no era un logo del proveedor (o no queremos que se toque): a la lista
  // de respetar, para que la próxima etiqueta igual llegue entera.
  const informe = doc?.luggage_tag_brand as { huellas?: string[] } | null;
  if (informe?.huellas?.length) await recordarLogos(supabase, { respetar: informe.huellas });

  const { error } = await supabase
    .from("travel_docs")
    .update({ luggage_tag_original_path: null, luggage_tag_brand: null })
    .eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/**
 * Le pasa la etiqueta al módulo. Si falla por lo que sea, devuelve `pdf: null` y arriba se
 * guarda el archivo sin tocar: el peregrino necesita SU etiqueta mucho más de lo que nos
 * molesta el logo del proveedor.
 */
async function procesarEtiqueta(
  bytes: Uint8Array,
  memoria: MemoriaLogos,
  modo: ModoLogo,
): Promise<{ pdf: Uint8Array | null; informe: InformeEtiqueta }> {
  try {
    return await quitarLogoProveedor(bytes, memoria, modo);
  } catch (e) {
    return {
      pdf: null,
      informe: {
        reemplazos: 0,
        huellas: [],
        reconocido: true,
        modo,
        detalle: [`No pude quitarle el logo (${e instanceof Error ? e.message : "error desconocido"}); se guarda tal cual.`],
      },
    };
  }
}

/** Sube un PDF a `comercial-docs`. `upsert` porque reemplazar es lo normal acá. */
async function guardarPdf(
  supabase: Awaited<ReturnType<typeof createCommercialClient>>,
  ruta: string,
  contenido: Buffer,
) {
  const { error } = await supabase.storage
    .from("comercial-docs")
    .upload(sinBucket(ruta), contenido, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  return { error: error ? mensajeError(error) : null };
}

/** Borra un archivo del storage sin quejarse si ya no estaba. */
async function borrarSiExiste(supabase: Awaited<ReturnType<typeof createCommercialClient>>, ruta: string) {
  const [bucket, ...resto] = ruta.split("/");
  await supabase.storage.from(bucket).remove([resto.join("/")]);
}

export async function removeTravelFile(quoteId: string, tipo: "seguro" | "etiqueta") {
  const supabase = await createCommercialClient();
  const columna = tipo === "seguro" ? "insurance_pdf_path" : "luggage_tag_pdf_path";
  const { data: doc } = await supabase
    .from("travel_docs")
    .select("insurance_pdf_path,luggage_tag_pdf_path,luggage_tag_original_path")
    .eq("quote_id", quoteId)
    .maybeSingle();
  const ruta = doc?.[columna] as string | null | undefined;
  const original = tipo === "etiqueta" ? (doc?.luggage_tag_original_path as string | null | undefined) : null;

  // Quitar la etiqueta se lleva también la copia sin marcar y su informe: dejar el original
  // colgando haría que la siguiente etiqueta que se suba herede el "Dejar la original" de
  // la anterior, que ya no tiene nada que ver.
  const limpieza = tipo === "etiqueta"
    ? { [columna]: null, luggage_tag_original_path: null, luggage_tag_brand: null }
    : { [columna]: null };
  const { error } = await supabase.from("travel_docs").update(limpieza).eq("quote_id", quoteId);
  if (error) return { error: mensajeError(error) };
  if (ruta) await borrarSiExiste(supabase, ruta);
  if (original) await borrarSiExiste(supabase, original);
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
