import { createCommercialClient } from "@/lib/supabase/server";
import { eur, fechaCorta } from "@/lib/format";
import { getTRMHoy } from "@/lib/trm";
import { renderTemplate } from "@/lib/emailTemplate";
import { DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { statusColor, statusLabel, isFullyPaid } from "@/lib/quoteStatus";
import { CATALOG_BASE_YEAR, optionalPricesForYear, quoteYear } from "@/lib/pricing/year";
import { notFound } from "next/navigation";
import Link from "next/link";
import QuoteEditor, { type CompanyLite } from "./QuoteEditor";
import ItineraryCard from "./ItineraryCard";
import { etapasCaminadas, etapasDeCondiciones, type EtapaItinerario } from "@/lib/quotes/itinerario";
import ClientPaymentsCard from "./ClientPaymentsCard";
import ProviderPaymentsCard from "./ProviderPaymentsCard";
import DocumentsCard from "./DocumentsCard";
import EmailPreviewCard from "./EmailPreviewCard";
import OptionalsCard, { type OptionalCatalog, type OptionalLine } from "./OptionalsCard";
import BikesCard, { type BikeLine } from "./BikesCard";
import { BIKE_COLUMNS, bikesForRouteYear, normalizeBike, normalizeBikePrice } from "@/lib/bikes/catalog";
import TravelDocCard, { type MarcadoEtiqueta, type NocheInicial, type HotelOpcion, type TravelDocEstado } from "./TravelDocCard";
import PilgrimFilesCard, { type PilgrimFile } from "./PilgrimFilesCard";
import { type EnvioResumen } from "./EstadoEnvio";
import ContractCard from "./ContractCard";
import PilgrimEmailCard from "./PilgrimEmailCard";
import WhatsAppCard from "./WhatsAppCard";
import type { ContractRow, TravelerRow } from "./contractActions";
import { buildDefaultVariables, getFirmantes } from "@/lib/contracts/render";
import { armarCorreoPilgrim, getPilgrimSettings } from "@/lib/quotes/pilgrimEmail";
import { habitacionesDeCotizacion, mensajeWhatsAppCotizacion, nombrePila } from "@/lib/quotes/mensajeWhatsApp";
import { getTravelDocTexts } from "@/lib/travelDocs/texts";
import { getMensajes } from "@/lib/mensajes/settings";
import { asegurarShareCode, urlCorta } from "@/lib/quotes/shareLink";

function basename(p: string | null): string | null {
  if (!p) return null;
  const parts = p.split("/");
  return parts[parts.length - 1] || null;
}

function findRouteMeta(
  routes:
    | Array<{ id: string; name: string; days?: number | null; nights?: number | null; origin?: string | null; destination?: string | null }>
    | null,
  routeName: string | null,
): { days: number | null; nights: number | null; origin: string | null; destination: string | null } | null {
  if (!routes || !routeName) return null;
  const r = routes.find((x) => x.name === routeName);
  if (!r) return null;
  return { days: r.days ?? null, nights: r.nights ?? null, origin: r.origin ?? null, destination: r.destination ?? null };
}

function buildTemplateVars(
  quote: Record<string, unknown>,
  total: number,
  trmRow: { eur_cop: number; date: string } | null,
  routeMeta: { days: number | null; nights: number | null; origin: string | null; destination: string | null } | null,
  cobrado = 0,
): Record<string, string | number | null | undefined> {
  const trm = trmRow?.eur_cop || 0;
  const totalCop = trm > 0 ? Math.round(total * trm) : null;
  const fmtEur = (n: number) =>
    new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n) + " €";
  const fmtCop = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
  const fechaLarga = (d: unknown) =>
    d
      ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(String(d)))
      : "";

  const fullName = String(quote.client_name || "").trim();
  const firstName = fullName.split(/\s+/)[0] || fullName;

  const fechasLargas =
    quote.start_date && quote.end_date
      ? `${fechaLarga(quote.start_date)} al ${fechaLarga(quote.end_date)}`
      : fechaLarga(quote.start_date) || fechaLarga(quote.end_date) || "";

  const days = routeMeta?.days ?? null;
  const nights = routeMeta?.nights ?? (days ? days - 1 : null);
  const duracion = days ? `${days} días${nights ? ` · ${nights} noches` : ""}` : "";

  const modality = String(quote.modality || "").toLowerCase();
  let alojamientoDesc = "";
  if (modality.includes("pensión doble") || modality.includes("pension doble")) {
    alojamientoDesc = "Pensión mayormente; en las localidades sin disponibilidad de pensión, alojamiento en hoteles · Habitación doble";
  } else if (modality.includes("pensión single") || modality.includes("pension single")) {
    alojamientoDesc = "Pensión mayormente; en las localidades sin disponibilidad de pensión, alojamiento en hoteles · Habitación individual";
  } else if (modality.includes("hotel doble")) {
    alojamientoDesc = "Hotel · Habitación doble";
  } else if (modality.includes("hotel single")) {
    alojamientoDesc = "Hotel · Habitación individual";
  } else if (modality) {
    alojamientoDesc = String(quote.modality);
  }

  const routeName = String(quote.route_name || "");
  const origin = routeMeta?.origin || "";
  const destination = routeMeta?.destination || "Santiago";
  const ruta = origin
    ? `Camino ${routeName.replace(/^Camino\s+/i, "")} — ${origin} → ${destination}`
    : routeName;
  const rutaDescripcion = origin
    ? `${routeName} desde ${origin} hasta ${destination}`
    : routeName;

  return {
    code: String(quote.code || ""),
    nombre: firstName,
    nombre_completo: fullName,
    ruta,
    ruta_descripcion: rutaDescripcion,
    dias_camino: days ? String(days - 1) : "", // días caminando = días - 1 (llegada)
    duracion,
    fechas_largas: fechasLargas,
    fechas: quote.start_date && quote.end_date ? `${fechaCorta(String(quote.start_date))} → ${fechaCorta(String(quote.end_date))}` : "",
    personas: String(quote.people || 1),
    alojamiento_descripcion: alojamientoDesc,
    precio_total: fmtEur(total),
    total_eur: fmtEur(total),
    total_cop: totalCop != null ? fmtCop(totalCop) : "—",
    trm: trm > 0 ? `1 EUR ≈ ${Math.round(trm).toLocaleString("es-CO")} COP` : "",
    validez: fechaLarga(quote.valid_until),
    // La plantilla `recordatorio_pago` lleva {{saldo_eur}} desde que se escribió, y ningún
    // constructor la producía: `renderTemplate` sustituye lo que no encuentra por cadena
    // vacía, así que ese correo habría salido diciendo "Saldo pendiente: **.**" — a un
    // cliente, pidiéndole plata (hallazgo de B4). Se calcula igual que `saldoCliente` de
    // esta misma pantalla.
    pagado_eur: fmtEur(cobrado),
    saldo_eur: fmtEur(Math.max(0, total - cobrado)),
  };
}

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createCommercialClient();
  const [
    { data: quote },
    { data: routes },
    { data: pricing },
    { data: cps },
    { data: pps },
    { data: emailTpl },
    { data: optsCatalog },
    { data: quoteLines },
    { data: seasonSetting },
    { data: nightsData },
    { data: travelDoc },
    { data: hotelOptions },
    { data: pilgrimFiles },
    { data: envios },
    { data: contractRows },
    { data: travelers },
    { data: bikeRows },
    { data: bikePriceRows },
    { data: childQuotes },
    trmRow,
  ] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", id).maybeSingle(),
    // `modality` viene de acá: es lo que decide si esta cotización es de camino en bici.
    supabase.from("routes").select("id,name,family,days,nights,km,origin,destination,modality,active").order("name"),
    supabase
      .from("pricing")
      // Todos los años: el editor filtra por el año de salida de la cotización.
      .select("route_id,modality,year,price_pilgrim,price_cs,routes(name)")
      .eq("season", "regular"),
    supabase.from("client_payments").select("*").eq("quote_id", id).order("paid_at", { ascending: false }),
    supabase.from("provider_payments").select("*").eq("quote_id", id).order("paid_at", { ascending: false }),
    // `active` se filtra igual que en el camino automático (lib/quotes/quoteEmail.ts): sin
    // este filtro, apagar la plantilla la seguía mostrando acá y la apagaba allá, o sea que
    // el interruptor hacía dos cosas opuestas. Si no hay plantilla activa, la tarjeta cae al
    // cuerpo mínimo pero ahora lo avisa en pantalla en vez de hacerlo callada.
    supabase
      .from("email_templates")
      .select("subject,body_md")
      .eq("slug", "cotizacion_enviada")
      .eq("active", true)
      .maybeSingle(),
    // Precios por año (migración 0019); se resuelve abajo con el año de salida.
    supabase
      .from("optional_services")
      .select("id,category,name,unit,optional_prices(year,price_pilgrim,price_cs)")
      .eq("active", true),
    // Opcionales y bicis en una sola consulta; se reparten abajo. Cada tarjeta recibe SOLO
    // las suyas: mezclarlas haría que desmarcar en una borrara líneas de la otra.
    supabase
      .from("quote_lines")
      .select("id,reference_id,description,quantity,unit_price,total,cost_unit,type")
      .eq("quote_id", id)
      .in("type", ["optional", "bike"]),
    supabase.from("settings").select("value").eq("key", "season_supplements").maybeSingle(),
    // Las noches del viaje. El hotel NO se lee acá: la tarjeta solo guarda a cuál apunta
    // cada noche, y el documento resuelve la ficha contra comercial.hotels al generarse.
    supabase
      .from("quote_hotels")
      .select("day,night_date,stage_label,km,city,hotel_id,room_label,regimen,notes,position")
      .eq("quote_id", id)
      .order("position"),
    supabase
      .from("travel_docs")
      .select("token,doc_pdf_path,doc_generated_at,insurance_pdf_path,luggage_tag_pdf_path,luggage_tag_original_path,luggage_tag_brand,sent_at,revoked_at,services")
      .eq("quote_id", id)
      .maybeSingle(),
    supabase.from("hotels").select("id,name,city").eq("active", true).order("city").order("name"),
    // El archivo de lo que nos manda Pilgrim. Es interno; no tiene nada que ver con la
    // documentación que se le envía al cliente.
    supabase
      .from("quote_pilgrim_files")
      .select("id,name,kind,storage_path,mime,size_bytes,notes,created_at")
      .eq("quote_id", id)
      .order("created_at", { ascending: false }),
    // Para el aviso de "enviado / sin enviar" de cada tarjeta de correo. Se traen también
    // las pruebas: son justo lo que hace dudar de si el correo de verdad ya salió.
    supabase
      .from("email_log")
      .select("tipo,prueba,created_at,estado")
      .eq("quote_id", id)
      .neq("estado", "error")
      .order("created_at", { ascending: false }),
    // Una cotización puede tener N contratos, uno por viajero.
    supabase.from("contracts").select("*").eq("quote_id", id),
    supabase
      .from("quote_travelers")
      .select("id,quote_id,position,full_name,email,phone,document_type,document_number,is_holder,passport_path,autoriza_imagen,marketing_optin,ficha_sent_at,ficha_completed_at")
      .eq("quote_id", id)
      .order("position"),
    // La flota es de 7 modelos y sus tarifas son un puñado de filas: se traen enteras y
    // `bikesForRouteYear` filtra por ruta y año, que solo se conocen con la cotización ya leída.
    supabase.from("bikes").select(BIKE_COLUMNS).eq("active", true).order("position"),
    supabase.from("bike_prices").select("bike_id,route_id,year,days,price_pilgrim,price_cs"),
    // Si de esta cotización nació otra con la bici elegida, hay que poder saltar a ella.
    supabase.from("quotes").select("id,code").eq("parent_quote_id", id).order("created_at"),
    getTRMHoy().catch(() => null),
  ]);
  const seasonConfig = ((seasonSetting?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS);

  if (!quote) notFound();

  // Quiénes pueden firmar por Camino Sacro (Nico o Nathalia).
  const firmantes = await getFirmantes(supabase);

  // Empresa contratante, si la hay. Su presencia es lo que pone el módulo de contratos en
  // modalidad empresa (migración 0036).
  const { data: company } = quote.company_id
    ? await supabase
        .from("companies")
        .select("id,legal_name,nit,address,city,email,phone,rep_name,rep_document_type,rep_document_number")
        .eq("id", quote.company_id)
        .maybeSingle()
    : { data: null };

  // Si aún no hay contratos, precargamos las variables desde la cotización para
  // que el equipo las revise ANTES de crearlos.
  let contractDefaults = null;
  if (!contractRows?.length) {
    const d = await buildDefaultVariables(supabase, id);
    if (d.ok) contractDefaults = d.variables;
  }

  // El correo a Pilgrim se arma en el servidor a partir del costo ya corregido y de
  // los viajeros con su pasaporte; en la tarjeta se puede editar antes de enviar.
  // `travelDocTexts` se trae por el contacto: la web y el WhatsApp de la agencia viven en
  // settings, no en el código, y son los mismos que ya usan el correo de cotización y la
  // documentación de viaje. Un dato, un lugar.
  const [pilgrimSettings, pilgrimArmado, travelDocTexts, mensajes] = await Promise.all([
    getPilgrimSettings(supabase),
    armarCorreoPilgrim(supabase, id),
    getTravelDocTexts(supabase),
    getMensajes(supabase),
  ]);
  const pilgrimMail = pilgrimArmado.ok
    ? pilgrimArmado.correo
    : { subject: "", body: "", adjuntos: [], pendientes: [], total: 0 };

  // Resumen de envíos por tipo de correo. La marca de "enviado" NO sale de aquí sino de
  // las columnas del expediente (`quotes.email_sent_at`, `travel_docs.sent_at`), que son
  // las que solo se escriben en un envío real; del registro solo se cuentan las pruebas.
  type FilaEnvio = { tipo: string; prueba: boolean; created_at: string };
  const filasEnvio = ((envios as FilaEnvio[] | null) || []);
  function resumenEnvio(tipo: string, enviadoAt: string | null): EnvioResumen {
    const pruebas = filasEnvio.filter((e) => e.tipo === tipo && e.prueba);
    return {
      enviadoAt,
      pruebas: pruebas.length,
      ultimaPruebaAt: pruebas[0]?.created_at ?? null,
    };
  }

  // Estado del expediente de documentación. Todavía puede no existir: se crea al generar
  // el documento, al subir el seguro o al activar el enlace, lo que pase primero.
  const doc = travelDoc as {
    token: string | null; doc_pdf_path: string | null; doc_generated_at: string | null;
    insurance_pdf_path: string | null; luggage_tag_pdf_path: string | null;
    luggage_tag_original_path: string | null; luggage_tag_brand: MarcadoEtiqueta | null;
    sent_at: string | null; revoked_at: string | null; services: string[] | null;
  } | null;
  const estadoDocumentacion: TravelDocEstado = {
    token: doc?.token ?? null,
    docPath: doc?.doc_pdf_path ?? null,
    docGeneratedAt: doc?.doc_generated_at ?? null,
    insurancePath: doc?.insurance_pdf_path ?? null,
    luggageTagPath: doc?.luggage_tag_pdf_path ?? null,
    luggageTagOriginalPath: doc?.luggage_tag_original_path ?? null,
    luggageTagMarcado: doc?.luggage_tag_brand ?? null,
    sentAt: doc?.sent_at ?? null,
    revokedAt: doc?.revoked_at ?? null,
    services: Array.isArray(doc?.services) ? (doc!.services as string[]) : [],
  };

  // El enlace del cliente sale con APP_BASE_URL, la misma base que usa el de firma del
  // contrato: en local, sin ella, se copiaría un localhost que no le sirve a nadie.
  const appBaseUrl = (process.env.APP_BASE_URL || "").replace(/\/$/, "")
    || "https://caminosacro-platform-production.up.railway.app";

  // La Asistencia en Viaje es genérica y se genera desde Configuración: la tarjeta avisa
  // si todavía no existe, porque sin ella el correo sale con un botón de descarga muerto.
  const { data: asistenciaFiles } = await supabase.storage
    .from("comercial-docs")
    .list("generico", { search: "Asistencia-en-Viaje-Camino-Sacro.pdf" });
  const asistenciaLista = (asistenciaFiles || []).length > 0;

  const cobrado = (cps || []).reduce((s, p) => {
    const v = p.amount_eur ?? (p.currency === "EUR" ? p.amount : 0);
    return s + (Number(v) || 0);
  }, 0);
  const pagadoPilgrim = (pps || []).reduce((s, p) => s + (Number(p.amount_eur) || 0), 0);
  const total = Number(quote.total_eur) || 0;
  const cost = Number(quote.cost_eur) || 0;
  const saldoCliente = total - cobrado;
  const saldoProveedor = cost - pagadoPilgrim;
  const utilidad = total - cost;
  const margenReal = cobrado - pagadoPilgrim;

  const pricingFlat = ((pricing as unknown as Array<{
    route_id: string;
    modality: string;
    year: number | null;
    price_pilgrim: string | number | null;
    price_cs: string | number | null;
    routes: { name: string } | null;
  }>) || []).map((p) => ({
    route_id: p.route_id,
    route_name: p.routes?.name ?? "",
    modality_slug: p.modality,
    year: Number(p.year) || CATALOG_BASE_YEAR,
    price_pilgrim: Number(p.price_pilgrim) || 0,
    price_cs: Number(p.price_cs) || 0,
  }));

  // Precio de cada opcional para el año de salida. Si ese año todavía no está cargado se
  // usa el anterior y se marca `isFallback`: la tarjeta lo avisa en ámbar. A diferencia de
  // las tarifas de ruta, acá no hay dónde teclear el precio a mano, así que bloquear
  // dejaría sin extras a las cotizaciones del año nuevo.
  const optionalYear = quoteYear(quote.start_date);
  const optionalPriceRows = ((optsCatalog as unknown as Array<{ id: string; optional_prices: Array<{ year: number; price_pilgrim: number | string | null; price_cs: number | string | null }> | null }>) || [])
    .flatMap((o) => (o.optional_prices || []).map((p) => ({
      optional_id: o.id,
      year: Number(p.year),
      price_pilgrim: Number(p.price_pilgrim) || 0,
      price_cs: Number(p.price_cs) || 0,
    })));
  const optionalPrices = optionalPricesForYear(optionalPriceRows, optionalYear);
  const optionalsCatalog: OptionalCatalog[] = ((optsCatalog as unknown as Array<{ id: string; category: string; name: string; unit: string | null }>) || [])
    .map((o) => {
      const precio = optionalPrices.get(o.id);
      return {
        id: o.id,
        category: o.category,
        name: o.name,
        unit: o.unit ?? "",
        price_cs: precio?.price_cs ?? 0,
        price_pilgrim: precio?.price_pilgrim ?? 0,
        priceYear: precio?.priceYear ?? optionalYear,
        isFallback: precio?.isFallback ?? false,
      };
    })
    .filter((o) => o.price_cs > 0);

  // Reparto de las líneas: la tarjeta de opcionales nunca ve una bici y viceversa.
  const todasLasLineas = ((quoteLines as unknown) as Array<OptionalLine & { type: string }> | null) || [];
  const normalizarLinea = (l: OptionalLine) => ({
    id: l.id,
    reference_id: l.reference_id,
    description: l.description,
    quantity: Number(l.quantity) || 1,
    unit_price: Number(l.unit_price) || 0,
    total: Number(l.total) || 0,
    cost_unit: Number(l.cost_unit) || 0,
  });
  const optionalLines = todasLasLineas.filter((l) => l.type === "optional").map(normalizarLinea);
  const bikeLines: BikeLine[] = todasLasLineas.filter((l) => l.type === "bike").map(normalizarLinea);

  // La ruta de la cotización: por `route_id` y, en las viejas que no lo tienen, por nombre
  // (es como la resuelve el resto de la página).
  const routeRow = (routes || []).find((r) => (quote.route_id ? r.id === quote.route_id : r.name === quote.route_name));
  const esRutaBici = String(routeRow?.modality || "").toLowerCase() === "bici";
  const bikes = esRutaBici
    ? bikesForRouteYear(
        ((bikeRows as unknown as Record<string, unknown>[]) || []).map(normalizeBike),
        ((bikePriceRows as unknown as Record<string, unknown>[]) || []).map(normalizeBikePrice),
        routeRow?.id ?? null,
        optionalYear,
      )
    : [];

  // El itinerario: el del catálogo de la ruta y el pactado con este cliente, si lo hay.
  // Se consulta acá porque la ruta solo se conoce después de leer la cotización.
  let etapasCatalogo: EtapaItinerario[] = [];
  if (routeRow?.id) {
    const { data: st } = await supabase
      .from("route_stages")
      .select("day,from_place,to_place,km,accommodation")
      .eq("route_id", routeRow.id)
      .order("day");
    etapasCatalogo = etapasCaminadas(
      ((st || []) as Array<{ day: number; from_place: string | null; to_place: string | null; km: number | string | null; accommodation: string | null }>).map((e) => ({
        day: e.day,
        from_place: e.from_place,
        to_place: e.to_place,
        km: e.km != null ? Number(e.km) : null,
        accommodation: e.accommodation,
      })),
    );
  }
  const etapasPropias = etapasDeCondiciones(quote.condiciones_json);

  // De qué cotización nació esta. Se consulta aparte porque el id del padre solo se conoce
  // después de leer la cotización.
  let parentQuote: { id: string; code: string } | null = null;
  if (quote.parent_quote_id) {
    const { data } = await supabase.from("quotes").select("id,code").eq("id", quote.parent_quote_id).maybeSingle();
    parentQuote = (data as { id: string; code: string } | null) ?? null;
  }
  const hijas = ((childQuotes as unknown) as Array<{ id: string; code: string }> | null) || [];

  // El mensaje de WhatsApp para el peregrino. Se arma acá, con los datos ya resueltos de
  // esta cotización (la ruta con su origen, el reparto de habitaciones con su precio por
  // persona, el total) y en la tarjeta se edita antes de mandarlo.
  //
  // El enlace que va en el mensaje es el corto de la cotización (/c/[code], migración
  // 0048), no la versión web del correo: aquella solo existe si el correo ya salió —y esta
  // tarjeta se usa justo antes—, y medía 48 caracteres de token. El código se crea la
  // primera vez que se abre el expediente y no cambia nunca más.
  const shareCode = await asegurarShareCode(supabase, id, (quote.share_code as string | null) ?? null);
  const enlaceCotizacion = shareCode ? urlCorta(shareCode) : null;
  const rutaMeta = findRouteMeta(routes, quote.route_name);
  const mensajeWhatsApp = mensajeWhatsAppCotizacion({
    cliente: quote.client_name ?? null,
    ruta: quote.route_name ?? null,
    origen: rutaMeta?.origin ?? null,
    fechaInicio: quote.start_date ?? null,
    fechaFin: quote.end_date ?? null,
    dias: rutaMeta?.days ?? null,
    noches: rutaMeta?.nights ?? (rutaMeta?.days ? rutaMeta.days - 1 : null),
    personas: Number(quote.people) || 1,
    alojamiento: quote.modality ?? null,
    totalEur: total,
    habitaciones: habitacionesDeCotizacion(quote.rooms_json),
    emailCliente: quote.client_email ?? null,
    enlaceCotizacion,
    asesor: nombrePila(firmantes[0]?.nombre) || "Nicolás",
    web: travelDocTexts.contacto.web || "www.caminosacro.com",
    textos: mensajes,
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <Link href="/seguimiento" className="text-sm text-muted hover:text-fg">← Volver al seguimiento</Link>
      </div>

      <header className="bg-bg-card border border-border rounded-xl px-5 py-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-display text-3xl text-bosque">
              {quote.code}
              {(quote.source === "wordpress" || quote.source === "web") && (
                <span className="ml-2 align-middle text-[11px] px-2 py-0.5 rounded bg-dorado-oscuro/15 text-dorado-oscuro font-sans font-semibold uppercase tracking-wide">Web</span>
              )}
              {quote.source === "baymax" && (
                <span className="ml-2 align-middle text-[11px] px-2 py-0.5 rounded bg-bosque-medio/15 text-bosque-medio font-sans font-semibold uppercase tracking-wide">BayMax</span>
              )}
            </h1>
            <p className="text-muted text-sm mt-1">
              {quote.client_name || "Sin cliente"}
              {quote.route_name ? ` · ${quote.route_name}` : ""}
            </p>
            {/* El camino en bici deja dos cotizaciones del mismo peregrino (la de la flota y la
                de la bici elegida). Sin estos enlaces se confunden y se trabaja sobre la vieja. */}
            {(parentQuote || hijas.length > 0) && (
              <p className="text-xs mt-2 flex items-center gap-3 flex-wrap">
                {parentQuote && (
                  <Link href={`/seguimiento/${parentQuote.id}`} className="text-bosque-medio hover:underline">
                    ← Viene de {parentQuote.code}
                  </Link>
                )}
                {hijas.map((h) => (
                  <Link key={h.id} href={`/seguimiento/${h.id}`} className="text-bosque-medio hover:underline">
                    Continúa en {h.code} →
                  </Link>
                ))}
              </p>
            )}
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${statusColor(quote.status)}`}>{statusLabel(quote.status)}</span>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card label="Total cotizado" value={eur(total)} />
        <Card label="Costo Pilgrim" value={eur(cost)} muted />
        <Card label="Utilidad proyect." value={eur(utilidad)} accent />
        <Card label="Saldo cliente" value={eur(saldoCliente)} warn={saldoCliente > 0} />
        <Card label="Margen real" value={eur(margenReal)} accent />
      </section>

      {/* Orden del expediente: la cotización con su correo → el contrato → el correo
          a Pilgrim → los hoteles → los pagos. Sigue el recorrido real de una venta:
          los contratos se firman ANTES del correo a Pilgrim, que es justo cuando
          entran los números de pasaporte que ese correo necesita. */}
      <QuoteEditor
        quote={quote}
        routes={routes || []}
        pricing={pricingFlat}
        seasonConfig={seasonConfig}
        company={(company as CompanyLite | null) ?? null}
      />

      <ItineraryCard
        quoteId={id}
        routeName={quote.route_name}
        startDate={quote.start_date}
        endDate={quote.end_date}
        etapasCatalogo={etapasCatalogo}
        etapasPropias={etapasPropias}
      />

      <OptionalsCard
        quoteId={id}
        catalog={optionalsCatalog}
        selected={optionalLines}
        baseEur={Number(quote.base_eur) || total}
        totalEur={total}
        seasonSupplementEur={Number(quote.season_supplement_eur) || 0}
        people={quote.people}
        quoteYear={optionalYear}
      />

      {esRutaBici && (
        <BikesCard
          quoteId={id}
          bikes={bikes}
          selected={bikeLines}
          totalEur={total}
          people={quote.people}
          quoteYear={optionalYear}
        />
      )}

      <DocumentsCard
        quoteId={id}
        storagePath={quote.pdf_path}
        filename={basename(quote.pdf_path)}
      />

      <EmailPreviewCard
        quoteId={id}
        to={quote.client_email || ""}
        sinPlantilla={!emailTpl}
        envio={resumenEnvio("cliente", quote.email_sent_at ?? null)}
        subject={renderTemplate(
          emailTpl?.subject || "Cotización {{code}} - Camino Sacro",
          buildTemplateVars(quote, total, trmRow, findRouteMeta(routes, quote.route_name), cobrado),
        )}
        body={renderTemplate(
          emailTpl?.body_md || "Hola {{nombre}}, te envío la cotización adjunta.\n\nBuen Camino,\nCamino Sacro",
          buildTemplateVars(quote, total, trmRow, findRouteMeta(routes, quote.route_name), cobrado),
        )}
      />

      {/* Pegada al correo del cliente porque es el mismo encargo por el otro canal: a la
          gente que cotizó en la web sin precio se le escribe por WhatsApp, y ahí hay que
          repetirle lo que dice el correo. Nace plegada. */}
      <WhatsAppCard
        telefonoInicial={quote.client_phone || ""}
        mensajeInicial={mensajeWhatsApp}
        enlaceCotizacion={enlaceCotizacion}
        pdfPath={quote.pdf_path ?? null}
        pdfNombre={`Cotizacion-${quote.code}.pdf`}
        envio={resumenEnvio("cliente", quote.email_sent_at ?? null)}
      />

      <ContractCard
        quoteId={id}
        quoteCode={quote.code}
        people={Number(quote.people) || 1}
        travelers={(travelers as TravelerRow[] | null) ?? []}
        contracts={(contractRows as ContractRow[] | null) ?? []}
        sharedVariables={contractDefaults}
        totalEur={total}
        companyName={(company as CompanyLite | null)?.legal_name ?? null}
        firmantes={firmantes}
      />

      <PilgrimEmailCard
        quoteId={id}
        to={pilgrimSettings.email}
        sentAt={quote.pilgrim_email_sent_at ?? null}
        subject={pilgrimMail.subject}
        body={pilgrimMail.body}
        adjuntos={pilgrimMail.adjuntos}
        pendientes={pilgrimMail.pendientes}
      />

      <PilgrimFilesCard
        quoteId={id}
        files={((pilgrimFiles as unknown) as PilgrimFile[]) || []}
      />

      {/* La puerta es el SALDO, no la etiqueta.
          Antes esta tarjeta solo se dibujaba si el estado decía «pago completo», y como
          cobrar no movía el estado, un cliente que ya había pagado no recibía sus documentos
          porque la plataforma creía que no había pagado (§2.6). Le pasaba a CS-2026-004: 970
          de 970 € cobrados. Ahora el estado se mueve solo al cobrar, pero la puerta mira el
          dinero de todas formas: es el dato duro, y las 45 cotizaciones anteriores a ese
          cambio no lo tienen reflejado en su etiqueta. `isFullyPaid` se mantiene como
          segunda vía para los estados que pone una persona a mano («completada»). */}
      {(saldoCliente <= 0.01 && total > 0) || isFullyPaid(quote.status) ? (
        <TravelDocCard
          quoteId={id}
          quoteCode={quote.code}
          clientName={quote.client_name ?? null}
          clientEmail={quote.client_email ?? ""}
          routeName={quote.route_name ?? null}
          hotels={((hotelOptions as unknown) as HotelOpcion[]) || []}
          initialNights={((nightsData as unknown) as NocheInicial[]) || []}
          estado={estadoDocumentacion}
          envio={resumenEnvio("documentacion", estadoDocumentacion.sentAt)}
          baseUrl={appBaseUrl}
          asistenciaLista={asistenciaLista}
          pilgrimRef={(quote.pilgrim_ref as string | null) ?? null}
          // Un viaje de grupo lo compran entre varios y todos necesitan la documentación:
          // la tarjeta ofrece sumarlos al envío de un clic, sin volver a teclear correos.
          travelerEmails={((travelers as TravelerRow[] | null) ?? [])
            .filter((t) => !!t.email)
            .map((t) => ({ nombre: t.full_name || "", email: String(t.email) }))}
        />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ClientPaymentsCard quoteId={id} payments={cps || []} cobrado={cobrado} saldo={saldoCliente} />
        <ProviderPaymentsCard quoteId={id} payments={pps || []} pagado={pagadoPilgrim} saldo={saldoProveedor} />
      </div>
    </div>
  );
}

function Card({ label, value, accent, muted, warn }: { label: string; value: string; accent?: boolean; muted?: boolean; warn?: boolean }) {
  const color = warn ? "text-amber-700" : accent ? "text-dorado-oscuro" : muted ? "text-muted" : "text-bosque";
  return (
    <div className="bg-bg-card border border-border rounded-xl px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-display text-xl mt-1 ${color}`}>{value}</div>
    </div>
  );
}
