import { createAdminClient } from "@/lib/supabase/admin";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { firmarPdf } from "@/lib/quotes/pdfUrl";
import { resolverCotizacion } from "@/lib/quotes/agentQuoteStatus";
import { autorizadoAgente, noAutorizado } from "../../../auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/agente/cotizacion/<id>/pdf — regenerar el PDF y devolver su enlace firmado.
 *
 * Es el botón "Generar PDF" de la tarjeta de Documentos. Casi nunca hace falta llamarlo
 * suelto —crear, editar y tocar opcionales o bicis ya regeneran—, pero existe para dos
 * casos reales: que el render se haya caído la primera vez, y que Nico pida "mándame otra
 * vez el PDF" cuando el enlace de hace una semana ya venció.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!autorizadoAgente(request)) return noAutorizado();

  const { id } = await params;
  const supabase = createAdminClient("comercial");
  const quoteId = await resolverCotizacion(supabase, id);
  if (!quoteId) return Response.json({ ok: false, error: "cotizacion_no_encontrada" }, { status: 404 });

  const pdf = await renderAndStoreQuotePdf(supabase, quoteId);
  if (!("ok" in pdf && pdf.ok)) {
    const detalle = "error" in pdf ? String(pdf.error) : "";
    console.error("[agente-quote] regenerar PDF", quoteId, detalle);
    return Response.json({ ok: false, error: "pdf_fallo", detalle }, { status: 500 });
  }
  return Response.json({ ok: true, pdf_url: await firmarPdf(supabase, quoteId) });
}
