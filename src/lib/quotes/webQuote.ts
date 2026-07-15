import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { detectSeason, DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { mensajeError } from "@/lib/errors";

const PDF_URL_TTL = 60 * 60 * 24 * 7; // 7 días, igual que el cotizador público interno.

/**
 * Cotización creada desde el cotizador de caminosacro.com (WordPress).
 *
 * Se parece a crearCotizacionPublica (cotizar/actions.ts) pero NO la reemplaza:
 * el cotizador web reparte habitaciones como lo hace el sitio — pares en doble
 * y el impar en individual — mientras que /cotizar aplica una sola modalidad
 * a todo el grupo. Se mantienen separadas para no arriesgar el flujo interno.
 */
export type SolicitudWordPress = {
  route_slug: string;
  tipo: "pension" | "hotel";
  start_date: string; // YYYY-MM-DD
  people: number;
  full_name: string;
  email: string;
  phone: string;
  terms_accepted: boolean;
  marketing_optin: boolean;
};

export type DesgloseWordPress = {
  people: number;
  rooms: { dobles: number; en_doble: number; individuales: number };
  tarifa_doble: number;
  tarifa_indiv: number;
  coste_doble: number;
  coste_indiv: number;
  base_eur: number;
  season: { kind: "regular" | "high_season" | "easter"; label: string; per_person: number; total: number };
  total_eur: number;
};

export type ResultadoWordPress =
  | { ok: true; code: string; pdf_url: string | null; email_sent: boolean; breakdown: DesgloseWordPress }
  | { ok: false; status: number; error: string };

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function crearCotizacionWordPress(datos: SolicitudWordPress): Promise<ResultadoWordPress> {
  const supabase = createAdminClient("comercial");

  // 1. Ruta + precios de las dos modalidades (doble y single del tipo elegido).
  //    Todo se resuelve en el servidor: WordPress no manda ningún precio.
  const { data: route } = await supabase
    .from("routes")
    .select("id,name,days")
    .eq("slug", datos.route_slug)
    .eq("active", true)
    .maybeSingle();
  if (!route) return { ok: false, status: 404, error: "ruta_no_encontrada" };

  const modDoble = `${datos.tipo}_doble`;
  const modSingle = `${datos.tipo}_single`;
  const [{ data: precios }, { data: seasonSetting }] = await Promise.all([
    supabase
      .from("pricing")
      .select("modality,price_cs,price_pilgrim")
      .eq("route_id", route.id)
      .eq("season", "regular")
      .in("modality", [modDoble, modSingle]),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
  ]);

  const fila = (m: string) => (precios || []).find((p) => p.modality === m);
  const tarifaDoble = Number(fila(modDoble)?.price_cs) || 0;
  const tarifaSingle = Number(fila(modSingle)?.price_cs) || 0;
  if (tarifaDoble <= 0 || tarifaSingle <= 0) {
    return { ok: false, status: 404, error: "ruta_sin_precio" };
  }

  // 2. Reparto de habitaciones (misma regla que cs_cot_habitaciones() en el sitio):
  //    pares en habitación doble, el impar va en individual.
  const dobles = Math.floor(datos.people / 2);
  const enDoble = dobles * 2;
  const individuales = datos.people % 2;

  // 3. Temporada sobre el viaje completo (salida → último día), igual que /cotizar.
  const seasonConfig = (seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS;
  const endDate = route.days ? sumarDias(datos.start_date, route.days - 1) : datos.start_date;
  const season = detectSeason(datos.start_date, endDate, seasonConfig);

  const costeDoble = enDoble * tarifaDoble;
  const costeIndiv = individuales * tarifaSingle;
  const baseEur = costeDoble + costeIndiv;
  const suplementoEur = season.surcharge_per_person_cs * datos.people;
  const totalEur = baseEur + suplementoEur;

  // Costo interno del proveedor (margen del dashboard): mismo reparto con price_pilgrim.
  const pilgrimDoble = Number(fila(modDoble)?.price_pilgrim) || 0;
  const pilgrimSingle = Number(fila(modSingle)?.price_pilgrim) || 0;
  const costEur =
    enDoble * pilgrimDoble + individuales * pilgrimSingle + season.surcharge_per_person_pilgrim * datos.people;

  // 4. Cliente: dedup por teléfono (igual que el wizard interno), guardando consentimientos.
  const ahora = new Date().toISOString();
  const consentimientos = {
    marketing_optin: datos.marketing_optin,
    marketing_optin_at: ahora,
    terms_accepted_at: ahora,
  };
  let clientId: string | null = null;
  const { data: existente } = await supabase.from("clients").select("id").eq("phone", datos.phone).maybeSingle();
  if (existente) {
    clientId = existente.id;
    await supabase
      .from("clients")
      .update({ full_name: datos.full_name, email: datos.email, ...consentimientos })
      .eq("id", existente.id);
  } else {
    const { data: creado } = await supabase
      .from("clients")
      .insert({ full_name: datos.full_name, phone: datos.phone, email: datos.email, ...consentimientos })
      .select("id")
      .single();
    clientId = creado?.id ?? null;
  }

  // 5. Cotización. La etiqueta de modalidad refleja el reparto real de habitaciones.
  const tipoNombre = datos.tipo === "hotel" ? "Hotel" : "Pensión";
  const modalityLabel =
    individuales === 0
      ? `${tipoNombre}, habitación doble`
      : dobles === 0
        ? `${tipoNombre}, habitación individual`
        : `${tipoNombre} · ${dobles} ${dobles === 1 ? "doble" : "dobles"} + 1 individual`;

  const { data: code, error: codeErr } = await supabase.rpc("next_quote_code");
  if (codeErr) return { ok: false, status: 500, error: mensajeError(codeErr, "sin_codigo") };

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
      modality: modalityLabel,
      base_eur: baseEur,
      season_supplement_eur: suplementoEur,
      season_kind: season.type,
      total_eur: totalEur,
      cost_eur: costEur,
      status: "enviada",
      source: "wordpress",
      notes: "Cotización generada desde el cotizador de caminosacro.com (WordPress)",
      rooms_json: {
        tipo: datos.tipo,
        dobles,
        individuales,
        tarifa_doble: tarifaDoble,
        tarifa_single: tarifaSingle,
      },
    })
    .select("id,code")
    .single();
  if (quoteErr || !quote) {
    return { ok: false, status: 500, error: mensajeError(quoteErr, "sin_cotizacion") };
  }

  // 6. El MISMO PDF de la plataforma: queda en el bucket comercial-quotes y su
  //    pdf_path en la cotización, visible desde el CRM. Al sitio solo va la URL firmada.
  let pdfUrl: string | null = null;
  const pdf = await renderAndStoreQuotePdf(supabase, quote.id);
  if ("ok" in pdf && pdf.ok) {
    const { data: fresh } = await supabase.from("quotes").select("pdf_path").eq("id", quote.id).maybeSingle();
    const filePath = (fresh?.pdf_path ?? "").replace(/^comercial-quotes\//, "");
    if (filePath) {
      const { data: signed } = await supabase.storage.from("comercial-quotes").createSignedUrl(filePath, PDF_URL_TTL);
      pdfUrl = signed?.signedUrl ?? null;
    }
  } else {
    console.error("[wp-quote] PDF falló para", quote.code, "error" in pdf ? pdf.error : "");
  }

  // 7. Correo al cliente con su PDF (mismo webhook n8n → Gmail que /cotizar).
  //    La notificación interna a reservas@ la envía WordPress; aquí solo va la del cliente.
  const emailSent = await enviarCorreo({
    code: quote.code,
    nombre: datos.full_name,
    email: datos.email,
    telefono: datos.phone,
    ruta: route.name,
    fecha_inicio: datos.start_date,
    personas: datos.people,
    alojamiento: modalityLabel,
    total_eur: totalEur,
    pdf_url: pdfUrl,
  });

  return {
    ok: true,
    code: quote.code,
    pdf_url: pdfUrl,
    email_sent: emailSent,
    breakdown: {
      people: datos.people,
      rooms: { dobles, en_doble: enDoble, individuales },
      tarifa_doble: tarifaDoble,
      tarifa_indiv: tarifaSingle,
      coste_doble: costeDoble,
      coste_indiv: costeIndiv,
      base_eur: baseEur,
      season: {
        kind: season.type,
        label: season.label,
        per_person: season.surcharge_per_person_cs,
        total: suplementoEur,
      },
      total_eur: totalEur,
    },
  };
}

// Copia local del helper privado de cotizar/actions.ts (no se exporta desde un
// "use server" sin convertirlo en action; copiar es más seguro que tocarlo).
async function enviarCorreo(payload: Record<string, unknown>): Promise<boolean> {
  const url = process.env.QUOTE_EMAIL_WEBHOOK_URL;
  if (!url) {
    console.warn("[wp-quote] QUOTE_EMAIL_WEBHOOK_URL sin configurar: no se envió el correo.");
    return false;
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.QUOTE_EMAIL_WEBHOOK_SECRET
          ? { "x-webhook-secret": process.env.QUOTE_EMAIL_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch (e) {
    console.error("[wp-quote] no se pudo enviar el correo:", e);
    return false;
  }
}
