import { z } from "zod";
import { crearCotizacionAgente, MAX_PERSONAS_AGENTE } from "@/lib/quotes/agentQuote";
import { autorizadoAgente, noAutorizado } from "../auth";

export const dynamic = "force-dynamic";

const solicitudSchema = z.object({
  route_slug: z.string().trim().min(1).max(80),
  modalidad: z.enum(["pension_doble", "pension_single", "hotel_doble", "hotel_single"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  people: z.number().int().min(1).max(MAX_PERSONAS_AGENTE),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email().max(160).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/**
 * POST /api/agente/cotizacion — la cotización que arma BayMax desde Telegram.
 *
 * Crea cliente + cotización + PDF oficial y ahí se detiene. El correo al cliente
 * es un paso aparte que Nico aprueba: ver /correo-cliente.
 */
export async function POST(request: Request) {
  if (!autorizadoAgente(request)) return noAutorizado();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "validacion" }, { status: 422 });
  }
  const parsed = solicitudSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validacion", faltantes: parsed.error.issues.map((i) => i.path.join(".")) },
      { status: 422 },
    );
  }

  try {
    const r = await crearCotizacionAgente(parsed.data);
    if (!r.ok) return Response.json({ ok: false, error: r.error, detalle: r.detalle }, { status: r.status });
    return Response.json(r);
  } catch (e) {
    console.error("[agente-quote] POST /cotizacion", e);
    return Response.json({ ok: false, error: "interno" }, { status: 500 });
  }
}
