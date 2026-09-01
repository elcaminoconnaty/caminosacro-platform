"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectSeason, DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { armarCorreoCotizacion } from "@/lib/quotes/quoteEmail";
import { enviarCorreoWebhook } from "@/lib/email/webhook";
import { marcarCotizacionEnviada } from "@/lib/quotes/marcarEnviada";
import { DEFAULT_STATUS } from "@/lib/quoteStatus";
import { mensajeError } from "@/lib/errors";
import { MODALIDAD_LABEL } from "./constants";
import { fallbackPriceNote, quoteYear, ratesForYearWithFallback } from "@/lib/pricing/year";

const PDF_URL_TTL = 60 * 60 * 24 * 7; // 7 días: el cliente entra al PDF desde el correo, no en caliente.

const solicitudSchema = z.object({
  route_id: z.string().uuid(),
  modality: z.enum(["pension_doble", "pension_single", "hotel_doble", "hotel_single"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  people: z.number().int().min(1).max(12),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(6).max(40),
  country: z.string().trim().max(60).optional().nullable(),
  // Honeypot: los bots rellenan todo; una persona nunca ve este campo.
  website: z.string().max(0).optional(),
});

export type SolicitudPublica = z.input<typeof solicitudSchema>;

export type ResultadoCotizacion =
  | { ok: true; code: string; totalEur: number; pdfUrl: string | null; emailEnviado: boolean }
  | { ok: false; error: string };

// Límite por IP, en memoria del proceso. No es a prueba de balas (Railway puede
// reiniciar o escalar), pero corta el abuso obvio sin meter dependencias nuevas.
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const hits = new Map<string, number[]>();

function superaLimite(ip: string): boolean {
  const ahora = Date.now();
  const previos = (hits.get(ip) ?? []).filter((t) => ahora - t < RATE_LIMIT.windowMs);
  previos.push(ahora);
  hits.set(ip, previos);
  if (hits.size > 5000) hits.clear(); // techo de memoria
  return previos.length > RATE_LIMIT.max;
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function crearCotizacionPublica(entrada: SolicitudPublica): Promise<ResultadoCotizacion> {
  const parsed = solicitudSchema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, error: "Revisa los datos del formulario: hay algo incompleto o mal escrito." };
  }
  const datos = parsed.data;
  if (datos.website) return { ok: false, error: "No pudimos procesar la solicitud." };

  const cabeceras = await headers();
  const ip = (cabeceras.get("x-forwarded-for") ?? "desconocida").split(",")[0].trim();
  if (superaLimite(ip)) {
    return {
      ok: false,
      error: "Ya generaste varias cotizaciones seguidas. Espera un momento o escríbenos por WhatsApp y te ayudamos.",
    };
  }

  const supabase = createAdminClient("comercial");

  // 1. Precio de catálogo. Se resuelve en el servidor: el precio que llegue del
  //    navegador no se usa para nada (si no, cualquiera lo edita).
  const [{ data: route }, { data: priceRows }, { data: seasonSetting }] = await Promise.all([
    supabase.from("routes").select("id,name,days").eq("id", datos.route_id).eq("active", true).maybeSingle(),
    // Todos los años: se elige el del viaje y, si aún no está cargado, el anterior con
    // aviso — el público necesita un número (ver @/lib/pricing/year).
    supabase
      .from("pricing")
      .select("year,price_cs,price_pilgrim")
      .eq("route_id", datos.route_id)
      .eq("modality", datos.modality)
      .eq("season", "regular"),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
  ]);

  if (!route) return { ok: false, error: "Esa ruta ya no está disponible. Elige otra, por favor." };

  const salidaYear = quoteYear(datos.start_date);
  const tarifas = ratesForYearWithFallback((priceRows || []) as Array<{ year: number | null; price_cs: number | string | null; price_pilgrim: number | string | null }>, salidaYear);
  const priceRow = tarifas.rows[0] ?? null;
  const priceNote = tarifas.isFallback ? fallbackPriceNote(tarifas.year, salidaYear) : null;
  const precioPorPersona = Number(priceRow?.price_cs) || 0;
  if (precioPorPersona <= 0) {
    return { ok: false, error: "Esa combinación no tiene precio publicado: escríbenos y te la cotizamos a medida." };
  }

  const seasonConfig = (seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS;
  const endDate = route.days ? sumarDias(datos.start_date, route.days - 1) : datos.start_date;
  const season = detectSeason(datos.start_date, endDate, seasonConfig);

  const baseEur = precioPorPersona * datos.people;
  const suplementoEur = season.surcharge_per_person_cs * datos.people;
  const totalEur = baseEur + suplementoEur;
  // Costo interno del proveedor: se guarda para el margen del dashboard, nunca se devuelve al navegador.
  // Desglosado como el lado cliente (base aparte del suplemento) para que
  // recompute_quote_money() pueda recalcularlo al agregar opcionales.
  const costBaseEur = (Number(priceRow?.price_pilgrim) || 0) * datos.people;
  const suplementoCostEur = season.surcharge_per_person_pilgrim * datos.people;
  const costEur = costBaseEur + suplementoCostEur;

  // 2. Cliente (dedup por teléfono, igual que el wizard interno)
  let clientId: string | null = null;
  const { data: existente } = await supabase
    .from("clients")
    .select("id")
    .eq("phone", datos.phone)
    .maybeSingle();
  if (existente) {
    clientId = existente.id;
    await supabase
      .from("clients")
      .update({ full_name: datos.full_name, email: datos.email, country: datos.country || null })
      .eq("id", existente.id);
  } else {
    const { data: creado } = await supabase
      .from("clients")
      .insert({ full_name: datos.full_name, phone: datos.phone, email: datos.email, country: datos.country || null })
      .select("id")
      .single();
    clientId = creado?.id ?? null;
  }

  // 3. Cotización
  const { data: code, error: codeErr } = await supabase.rpc("next_quote_code");
  if (codeErr) return { ok: false, error: mensajeError(codeErr, "No pudimos generar tu cotización.") };

  const { data: quote, error: quoteErr } = await supabase
    .from("quotes")
    .insert({
      code,
      client_id: clientId,
      client_name: datos.full_name,
      client_phone: datos.phone,
      client_email: datos.email,
      route_id: route.id,
      route_name: route.name,
      start_date: datos.start_date,
      end_date: endDate,
      valid_until: sumarDias(new Date().toISOString().slice(0, 10), 30),
      people: datos.people,
      modality: MODALIDAD_LABEL[datos.modality] ?? datos.modality,
      base_eur: baseEur,
      season_supplement_eur: suplementoEur,
      season_kind: season.type,
      total_eur: totalEur,
      cost_base_eur: costBaseEur,
      season_supplement_cost_eur: suplementoCostEur,
      cost_eur: costEur,
      status: DEFAULT_STATUS,
      source: "web",
      notes: "Cotización generada por el cliente desde caminosacro.com",
      price_note: priceNote,
    })
    .select("id,code")
    .single();

  if (quoteErr || !quote) {
    return { ok: false, error: mensajeError(quoteErr, "No pudimos guardar tu cotización.") };
  }

  // 4. PDF (el mismo que usa el equipo) + enlace firmado
  let pdfUrl: string | null = null;
  const pdf = await renderAndStoreQuotePdf(supabase, quote.id);
  if (pdf.ok) {
    const { data: fresh } = await supabase.from("quotes").select("pdf_path").eq("id", quote.id).maybeSingle();
    const filePath = (fresh?.pdf_path ?? "").replace(/^comercial-quotes\//, "");
    if (filePath) {
      const { data: signed } = await supabase.storage
        .from("comercial-quotes")
        .createSignedUrl(filePath, PDF_URL_TTL);
      pdfUrl = signed?.signedUrl ?? null;
    }
  } else {
    console.error("[cotizar] PDF falló para", quote.code, pdf.error);
  }

  // 5. Correo con el PDF (webhook n8n → Brevo, reservas@), con subject/body
  //    renderizados desde la plantilla `cotizacion_enviada` del CRM. Si el envío
  //    falla, la cotización ya existe y el cliente igual ve su enlace en pantalla:
  //    no se pierde el lead.
  const correo = await armarCorreoCotizacion(supabase, quote.id);
  const { ok: emailEnviado } = await enviarCorreoWebhook({
    code: quote.code,
    nombre: datos.full_name,
    email: datos.email,
    telefono: datos.phone,
    ruta: route.name,
    fecha_inicio: datos.start_date,
    personas: datos.people,
    alojamiento: MODALIDAD_LABEL[datos.modality] ?? datos.modality,
    total_eur: totalEur,
    pdf_url: pdfUrl,
    subject: correo?.subject ?? null,
    body: correo?.body ?? null,
  });

  // Nace en `sin_enviar` como todas; si el correo salió, pasa a `enviada`. Antes este
  // camino ni siquiera escribía `email_sent_at`, así que en el CRM una cotización del
  // cotizador público figuraba como no enviada para siempre.
  if (emailEnviado) await marcarCotizacionEnviada(supabase, quote.id);

  return { ok: true, code: quote.code, totalEur, pdfUrl, emailEnviado };
}
