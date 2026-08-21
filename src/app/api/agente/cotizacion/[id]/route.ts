import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { estadoCotizacion, resolverCotizacion } from "@/lib/quotes/agentQuoteStatus";
import { actualizarCotizacion } from "@/lib/quotes/editQuote";
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

const parcheSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    telefono: z.string().trim().min(6).max(40).optional(),
    correo: z.string().trim().email().max(160).nullable().optional(),
    ruta_slug: z.string().trim().min(1).max(80).optional(),
    modalidad: z.enum(["pension_doble", "pension_single", "hotel_doble", "hotel_single"]).optional(),
    fecha_salida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    personas: z.number().int().min(1).max(30).optional(),
    notas: z.string().trim().max(2000).nullable().optional(),
    estado: z.string().trim().max(40).optional(),
    valida_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "nada_que_cambiar" });

/**
 * PATCH /api/agente/cotizacion/<id> — corregir una cotización que ya existe.
 *
 * Es lo que le faltaba a BayMax para hacer lo mismo que Nico con clicks: hasta ahora solo
 * sabía crear, así que agregarle un correo a una cotización obligaba a recrearla desde cero
 * y dejaba un duplicado en Seguimiento.
 *
 * Solo campos de negocio: precios no se reciben. Si cambia ruta, modalidad, fecha o
 * personas, la plataforma vuelve a tarifar desde el catálogo y regenera el PDF; si el año
 * de salida no tiene tarifa, no guarda nada y responde `sin_tarifas_ano`.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!autorizadoAgente(request)) return noAutorizado();

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "validacion" }, { status: 422 });
  }
  const parsed = parcheSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validacion", faltantes: parsed.error.issues.map((i) => i.path.join(".") || i.message) },
      { status: 422 },
    );
  }

  const supabase = createAdminClient("comercial");
  const quoteId = await resolverCotizacion(supabase, id);
  if (!quoteId) return Response.json({ ok: false, error: "cotizacion_no_encontrada" }, { status: 404 });

  try {
    const r = await actualizarCotizacion(supabase, quoteId, parsed.data);
    if (!r.ok) return Response.json({ ok: false, error: r.error, detalle: r.detalle }, { status: r.status });
    const estado = await estadoCotizacion(supabase, quoteId);
    return Response.json({
      ok: true,
      cambios: r.cambios,
      avisos: r.avisos,
      retarifada: r.retarifada,
      pdf_regenerado: r.pdf_regenerado,
      cotizacion: estado,
    });
  } catch (e) {
    console.error("[agente-quote] PATCH /cotizacion", e);
    return Response.json({ ok: false, error: "interno" }, { status: 500 });
  }
}
