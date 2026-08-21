import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoAgente, noAutorizado } from "../auth";
import { coincideCotizacion, mismoTelefono, normalizarTexto, pareceTelefono } from "@/lib/quotes/buscar";
import { isQuoteStatus } from "@/lib/quoteStatus";

export const dynamic = "force-dynamic";

/** Tope de lo que se trae de la base. Hoy hay ~80 cotizaciones; el filtro fino se hace acá
 *  con la misma regla que la tabla del CRM, no con un `ilike` que no sabe de tildes. */
const MAX_FILAS = 1000;

/**
 * GET /api/agente/cotizaciones?q=...&estado=...&desde=...&hasta=...&limite=N
 *
 * Buscar cotizaciones por lo que uno se acuerda del cliente: nombre, teléfono, correo, ruta
 * o código. Existe porque hasta ahora BayMax solo sabía llegar a una cotización si Nico le
 * daba el código exacto — y por Telegram nadie se acuerda de un `CS-2026-034`; se acuerda de
 * "la de Isabel" o del celular por el que escribió.
 *
 * `q` vacío devuelve las más recientes, que es la otra pregunta natural: "¿qué se cotizó esta
 * semana?".
 *
 * La regla de coincidencia es la de `@/lib/quotes/buscar`, la misma que usa el buscador de
 * Seguimiento: si algo aparece en la pantalla tiene que aparecer por Telegram.
 */
export async function GET(request: Request) {
  if (!autorizadoAgente(request)) return noAutorizado();

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const estado = (url.searchParams.get("estado") ?? "").trim();
  const desde = (url.searchParams.get("desde") ?? "").trim();
  const hasta = (url.searchParams.get("hasta") ?? "").trim();
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite")) || 20, 1), 100);

  if (estado && !isQuoteStatus(estado)) {
    return Response.json({ ok: false, error: "estado_invalido", detalle: `Estado desconocido: ${estado}.` }, { status: 422 });
  }

  const supabase = createAdminClient("comercial");

  let consulta = supabase
    .from("quotes")
    .select(
      "id,code,client_id,client_name,client_phone,client_email,route_name,start_date,end_date,people,modality,total_eur,cost_eur,status,source,valid_until,pdf_path,email_sent_at,parent_quote_id,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(MAX_FILAS);
  if (estado) consulta = consulta.eq("status", estado);
  if (desde) consulta = consulta.gte("start_date", desde);
  if (hasta) consulta = consulta.lte("start_date", hasta);

  const { data, error } = await consulta;
  if (error) return Response.json({ ok: false, error: "interno" }, { status: 500 });

  type Fila = {
    id: string; code: string; client_id: string | null; client_name: string | null; client_phone: string | null;
    client_email: string | null; route_name: string | null; start_date: string | null; end_date: string | null;
    people: number | null; modality: string | null; total_eur: number | string | null; cost_eur: number | string | null;
    status: string | null; source: string | null; valid_until: string | null; pdf_path: string | null;
    email_sent_at: string | null; parent_quote_id: string | null; created_at: string | null;
  };
  const filas = (data || []) as Fila[];

  // El cliente del directorio también cuenta: una cotización vieja puede tener el correo
  // desactualizado en la fila y el bueno en `clients`. Sin esto, buscar por el correo con el
  // que la persona escribe hoy no encontraría su cotización de hace seis meses.
  const idsPorCliente = new Set<string>();
  if (q) {
    const { data: clientes } = await supabase.from("clients").select("id,full_name,phone,email").limit(MAX_FILAS);
    for (const c of (clientes || []) as Array<{ id: string; full_name: string | null; phone: string | null; email: string | null }>) {
      const texto = [c.full_name, c.email].map(normalizarTexto).join(" ");
      const porTelefono = pareceTelefono(q) && mismoTelefono(c.phone, q);
      if (porTelefono || (normalizarTexto(q) && texto.includes(normalizarTexto(q)))) idsPorCliente.add(c.id);
    }
  }

  const encontradas = filas.filter(
    (f) => coincideCotizacion(f, q) || (f.client_id ? idsPorCliente.has(f.client_id) : false),
  );

  // Cobrado y saldo solo de lo encontrado: es la pregunta que sigue casi siempre después de
  // "buscá la de Fulano" — "¿y cuánto debe?".
  const ids = encontradas.slice(0, limite).map((f) => f.id);
  const cobradoPorCotizacion = new Map<string, number>();
  if (ids.length) {
    const { data: pagos } = await supabase
      .from("client_payments")
      .select("quote_id,amount,amount_eur,currency")
      .in("quote_id", ids);
    for (const p of (pagos || []) as Array<{ quote_id: string; amount: number | string | null; amount_eur: number | string | null; currency: string | null }>) {
      // Un pago en pesos sin TRM no tiene equivalente en euros: no se adivina, se ignora.
      const v = p.amount_eur != null ? Number(p.amount_eur) : p.currency === "EUR" ? Number(p.amount) : 0;
      cobradoPorCotizacion.set(p.quote_id, (cobradoPorCotizacion.get(p.quote_id) || 0) + (v || 0));
    }
  }

  const resultados = encontradas.slice(0, limite).map((f) => {
    const total = Number(f.total_eur) || 0;
    const cobrado = cobradoPorCotizacion.get(f.id) || 0;
    return {
      id: f.id,
      code: f.code,
      cliente: { nombre: f.client_name, telefono: f.client_phone, correo: f.client_email },
      ruta: f.route_name,
      salida: f.start_date,
      regreso: f.end_date,
      personas: f.people,
      modalidad: f.modality,
      estado: f.status,
      origen: f.source,
      valida_hasta: f.valid_until,
      dinero: {
        total_eur: total,
        costo_pilgrim_eur: Number(f.cost_eur) || 0,
        cobrado_eur: cobrado,
        saldo_eur: total - cobrado,
      },
      pdf: !!f.pdf_path,
      correo_cliente_enviado_en: f.email_sent_at,
      es_hija_de: f.parent_quote_id,
      creada_en: f.created_at,
    };
  });

  return Response.json({
    ok: true,
    consulta: q || null,
    filtros: { estado: estado || null, desde: desde || null, hasta: hasta || null },
    total_encontradas: encontradas.length,
    mostradas: resultados.length,
    cotizaciones: resultados,
  });
}
