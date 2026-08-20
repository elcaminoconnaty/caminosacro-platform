import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreoAPilgrim } from "@/lib/quotes/sendPilgrimEmail";
import { estadoCotizacion, resolverCotizacion } from "@/lib/quotes/agentQuoteStatus";
import { autorizadoAgente, noAutorizado } from "../../../auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(40000),
  prueba_email: z.string().trim().email().max(160).optional().nullable(),
});

/**
 * POST /api/agente/cotizacion/<id>/correo-pilgrim — le pide a Pilgrim el link de pago.
 *
 * Lo llama `aprobaciones.js` tras el OK de Nico, igual que el correo al cliente.
 * Se niega si no hay ni un pasaporte adjunto: sin pasaportes el correo llega
 * incompleto y Pilgrim no puede armar la reserva. `prueba_email` desvía el envío
 * para ensayar sin escribirle al proveedor.
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

  const estado = await estadoCotizacion(supabase, quoteId);
  if (estado && estado.pasaportes_adjuntos === 0) {
    return Response.json(
      { ok: false, error: "sin_pasaportes", faltantes: estado.faltantes },
      { status: 422 },
    );
  }

  const r = await enviarCorreoAPilgrim(supabase, quoteId, {
    subject: parsed.data.subject,
    body: parsed.data.body,
    pruebaEmail: parsed.data.prueba_email ?? null,
  });
  if (r.error) return Response.json({ ok: false, error: r.error }, { status: 422 });
  return Response.json({ ok: true, email: r.email, adjuntos: r.adjuntos, prueba: !!parsed.data.prueba_email });
}
