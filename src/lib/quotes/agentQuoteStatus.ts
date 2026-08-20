import "server-only";

import { armarCorreoCotizacion } from "@/lib/quotes/quoteEmail";
import { armarCorreoPilgrim } from "@/lib/quotes/pilgrimEmail";
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
    .select("id,code,client_name,client_email,client_phone,route_name,start_date,end_date,people,modality,status,base_eur,season_supplement_eur,total_eur,cost_eur,pdf_path,email_sent_at,pilgrim_email_sent_at,notes,source")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return null;

  const [{ data: lines }, { data: travelers }, { data: contracts }] = await Promise.all([
    supabase.from("quote_lines").select("description,quantity,unit_price,total,type,reference_id").eq("quote_id", quoteId),
    supabase.from("quote_travelers").select("position,full_name,document_number").eq("quote_id", quoteId).order("position"),
    supabase.from("contracts").select("traveler_id,status,passport_path").eq("quote_id", quoteId),
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

  return {
    id: quote.id,
    code: quote.code,
    cliente: { nombre: quote.client_name, correo: quote.client_email, telefono: quote.client_phone },
    ruta: quote.route_name,
    salida: quote.start_date,
    regreso: quote.end_date,
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
