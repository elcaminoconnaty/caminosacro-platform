import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreoCliente } from "@/lib/quotes/clientEmail";
import { resolverCotizacion } from "@/lib/quotes/agentQuoteStatus";
import { autorizadoAgente, noAutorizado } from "../../../auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
});

/**
 * POST /api/agente/cotizacion/<id>/correo-cliente — envía la cotización al cliente.
 *
 * Este endpoint NO lo llama el agente: lo llama `aprobaciones.js` de BayMax
 * después de que Nico responde "enviar N". El agente solo puede dejar el
 * borrador en la cola (docs/CONVENCIONES.md §5).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!autorizadoAgente(request)) return noAutorizado();

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "validacion" }, { status: 422 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false, error: "validacion" }, { status: 422 });

  const supabase = createAdminClient("comercial");
  const quoteId = await resolverCotizacion(supabase, id);
  if (!quoteId) return Response.json({ ok: false, error: "cotizacion_no_encontrada" }, { status: 404 });

  const r = await enviarCorreoCliente(supabase, quoteId, parsed.data);
  if (r.error) return Response.json({ ok: false, error: r.error }, { status: 422 });
  return Response.json({ ok: true, email: r.email });
}
