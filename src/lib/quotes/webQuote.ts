import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { armarCorreoCotizacion } from "@/lib/quotes/quoteEmail";
import { enviarCorreoWebhook } from "@/lib/email/webhook";
import { registrarEnvio } from "@/lib/email/log";
import { marcarCotizacionEnviada } from "@/lib/quotes/marcarEnviada";
import { DEFAULT_STATUS } from "@/lib/quoteStatus";
import { mensajeError } from "@/lib/errors";
import { firmarPdf } from "@/lib/quotes/pdfUrl";
import { sumarDias, tarifarRuta } from "@/lib/quotes/tarifar";
import { VENTANA_ENVIO_REPETIDO_MS } from "@/lib/enviosRepetidos";

/**
 * Cotización creada desde el cotizador de caminosacro.com (WordPress).
 *
 * El cálculo —tarifa del año de salida, reparto de habitaciones, temporada— sale de
 * `@/lib/quotes/tarifar`, el mismo módulo que usa BayMax. Acá solo se decide qué se
 * cotiza (rutas publicadas), qué se guarda y que sí se manda el correo al cliente.
 *
 * Se parece a crearCotizacionPublica (cotizar/actions.ts) pero NO la reemplaza:
 * el cotizador web reparte habitaciones como lo hace el sitio — pares en doble
 * y el impar en individual — mientras que /cotizar aplica una sola modalidad
 * a todo el grupo, y además cae al año anterior con aviso. Se mantienen separadas.
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

export async function crearCotizacionWordPress(datos: SolicitudWordPress): Promise<ResultadoWordPress> {
  const supabase = createAdminClient("comercial");

  // 1. Ruta + precios de las dos modalidades (doble y single del tipo elegido).
  //    Todo se resuelve en el servidor: WordPress no manda ningún precio.
  const { data: route } = await supabase
    .from("routes")
    .select("id,name,days")
    .eq("slug", datos.route_slug)
    .eq("active", true)
    .eq("web", true)
    .maybeSingle();
  if (!route) return { ok: false, status: 404, error: "ruta_no_encontrada" };

  // 2. Precio, reparto de habitaciones y temporada: el módulo compartido con BayMax.
  //    Coincidencia EXACTA de año, sin caer al anterior — cotizar una salida de 2027 con la
  //    tarifa de 2026 es cobrar de menos y prometerle al visitante un precio que no existe.
  //    Si el año no está cargado, la web pinta su aviso y le manda el lead a Nico.
  const r = await tarifarRuta(supabase, {
    route: { id: route.id, name: route.name, days: route.days },
    tipo: datos.tipo,
    todosIndividuales: false,
    personas: datos.people,
    startDate: datos.start_date,
  });
  if (!r.ok) return { ok: false, status: r.status, error: r.error };
  const t = r.tarifa;
  const modalityLabel = t.modalityLabel;

  // El desglose no depende de lo que se guarde: sale entero de la tarifa, y se calcula
  // una sola vez porque lo devuelven los dos caminos de abajo (la cotización nueva y la
  // repetida).
  const desglose: DesgloseWordPress = {
    people: datos.people,
    rooms: { dobles: t.dobles, en_doble: t.enDoble, individuales: t.individuales },
    tarifa_doble: t.tarifaDoble,
    tarifa_indiv: t.tarifaSingle,
    coste_doble: t.enDoble * t.tarifaDoble,
    coste_indiv: t.individuales * t.tarifaSingle,
    base_eur: t.baseEur,
    season: {
      kind: t.season.type,
      label: t.season.label,
      per_person: t.season.surcharge_per_person_cs,
      total: t.suplementoEur,
    },
    total_eur: t.totalEur,
  };

  // ---- El mismo envío dos veces no es dos cotizaciones ----
  //
  // El formulario de la web manda la solicitud repetida y cada repetición era una
  // cotización más: un código más, un PDF más y OTRO correo al mismo cliente. En la base
  // están Pepa (CS-2026-094 y 095, a 6 segundos) y Leidy Lorena (064 y 065, a 20). Para
  // el visitante es un solo clic; para el CRM eran dos expedientes que alguien tiene que
  // salir a limpiar a mano.
  //
  // Coincidencia EXACTA de lo que define la cotización: mismo correo, misma ruta, misma
  // salida, mismas personas y misma modalidad. Cualquier cambio —una fecha, una persona,
  // pensión en vez de hotel— es una cotización distinta y se crea.
  //
  // A diferencia del lead, acá NO se exige que a la original ya le haya salido el correo.
  // Los duplicados reales llegan a 6 y 20 segundos, y para entonces la primera petición
  // sigue dentro de su propio envío —renderiza el PDF, lo firma y espera al webhook, que
  // puede tardar hasta 45 s—, así que `email_sent_at` todavía está en null justo cuando
  // hay que frenar al segundo. Exigirlo dejaba pasar exactamente el caso que esto viene a
  // cerrar.
  //
  // Se puede prescindir de esa red porque la cotización EXISTE en el CRM pase lo que pase
  // con el correo: si el envío falló, queda en `email_log`, la cotización se queda en
  // «sin enviar» y se reenvía desde el expediente. En el lead no había nada de eso, y por
  // eso allá la red sí hace falta.
  const desde = new Date(Date.now() - VENTANA_ENVIO_REPETIDO_MS).toISOString();
  const { data: repetida } = await supabase
    .from("quotes")
    .select("id,code,email_sent_at")
    .eq("source", "wordpress")
    .eq("client_email", datos.email)
    .eq("route_id", route.id)
    .eq("start_date", datos.start_date)
    .eq("people", datos.people)
    .eq("modality", modalityLabel)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (repetida) {
    console.info("[wp-quote] envío repetido, devuelvo", repetida.code, "sin duplicar");
    // La misma cotización que ya tiene: su código y su PDF, firmado de nuevo porque la
    // URL anterior caduca. Sin correo nuevo: de ese se encarga la primera petición.
    // `email_sent` dice lo que se sabe en este momento, no lo que se espera.
    return {
      ok: true,
      code: repetida.code,
      pdf_url: await firmarPdf(supabase, repetida.id),
      email_sent: !!repetida.email_sent_at,
      breakdown: desglose,
    };
  }

  // (cliente) dedup por teléfono (igual que el wizard interno), guardando consentimientos.
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

  // 3. Cotización. La etiqueta de modalidad refleja el reparto real de habitaciones.
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
      end_date: t.endDate,
      valid_until: sumarDias(new Date().toISOString().slice(0, 10), 30),
      people: datos.people,
      modality: modalityLabel,
      base_eur: t.baseEur,
      season_supplement_eur: t.suplementoEur,
      season_kind: t.season.type,
      total_eur: t.totalEur,
      cost_base_eur: t.costBaseEur,
      season_supplement_cost_eur: t.suplementoCostEur,
      cost_eur: t.costEur,
      status: DEFAULT_STATUS,
      source: "wordpress",
      notes: "Cotización generada desde el cotizador de caminosacro.com (WordPress)",
      rooms_json: t.roomsJson,
      // Sin nota de año: estas cotizaciones son siempre con la tarifa del año de salida.
      price_note: null,
    })
    .select("id,code")
    .single();
  if (quoteErr || !quote) {
    return { ok: false, status: 500, error: mensajeError(quoteErr, "sin_cotizacion") };
  }

  // 4. El MISMO PDF de la plataforma: queda en el bucket comercial-quotes y su
  //    pdf_path en la cotización, visible desde el CRM. Al sitio solo va la URL firmada.
  const pdf = await renderAndStoreQuotePdf(supabase, quote.id);
  if (!("ok" in pdf && pdf.ok)) {
    console.error("[wp-quote] PDF falló para", quote.code, "error" in pdf ? pdf.error : "");
  }
  const pdfUrl = await firmarPdf(supabase, quote.id);

  // 5. Correo al cliente con su PDF (webhook n8n → Brevo, reservas@).
  //    subject/body van renderizados desde la plantilla `cotizacion_enviada`
  //    del CRM: es el mismo mensaje que ve el equipo en la tarjeta de correo.
  //    La notificación interna a reservas@ la envía WordPress; aquí solo va la del cliente.
  const correo = await armarCorreoCotizacion(supabase, quote.id);
  const envio = await enviarCorreoWebhook({
    code: quote.code,
    nombre: datos.full_name,
    email: datos.email,
    telefono: datos.phone,
    ruta: route.name,
    fecha_inicio: datos.start_date,
    personas: datos.people,
    alojamiento: modalityLabel,
    total_eur: t.totalEur,
    pdf_url: pdfUrl,
    subject: correo?.subject ?? null,
    body: correo?.body ?? null,
  });
  // Mismo motivo que en /cotizar: nadie mira este envío, así que la fila de `email_log`
  // es todo el rastro que va a quedar del correo que recibió el cliente de WordPress.
  await registrarEnvio(supabase, {
    quoteId: quote.id,
    code: quote.code,
    tipo: "cliente",
    destinatario: datos.email,
    asunto: correo?.subject ?? null,
    adjuntos: pdfUrl ? 1 : 0,
    messageId: envio.messageId ?? null,
    error: envio.ok ? null : (envio.error ?? "No se pudo enviar el correo."),
  });
  const emailSent = envio.ok;

  if (emailSent) await marcarCotizacionEnviada(supabase, quote.id);

  return { ok: true, code: quote.code, pdf_url: pdfUrl, email_sent: emailSent, breakdown: desglose };
}
