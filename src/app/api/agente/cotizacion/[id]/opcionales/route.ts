import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { alternarOpcional, cambiarCantidadOpcional } from "@/lib/quotes/optionals";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { estadoCotizacion, resolverCotizacion } from "@/lib/quotes/agentQuoteStatus";
import { autorizadoAgente, noAutorizado } from "../../../auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  agregar: z.array(z.string().uuid()).default([]),
  quitar: z.array(z.string().uuid()).default([]),
  /** Cambiar cuántas unidades van de una línea ya marcada (3 noches extra, 2 traslados). */
  cantidades: z.array(z.object({ linea_id: z.string().uuid(), cantidad: z.number().int().min(1).max(90) })).default([]),
});

/**
 * POST /api/agente/cotizacion/<id>/opcionales — agrega o quita servicios y
 * regenera el PDF, que es lo que se le manda al cliente.
 *
 * Los opcionales de categoría `noche_extra` y `tour` cambian el itinerario del
 * PDF, así que regenerarlo no es un detalle: sin eso el documento y el total
 * dirían cosas distintas.
 *
 * `cantidades` es lo que en pantalla es el campito de al lado de cada opcional marcado:
 * el `linea_id` sale de `cotizacion_revisar` (campo `lineas`), no del catálogo.
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
  if (!parsed.data.agregar.length && !parsed.data.quitar.length && !parsed.data.cantidades.length) {
    return Response.json({ ok: false, error: "nada_que_hacer" }, { status: 422 });
  }

  const supabase = createAdminClient("comercial");
  const quoteId = await resolverCotizacion(supabase, id);
  if (!quoteId) return Response.json({ ok: false, error: "cotizacion_no_encontrada" }, { status: 404 });

  const { data: quote } = await supabase.from("quotes").select("people").eq("id", quoteId).maybeSingle();
  const personas = Number(quote?.people) || 1;

  const errores: string[] = [];
  for (const optionalId of parsed.data.agregar) {
    const r = await alternarOpcional(supabase, quoteId, optionalId, true, personas);
    if (r.error) errores.push(`${optionalId}: ${r.error}`);
  }
  for (const optionalId of parsed.data.quitar) {
    const r = await alternarOpcional(supabase, quoteId, optionalId, false);
    if (r.error) errores.push(`${optionalId}: ${r.error}`);
  }
  for (const c of parsed.data.cantidades) {
    const r = await cambiarCantidadOpcional(supabase, quoteId, c.linea_id, c.cantidad);
    if (r.error) errores.push(`${c.linea_id}: ${r.error}`);
  }

  const pdf = await renderAndStoreQuotePdf(supabase, quoteId);
  const pdfOk = "ok" in pdf && pdf.ok;

  const estado = await estadoCotizacion(supabase, quoteId);
  return Response.json({ ok: errores.length === 0, errores, pdf_regenerado: pdfOk, cotizacion: estado });
}
