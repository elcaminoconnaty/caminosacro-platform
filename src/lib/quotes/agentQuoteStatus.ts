import "server-only";

import { armarCorreoCotizacion } from "@/lib/quotes/quoteEmail";
import { armarCorreoPilgrim } from "@/lib/quotes/pilgrimEmail";
import { firmarPdf } from "@/lib/quotes/pdfUrl";
import { quoteYear } from "@/lib/pricing/year";
import { FIANZA_POR_BICI_EUR } from "@/lib/bikes/catalog";
import type { ComercialClient } from "@/lib/quotes/pdf";

/**
 * Estado de un expediente para BayMax, con la lista de lo que falta.
 *
 * `faltantes` es la pieza que hace que el agente no invente: en vez de confiar en
 * que el modelo se acuerde de que el correo a Pilgrim necesita pasaportes, la
 * respuesta lo dice con nombre propio y él solo tiene que leerlo.
 */

/** Acepta el UUID o el código CS-AAAA-NNN: por Telegram nadie escribe un UUID. */
export async function resolverCotizacion(supabase: ComercialClient, idOCodigo: string): Promise<string | null> {
  const texto = idOCodigo.trim();
  const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto);
  const { data } = await supabase
    .from("quotes")
    .select("id")
    .eq(esUuid ? "id" : "code", esUuid ? texto : texto.toUpperCase())
    .maybeSingle();
  return data?.id ?? null;
}

export async function estadoCotizacion(supabase: ComercialClient, quoteId: string) {
  const { data: quote } = await supabase
    .from("quotes")
    .select("id,code,client_name,client_email,client_phone,route_id,route_name,start_date,end_date,valid_until,people,modality,status,base_eur,season_supplement_eur,total_eur,cost_eur,pdf_path,email_sent_at,pilgrim_email_sent_at,notes,source,parent_quote_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return null;

  // `id` de cada línea: es lo que hace falta para cambiarle la cantidad después, igual que
  // el campito de al lado de cada opcional en la pantalla.
  const [{ data: lines }, { data: travelers }, { data: contracts }, { data: hijas }] = await Promise.all([
    supabase.from("quote_lines").select("id,description,quantity,unit_price,total,type,reference_id").eq("quote_id", quoteId),
    supabase.from("quote_travelers").select("position,full_name,document_number").eq("quote_id", quoteId).order("position"),
    supabase.from("contracts").select("traveler_id,status,passport_path").eq("quote_id", quoteId),
    // El camino en bici deja dos cotizaciones del mismo peregrino: sin este enlace se
    // confunden y se termina trabajando sobre la vieja.
    supabase.from("quotes").select("id,code").eq("parent_quote_id", quoteId).order("created_at"),
  ]);

  const personas = Number(quote.people) || 0;
  const viajeros = travelers || [];
  const conPasaporte = (contracts || []).filter((c) => c.passport_path).length;

  const faltantes: string[] = [];
  if (!quote.client_email) faltantes.push("correo_cliente");
  if (!quote.pdf_path) faltantes.push("pdf");
  if (viajeros.length < personas) faltantes.push("viajeros");
  if (viajeros.some((t) => !t.document_number)) faltantes.push("pasaportes_sin_numero");
  if (conPasaporte < personas) faltantes.push("pasaportes_sin_foto");

  // Los borradores que BayMax le muestra a Nico salen de aquí, no del modelo:
  // son exactamente los mismos que pintan las tarjetas del CRM.
  const correoCliente = await armarCorreoCotizacion(supabase, quoteId);
  const armadoPilgrim = await armarCorreoPilgrim(supabase, quoteId);

  // ¿Es un camino en bici? Cambia lo que hay que contarle al peregrino (fianza, tallas) y
  // habilita el paso de la cotización con la bici elegida.
  let esRutaBici = false;
  if (quote.route_id || quote.route_name) {
    const q = supabase.from("routes").select("modality");
    const { data: r } = quote.route_id
      ? await q.eq("id", quote.route_id).maybeSingle()
      : await q.eq("name", quote.route_name).maybeSingle();
    esRutaBici = String(r?.modality || "").toLowerCase() === "bici";
  }
  const lineasBici = (lines || []).filter((l) => l.type === "bike");
  const unidadesBici = lineasBici.reduce((s, l) => s + (Number(l.quantity) || 0), 0);

  let padre: { id: string; code: string } | null = null;
  if (quote.parent_quote_id) {
    const { data } = await supabase.from("quotes").select("id,code").eq("id", quote.parent_quote_id).maybeSingle();
    padre = (data as { id: string; code: string } | null) ?? null;
  }

  return {
    id: quote.id,
    code: quote.code,
    cliente: { nombre: quote.client_name, correo: quote.client_email, telefono: quote.client_phone },
    ruta: quote.route_name,
    salida: quote.start_date,
    regreso: quote.end_date,
    valida_hasta: quote.valid_until,
    ano_tarifa: quoteYear(quote.start_date),
    personas,
    modalidad: quote.modality,
    estado: quote.status,
    origen: quote.source,
    notas: quote.notes,
    dinero: {
      base_eur: Number(quote.base_eur) || 0,
      suplemento_eur: Number(quote.season_supplement_eur) || 0,
      total_eur: Number(quote.total_eur) || 0,
      costo_pilgrim_eur: Number(quote.cost_eur) || 0,
    },
    lineas: lines || [],
    viajeros: viajeros.map((t) => ({ posicion: t.position, nombre: t.full_name, documento: t.document_number })),
    pasaportes_adjuntos: conPasaporte,
    pdf: !!quote.pdf_path,
    pdf_url: await firmarPdf(supabase, quoteId),
    // El expediente en bici: la fianza NO entra al total, se cobra y se devuelve aparte.
    bici: esRutaBici
      ? {
          ruta_en_bici: true,
          marcadas: lineasBici.length,
          unidades: unidadesBici,
          fianza_por_bici_eur: FIANZA_POR_BICI_EUR,
          fianza_total_eur: unidadesBici * FIANZA_POR_BICI_EUR,
        }
      : { ruta_en_bici: false },
    viene_de: padre,
    continua_en: (hijas || []) as Array<{ id: string; code: string }>,
    correo_cliente_enviado_en: quote.email_sent_at,
    correo_pilgrim_enviado_en: quote.pilgrim_email_sent_at,
    borrador_cliente: correoCliente,
    borrador_pilgrim: armadoPilgrim.ok
      ? {
          subject: armadoPilgrim.correo.subject,
          body: armadoPilgrim.correo.body,
          adjuntos: armadoPilgrim.correo.adjuntos.length,
          pendientes: armadoPilgrim.correo.pendientes,
        }
      : null,
    faltantes,
  };
}
