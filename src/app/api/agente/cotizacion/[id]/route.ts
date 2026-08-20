import { createAdminClient } from "@/lib/supabase/admin";
import { estadoCotizacion, resolverCotizacion } from "@/lib/quotes/agentQuoteStatus";
import { autorizadoAgente, noAutorizado } from "../../auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/agente/cotizacion/<id o CS-2026-034> — el expediente completo con la
 * lista de `faltantes`. Es lo que consulta `cotizacion_revisar` en BayMax.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!autorizadoAgente(request)) return noAutorizado();

  const { id } = await params;
  const supabase = createAdminClient("comercial");
  const quoteId = await resolverCotizacion(supabase, id);
  if (!quoteId) return Response.json({ ok: false, error: "cotizacion_no_encontrada" }, { status: 404 });

  const estado = await estadoCotizacion(supabase, quoteId);
  if (!estado) return Response.json({ ok: false, error: "cotizacion_no_encontrada" }, { status: 404 });
  return Response.json({ ok: true, cotizacion: estado });
}
