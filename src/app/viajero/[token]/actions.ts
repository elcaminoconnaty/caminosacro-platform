"use server";

// Envío de la ficha del viajero. Mismo esquema de seguridad que la firma del contrato:
// token largo con vencimiento, validación de archivos y rate limit; y trazabilidad de las
// autorizaciones (IP, dispositivo, fecha), que es lo que las hace valer.

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { rutaPasaporte, sinBucket } from "@/lib/storage/paths";

export type ResultadoFicha = { ok: true } | { ok: false; error: string };

const PASAPORTE_MAX_BYTES = 12 * 1024 * 1024;
const PASAPORTE_TIPOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

// Igual que en la firma: el cupo que manda es el del token, que es uno por viajero. El de
// IP va holgado porque un grupo que llena las fichas junto sale con una sola IP pública.
const RATE_TOKEN = { max: 10, windowMs: 60 * 60 * 1000 };
const RATE_IP = { max: 150, windowMs: 60 * 60 * 1000 };
const hits = new Map<string, number[]>();
function superaLimite(clave: string, regla: { max: number; windowMs: number }): boolean {
  const ahora = Date.now();
  const previos = (hits.get(clave) ?? []).filter((t) => ahora - t < regla.windowMs);
  previos.push(ahora);
  hits.set(clave, previos);
  if (hits.size > 5000) hits.clear();
  return previos.length > regla.max;
}

const sino = (v: FormDataEntryValue | null): boolean => String(v ?? "") === "si";

export async function guardarFicha(token: string, formData: FormData): Promise<ResultadoFicha> {
  if (!token || token.length < 32) return { ok: false, error: "Enlace no válido." };

  const cabeceras = await headers();
  const ipCliente = (cabeceras.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ip = ipCliente ?? "desconocida";
  const userAgent = cabeceras.get("user-agent") ?? null;
  const excedeToken = superaLimite(`ficha:${token}`, RATE_TOKEN);
  const excedeIp = ipCliente ? superaLimite(`fichaip:${ipCliente}`, RATE_IP) : false;
  if (excedeToken || excedeIp) {
    return {
      ok: false,
      error:
        "Demasiados intentos seguidos con este enlace. Espera un momento y vuelve a intentarlo; " +
        "si sigue pasando, escríbenos a reservas@caminosacro.com.",
    };
  }

  const supabase = createAdminClient("comercial");
  const { data: t } = await supabase
    .from("quote_travelers")
    .select("id,quote_id,token_expires_at,passport_path")
    .eq("token", token)
    .maybeSingle();
  if (!t) return { ok: false, error: "Este enlace no existe o fue anulado." };
  if (t.token_expires_at && new Date(t.token_expires_at).getTime() < Date.now()) {
    return { ok: false, error: "El enlace venció. Escríbenos a reservas@caminosacro.com y te enviamos uno nuevo." };
  }

  const nombre = String(formData.get("full_name") || "").trim();
  const documento = String(formData.get("document_number") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const telefono = String(formData.get("phone") || "").trim();
  const nacimiento = String(formData.get("birth_date") || "").trim();
  const nacionalidad = String(formData.get("nationality") || "").trim();
  const emergenciaNombre = String(formData.get("emergency_name") || "").trim();
  const emergenciaTel = String(formData.get("emergency_phone") || "").trim();
  const pasaporte = formData.get("passport") as File | null;

  if (nombre.length < 5) return { ok: false, error: "Escribe tu nombre completo." };
  if (documento.length < 4) return { ok: false, error: "Escribe tu número de pasaporte." };
  if (!email.includes("@")) return { ok: false, error: "Escribe un correo válido." };

  // Las dos autorizaciones son obligatorias de RESPONDER, no de aceptar: hay que elegir sí
  // o no. Si no se responden se quedan en NULL, y en el anexo eso sale como "pendiente".
  const imagenRaw = formData.get("autoriza_imagen");
  const marketingRaw = formData.get("marketing_optin");
  if (imagenRaw == null) return { ok: false, error: "Falta responder si autorizas el uso de tus fotos." };
  if (marketingRaw == null) return { ok: false, error: "Falta responder si quieres recibir información de nuestros viajes." };

  // El pasaporte solo es obligatorio si el viajero no tiene uno cargado ya (puede haberlo
  // subido el equipo, o puede estar volviendo a corregir un dato).
  let passportPath: string | null = (t.passport_path as string | null) ?? null;
  if (pasaporte && pasaporte.size > 0) {
    const ext = PASAPORTE_TIPOS[pasaporte.type];
    if (!ext) return { ok: false, error: "El pasaporte debe ser una imagen (JPG, PNG, HEIC) o un PDF." };
    if (pasaporte.size > PASAPORTE_MAX_BYTES) return { ok: false, error: "El archivo del pasaporte supera 12 MB." };

    const { data: q } = await supabase.from("quotes").select("code").eq("id", t.quote_id).maybeSingle();
    const ruta = rutaPasaporte(String(q?.code || t.quote_id), ext);
    const buffer = Buffer.from(await pasaporte.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from("comercial-passports")
      .upload(sinBucket(ruta), buffer, { contentType: pasaporte.type, upsert: true, cacheControl: "no-cache" });
    if (upErr) {
      console.error("[ficha] subida de pasaporte falló:", upErr);
      return { ok: false, error: "No pudimos guardar tu pasaporte. Inténtalo de nuevo." };
    }
    passportPath = ruta;
  } else if (!passportPath) {
    return { ok: false, error: "Falta la foto de tu pasaporte." };
  }

  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from("quote_travelers")
    .update({
      full_name: nombre,
      document_type: "Pasaporte",
      document_number: documento,
      email,
      phone: telefono || null,
      birth_date: nacimiento || null,
      nationality: nacionalidad || null,
      emergency_name: emergenciaNombre || null,
      emergency_phone: emergenciaTel || null,
      autoriza_imagen: sino(imagenRaw),
      marketing_optin: sino(marketingRaw),
      passport_path: passportPath,
      ficha_completed_at: ahora,
      consent_ip: ip,
      consent_user_agent: userAgent,
      updated_at: ahora,
    })
    .eq("id", t.id);
  if (error) {
    console.error("[ficha] update falló:", error);
    return { ok: false, error: "No pudimos guardar tus datos. Inténtalo de nuevo." };
  }

  // Sin revalidatePath: invalidaría el router del navegador del viajero y taparía la
  // pantalla de éxito. El CRM es dinámico y ve el cambio en la próxima carga.
  return { ok: true };
}
