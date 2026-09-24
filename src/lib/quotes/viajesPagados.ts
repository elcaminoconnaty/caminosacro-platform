import "server-only";

import type { ComercialClient } from "@/lib/quotes/pdf";
import { etapasCaminadas, etapasDeCondiciones } from "@/lib/quotes/itinerario";
import { extrasDeLineas, habitacionesDelGrupo } from "@/lib/quotes/extrasItinerario";
import { fechasDelViaje, type FechasViaje } from "@/lib/quotes/fechasViaje";

/** Con cualquier pago ya hay reserva que cuidar: el parcial también entra. */
export const ESTADOS_PAGADOS = ["pago_parcial", "pago_completo", "completada"] as const;

export type ViajePagado = {
  id: string;
  code: string;
  client_name: string | null;
  route_name: string | null;
  people: number | null;
  status: string;
  /** null = no se pudo calcular (sin salida o sin itinerario); se lista aparte para arreglarlo. */
  fechas: FechasViaje | null;
};

type QuoteRow = {
  id: string;
  code: string;
  client_name: string | null;
  route_id: string | null;
  route_name: string | null;
  start_date: string | null;
  people: number | null;
  status: string;
  condiciones_json: unknown;
  rooms_json: unknown;
  modality: string | null;
};

/**
 * Los viajes pagados con sus cuatro fechas. El itinerario sale igual que en el PDF y la
 * carta: el propio de la cotización o, si no tiene, el del catálogo (por id o por nombre de
 * ruta), más las noches extra de las líneas opcionales. Todo en cuatro consultas, no por viaje.
 */
export async function viajesPagados(supabase: ComercialClient): Promise<{ viajes: ViajePagado[]; error: unknown }> {
  const { data, error } = await supabase
    .from("quotes")
    .select("id,code,client_name,route_id,route_name,start_date,people,status,condiciones_json,rooms_json,modality")
    .in("status", ESTADOS_PAGADOS as unknown as string[])
    .order("start_date", { ascending: true })
    .limit(1000);
  if (error) return { viajes: [], error };
  const quotes = (data ?? []) as QuoteRow[];
  if (quotes.length === 0) return { viajes: [], error: null };

  const ids = quotes.map((q) => q.id);
  const [{ data: lineas, error: eLineas }, { data: servicios, error: eServ }, { data: rutas, error: eRutas }] = await Promise.all([
    supabase
      .from("quote_lines")
      .select("quote_id,description,quantity,reference_id")
      .in("quote_id", ids)
      .eq("type", "optional"),
    // Solo los activos, igual que el PDF de la cotización y la carta.
    supabase.from("optional_services").select("id,category").eq("active", true),
    supabase.from("routes").select("id,name"),
  ]);
  if (eLineas || eServ || eRutas) return { viajes: [], error: eLineas || eServ || eRutas };

  const categorias = new Map<string, string>();
  for (const s of (servicios ?? []) as Array<{ id: string; category: string }>) categorias.set(s.id, s.category);

  const rutaPorNombre = new Map<string, string>();
  for (const r of (rutas ?? []) as Array<{ id: string; name: string }>) rutaPorNombre.set(r.name, r.id);
  const rutaDe = (q: QuoteRow) => q.route_id ?? (q.route_name ? rutaPorNombre.get(q.route_name) ?? null : null);

  // Etapas del catálogo solo para las cotizaciones que no traen las suyas.
  const propias = new Map(quotes.map((q) => [q.id, etapasCaminadas(etapasDeCondiciones(q.condiciones_json)).length]));
  const rutasFaltantes = [...new Set(quotes.filter((q) => !propias.get(q.id)).map(rutaDe).filter(Boolean) as string[])];
  const etapasCatalogo = new Map<string, number>();
  if (rutasFaltantes.length > 0) {
    const { data: st, error: eSt } = await supabase
      .from("route_stages")
      .select("route_id,km")
      .in("route_id", rutasFaltantes);
    if (eSt) return { viajes: [], error: eSt };
    for (const s of (st ?? []) as Array<{ route_id: string; km: number | string | null }>) {
      if ((Number(s.km) || 0) > 0) etapasCatalogo.set(s.route_id, (etapasCatalogo.get(s.route_id) ?? 0) + 1);
    }
  }

  const lineasPorQuote = new Map<string, Array<{ description: string; quantity: number | string; reference_id: string | null }>>();
  for (const l of (lineas ?? []) as Array<{ quote_id: string; description: string; quantity: number | string; reference_id: string | null }>) {
    const arr = lineasPorQuote.get(l.quote_id);
    if (arr) arr.push(l);
    else lineasPorQuote.set(l.quote_id, [l]);
  }

  const viajes = quotes.map((q): ViajePagado => {
    const ruta = rutaDe(q);
    const etapas = propias.get(q.id) || (ruta ? etapasCatalogo.get(ruta) ?? 0 : 0);
    const extras = extrasDeLineas(lineasPorQuote.get(q.id) ?? [], categorias, habitacionesDelGrupo(q));
    return {
      id: q.id,
      code: q.code,
      client_name: q.client_name,
      route_name: q.route_name,
      people: q.people,
      status: q.status,
      fechas: fechasDelViaje(q.start_date, etapas, extras?.extraNights ?? 0),
    };
  });
  return { viajes, error: null };
}
