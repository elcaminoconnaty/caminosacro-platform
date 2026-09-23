import { z } from "zod";
import { crearCotizacionWordPress } from "@/lib/quotes/webQuote";
import { enviarEventoMeta } from "@/lib/marketing/metaCapi";
import { noAutorizado } from "../../../wp/auth";
import { autorizadoIsabel } from "../auth";

export const dynamic = "force-dynamic";

// Los mismos límites que el cotizador web: Isabel cotiza lo que cotizaría un visitante.
const solicitudSchema = z.object({
  route_slug: z.string().trim().min(1).max(80),
  tipo: z.enum(["pension", "hotel"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  people: z.number().int().min(1).max(12),
  todos_individuales: z.boolean().default(false),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(6).max(40),
  terms_accepted: z.literal(true),
  marketing_optin: z.boolean().default(false),
});

/**
 * POST /api/agente/isabel/cotizacion — la cotización que arma Isabel en WhatsApp.
 *
 * Es el flujo del cotizador de caminosacro.com (`crearCotizacionWordPress`), con
 * `canal: "isabel"`:
 *  - Solo rutas publicadas en la web y con la tarifa del AÑO DE SALIDA (sin tarifa, no
 *    hay cotización: `sin_tarifas_ano`).
 *  - Mismo PDF, mismo correo desde reservas@ y mismos consentimientos (la persona aceptó
 *    términos en el chat; la conversación queda en isabel_messages como evidencia).
 *  - Mismo candado contra repetidos.
 *
 * El PDF por WhatsApp lo envía Isabel con `pdf_url`. Después avisa en
 * /[id]/entregada-whatsapp para que el expediente registre esa entrega.
 */
export async function POST(request: Request) {
  if (!autorizadoIsabel(request)) return noAutorizado();

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
  const datos = parsed.data;

  try {
    const r = await crearCotizacionWordPress({ ...datos, canal: "isabel" });
    if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: r.status });

    // Un lead que cotiza por WhatsApp también es un Lead para la pauta. Sin píxel del
    // navegador no hay nada que deduplicar: el event_id es el código de la cotización.
    if (!r.repetida) {
      void enviarEventoMeta({
        eventName: "Lead",
        eventId: r.code,
        eventSourceUrl: null,
        value: r.breakdown.total_eur,
        currency: "EUR",
        contentName: datos.route_slug,
        contentCategory: "isabel-whatsapp",
        user: {
          email: datos.email,
          phone: datos.phone,
          firstName: datos.full_name.split(" ")[0] ?? null,
          country: null,
          ip: null,
          userAgent: null,
          fbp: null,
          fbc: null,
        },
      }).catch((e) => console.error("[isabel-quote] CAPI:", r.code, e));
    }

    return Response.json({
      ok: true,
      id: r.id,
      code: r.code,
      pdf_url: r.pdf_url,
      email_sent: r.email_sent,
      repetida: r.repetida ?? false,
      breakdown: r.breakdown,
    });
  } catch (e) {
    console.error("[isabel-quote] POST", e);
    return Response.json({ ok: false, error: "interno" }, { status: 500 });
  }
}
