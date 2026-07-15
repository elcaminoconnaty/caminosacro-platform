import { z } from "zod";
import { crearCotizacionWordPress } from "@/lib/quotes/webQuote";
import { autorizado, noAutorizado } from "../auth";

export const dynamic = "force-dynamic";

const solicitudSchema = z.object({
  route_slug: z.string().trim().min(1).max(80),
  tipo: z.enum(["pension", "hotel"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  people: z.number().int().min(1).max(12),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(6).max(40),
  terms_accepted: z.literal(true),
  marketing_optin: z.boolean().default(false),
  visitor_ip: z.string().trim().max(60).optional(),
  honeypot: z.string().max(0).optional(),
});

// Techo global laxo por IP del visitante (el límite fino de 5/hora ya lo aplica
// WordPress con sus transients). En memoria del proceso, igual que /cotizar.
const RATE_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };
const hits = new Map<string, number[]>();

function superaLimite(ip: string): boolean {
  const ahora = Date.now();
  const previos = (hits.get(ip) ?? []).filter((t) => ahora - t < RATE_LIMIT.windowMs);
  previos.push(ahora);
  hits.set(ip, previos);
  if (hits.size > 5000) hits.clear();
  return previos.length > RATE_LIMIT.max;
}

/**
 * POST /api/wp/quote — crea una cotización desde el cotizador de caminosacro.com.
 *
 * La plataforma es la única fuente de verdad: recalcula el precio, crea cliente +
 * cotización en Supabase y genera el MISMO PDF del CRM (bucket comercial-quotes).
 * WordPress solo pinta el resultado y enlaza la URL firmada.
 */
export async function POST(request: Request) {
  if (!autorizado(request)) return noAutorizado();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "validacion" }, { status: 422 });
  }
  const parsed = solicitudSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validacion", detalle: parsed.error.issues.map((i) => i.path.join(".")).join(", ") },
      { status: 422 },
    );
  }
  const datos = parsed.data;
  if (datos.honeypot) return Response.json({ ok: false, error: "validacion" }, { status: 422 });
  if (superaLimite(datos.visitor_ip || "desconocida")) {
    return Response.json({ ok: false, error: "limite" }, { status: 429 });
  }

  try {
    const resultado = await crearCotizacionWordPress(datos);
    if (!resultado.ok) {
      return Response.json({ ok: false, error: resultado.error }, { status: resultado.status });
    }
    const { ok, code, pdf_url, email_sent, breakdown } = resultado;
    return Response.json({ ok, code, pdf_url, email_sent, breakdown });
  } catch (e) {
    console.error("[wp-quote] error inesperado:", e);
    return Response.json({ ok: false, error: "interno" }, { status: 500 });
  }
}
