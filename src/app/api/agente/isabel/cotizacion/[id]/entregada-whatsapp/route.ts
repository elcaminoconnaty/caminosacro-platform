import { createAdminClient } from "@/lib/supabase/admin";
import { congelarEntrega } from "@/lib/quotes/entregas";
import { marcarCotizacionEnviada } from "@/lib/quotes/marcarEnviada";
import { noAutorizado } from "../../../../../wp/auth";
import { autorizadoIsabel } from "../../../auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/agente/isabel/cotizacion/<id>/entregada-whatsapp — Isabel ya le mandó el PDF
 * por WhatsApp. El expediente lo registra como cualquier otra entrega (migración 0049):
 * queda congelado lo que recibió la persona y, si el correo había fallado, la cotización
 * igual pasa a «Enviada».
 *
 * Solo acepta cotizaciones que creó Isabel: su llave no marca entregas ajenas.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!autorizadoIsabel(request)) return noAutorizado();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ ok: false, error: "validacion" }, { status: 422 });

  const supabase = createAdminClient("comercial");
  const { data: q } = await supabase.from("quotes").select("id,source,client_phone").eq("id", id).maybeSingle();
  if (!q || q.source !== "isabel") return Response.json({ ok: false, error: "cotizacion_no_encontrada" }, { status: 404 });

  await marcarCotizacionEnviada(supabase, id);
  await congelarEntrega(supabase, id, { canal: "whatsapp", destinatario: q.client_phone ?? null });
  return Response.json({ ok: true });
}
