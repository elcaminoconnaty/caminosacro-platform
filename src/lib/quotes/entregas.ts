import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderAndStoreQuotePdf, type ComercialClient } from "@/lib/quotes/pdf";
import { carpetaCotizacion, sinBucket } from "@/lib/storage/paths";
import { leerFilasHabitacion, personasDeFila, roomRowLabel } from "@/lib/quotes/rooms";

/**
 * El historial de lo entregado (migración 0049).
 *
 * Una entrega = una vez que la cotización salió hacia el cliente. Se congela el PDF de ese
 * momento y se guarda una foto de las cifras, porque el archivo vivo se sobrescribe al
 * regenerar y los campos los pisa el editor: sin esto, del documento que alguien recibió el
 * martes no quedaba nada el miércoles.
 *
 * Nunca lanza. Congelar una entrega es importante, pero no tanto como que el correo salga:
 * si acá falla algo, se registra en el log del servidor y el envío sigue su camino.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type CanalEntrega = "correo" | "whatsapp" | "contrato";

export type Entrega = {
  id: string;
  version: number;
  canal: CanalEntrega;
  destinatario: string | null;
  pdf_path: string;
  pdf_sha256: string;
  total_eur: number | null;
  datos: Record<string, unknown>;
  prueba: boolean;
  created_at: string;
};

const BUCKET = "comercial-quotes";

/**
 * Los bytes del PDF, recién salidos del horno.
 *
 * NO se usa `storage.download()` a propósito: esa lectura pasa por el borde de Supabase y
 * devuelve la copia cacheada. Medido el 21-sep-2026 sobre una cotización recién
 * regenerada: `download()` entregaba 348.318 bytes (el documento viejo) mientras la ficha
 * del archivo ya declaraba 348.324. Congelar una entrega con esos bytes sería guardar como
 * "lo que recibió el cliente" un documento que no es el que se le mandó — justo lo que
 * esta tabla existe para evitar.
 *
 * Una URL firmada lleva un token distinto en cada llamada, así que no hay caché que valga.
 */
async function bytesDelPdf(supabase: AnyClient, pdfPath: string): Promise<Buffer | null> {
  try {
    const [bucket, ...resto] = pdfPath.split("/");
    const { data: firmada } = await supabase.storage.from(bucket).createSignedUrl(resto.join("/"), 120);
    if (!firmada?.signedUrl) return null;
    const res = await fetch(firmada.signedUrl, { cache: "no-store" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.warn("[entregas] no pude descargar el PDF:", e);
    return null;
  }
}

/** La foto de las cifras. Lo que mañana haría falta para explicar un precio de ayer. */
function fotoDeLaCotizacion(q: Record<string, unknown>): Record<string, unknown> {
  const filas = leerFilasHabitacion(q.rooms_json);
  return {
    code: q.code ?? null,
    cliente: q.client_name ?? null,
    email: q.client_email ?? null,
    ruta: q.route_name ?? null,
    salida: q.start_date ?? null,
    regreso: q.end_date ?? null,
    personas: Number(q.people) || null,
    alojamiento: q.modality ?? null,
    habitaciones: filas.map((f) => ({
      etiqueta: roomRowLabel(f),
      habitaciones: f.habitaciones,
      personas: personasDeFila(f),
      precio_cs: f.precio_cs,
      precio_pilgrim: f.precio_pilgrim,
    })),
    base_eur: q.base_eur ?? null,
    suplemento_eur: q.season_supplement_eur ?? null,
    total_eur: q.total_eur ?? null,
    cost_eur: q.cost_eur ?? null,
    valido_hasta: q.valid_until ?? null,
    nota_precio: q.manual_price_note ?? null,
    estado: q.status ?? null,
  };
}

/**
 * Congela lo que se está entregando y devuelve la fila creada.
 *
 * Qué hace, en orden: se asegura de que haya PDF (lo genera si falta), lo descarga para
 * sacarle la huella, y —si esa huella no es la de la última entrega— guarda una copia con
 * su número de versión. Reenviar un documento idéntico crea una entrega nueva que APUNTA
 * al archivo de la anterior: son dos entregas, un solo archivo. Storage no crece por
 * reenviar tres veces lo mismo.
 */
export async function congelarEntrega(
  supabase: AnyClient,
  quoteId: string,
  opciones: {
    canal: CanalEntrega;
    destinatario?: string | null;
    emailLogId?: string | null;
    prueba?: boolean;
    /**
     * `true` = si el documento es idéntico al de la última entrega, NO se registra otra:
     * se devuelve aquella. Lo usan los correos del contrato, que adjuntan la cotización
     * como Anexo 1 y se reenvían en cada recordatorio: sin esto, el historial se llenaría
     * de entregas idénticas cada tres días. Un envío que alguien dispara a propósito
     * —correo o WhatsApp— sí registra siempre: ahí lo que se cuenta es CUÁNDO se mandó.
     */
    soloSiCambia?: boolean;
  },
): Promise<Entrega | null> {
  try {
    const { data: quote } = await supabase
      .from("quotes")
      .select("id,code,client_name,client_email,route_name,start_date,end_date,people,modality,base_eur,season_supplement_eur,total_eur,cost_eur,valid_until,manual_price_note,status,rooms_json,pdf_path")
      .eq("id", quoteId)
      .maybeSingle();
    if (!quote) return null;

    let pdfPath = (quote.pdf_path as string | null) ?? null;
    if (!pdfPath) {
      const r = await renderAndStoreQuotePdf(supabase as ComercialClient, quoteId);
      if (r.error) {
        console.warn("[entregas] no pude generar el PDF de", quote.code, r.error);
        return null;
      }
      const { data } = await supabase.from("quotes").select("pdf_path").eq("id", quoteId).maybeSingle();
      pdfPath = (data?.pdf_path as string | null) ?? null;
    }
    if (!pdfPath) return null;

    const bytes = await bytesDelPdf(supabase, pdfPath);
    if (!bytes) {
      console.warn("[entregas] no pude leer el PDF de", quote.code);
      return null;
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const { data: previas } = await supabase
      .from("quote_deliveries")
      .select("id,version,canal,destinatario,pdf_path,pdf_sha256,total_eur,datos,prueba,created_at")
      .eq("quote_id", quoteId)
      .order("version", { ascending: false })
      .limit(1);
    const ultima = (previas ?? [])[0] as Entrega | undefined;

    if (opciones.soloSiCambia && ultima?.pdf_sha256 === sha256) return ultima;

    const version = (ultima?.version ?? 0) + 1;

    // Mismo documento que la última entrega: se reutiliza el archivo congelado.
    let copiaPath = ultima?.pdf_sha256 === sha256 ? ultima.pdf_path : "";
    if (!copiaPath) {
      copiaPath = `${BUCKET}/${carpetaCotizacion(String(quote.code))}/entregas/v${version}-${quote.code}.pdf`;
      const { error: subirErr } = await supabase.storage
        .from(BUCKET)
        // `upsert` porque una entrega puede reintentarse tras un fallo a medias; el nombre
        // lleva la versión, así que nunca pisa el documento de otra entrega.
        .upload(sinBucket(copiaPath), bytes, { contentType: "application/pdf", upsert: true, cacheControl: "31536000" });
      if (subirErr) {
        console.warn("[entregas] no pude copiar el PDF de", quote.code, subirErr);
        return null;
      }
    }

    const { data: fila, error: insErr } = await supabase
      .from("quote_deliveries")
      .insert({
        quote_id: quoteId,
        version,
        canal: opciones.canal,
        destinatario: opciones.destinatario ?? null,
        pdf_path: copiaPath,
        pdf_sha256: sha256,
        total_eur: quote.total_eur ?? null,
        cost_eur: quote.cost_eur ?? null,
        datos: fotoDeLaCotizacion(quote as Record<string, unknown>),
        email_log_id: opciones.emailLogId ?? null,
        prueba: opciones.prueba ?? false,
      })
      .select("id,version,canal,destinatario,pdf_path,pdf_sha256,total_eur,datos,prueba,created_at")
      .maybeSingle();
    if (insErr) {
      console.warn("[entregas] no pude registrar la entrega de", quote.code, insErr);
      return null;
    }
    return (fila as Entrega | null) ?? null;
  } catch (e) {
    console.warn("[entregas] fallo inesperado:", e);
    return null;
  }
}

/** Las entregas de una cotización, de la más nueva a la más vieja. */
export async function entregasDe(supabase: AnyClient, quoteId: string): Promise<Entrega[]> {
  const { data } = await supabase
    .from("quote_deliveries")
    .select("id,version,canal,destinatario,pdf_path,pdf_sha256,total_eur,datos,prueba,created_at")
    .eq("quote_id", quoteId)
    .order("version", { ascending: false });
  return ((data ?? []) as Entrega[]);
}

/**
 * La última entrega REAL (las pruebas no cuentan). Es lo que abre el enlace corto: el
 * peregrino tiene que ver lo último que se le prometió, no una corrección de la que
 * todavía nadie le ha hablado.
 */
export async function ultimaEntrega(supabase: AnyClient, quoteId: string): Promise<Entrega | null> {
  const { data } = await supabase
    .from("quote_deliveries")
    .select("id,version,canal,destinatario,pdf_path,pdf_sha256,total_eur,datos,prueba,created_at")
    .eq("quote_id", quoteId)
    .eq("prueba", false)
    .order("version", { ascending: false })
    .limit(1);
  return (((data ?? [])[0] as Entrega | undefined) ?? null);
}
