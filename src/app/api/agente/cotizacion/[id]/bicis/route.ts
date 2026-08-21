import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { firmarPdf } from "@/lib/quotes/pdfUrl";
import { estadoCotizacion, resolverCotizacion } from "@/lib/quotes/agentQuoteStatus";
import { alternarBici, cambiarCantidadBici, crearHijaConBici, flotaDeLaCotizacion } from "@/lib/quotes/bikeQuote";
import { autorizadoAgente, noAutorizado } from "../../../auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  agregar: z.array(z.object({ bici_id: z.string().uuid(), cantidad: z.number().int().min(1).max(30).optional() })).default([]),
  quitar: z.array(z.string().uuid()).default([]),
  cantidades: z.array(z.object({ linea_id: z.string().uuid(), cantidad: z.number().int().min(1).max(30) })).default([]),
  /** Paso 4: crear la cotización hija con las bicis que ya están marcadas. */
  crear_cotizacion: z.boolean().default(false),
});

/**
 * GET /api/agente/cotizacion/<id>/bicis — la flota que aplica a ESTA cotización (su ruta y
 * su año de salida), con lo ya marcado y la fianza.
 *
 * POST — marca, desmarca, cambia cantidades y, con `crear_cotizacion`, emite la cotización
 * hija con la bici elegida. Ejecuta exactamente lo mismo que los botones de la tarjeta de
 * bicicletas en Seguimiento (`@/lib/quotes/bikeQuote`), no una segunda versión.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!autorizadoAgente(request)) return noAutorizado();

  const { id } = await params;
  const supabase = createAdminClient("comercial");
  const quoteId = await resolverCotizacion(supabase, id);
  if (!quoteId) return Response.json({ ok: false, error: "cotizacion_no_encontrada" }, { status: 404 });

  return Response.json(await resumenBicis(supabase, quoteId));
}

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
  const { agregar, quitar, cantidades, crear_cotizacion } = parsed.data;
  if (!agregar.length && !quitar.length && !cantidades.length && !crear_cotizacion) {
    return Response.json({ ok: false, error: "nada_que_hacer" }, { status: 422 });
  }

  const supabase = createAdminClient("comercial");
  const quoteId = await resolverCotizacion(supabase, id);
  if (!quoteId) return Response.json({ ok: false, error: "cotizacion_no_encontrada" }, { status: 404 });

  const flota = await flotaDeLaCotizacion(supabase, quoteId);
  if ("error" in flota) return Response.json({ ok: false, error: "cotizacion_no_encontrada" }, { status: 404 });
  if (!flota.esRutaBici) {
    return Response.json(
      { ok: false, error: "ruta_sin_bici", detalle: "Esa cotización no es de un camino en bicicleta." },
      { status: 409 },
    );
  }

  // Por defecto se marcan tantas bicis como personas: un grupo de 4 casi siempre lleva 4.
  const personas = Math.max(1, Number(flota.quote.people) || 1);

  const errores: string[] = [];
  for (const a of agregar) {
    const r = await alternarBici(supabase, quoteId, a.bici_id, true, a.cantidad ?? personas);
    if (r.error) errores.push(`${a.bici_id}: ${r.error}`);
  }
  for (const bikeId of quitar) {
    const r = await alternarBici(supabase, quoteId, bikeId, false);
    if (r.error) errores.push(`${bikeId}: ${r.error}`);
  }
  for (const c of cantidades) {
    const r = await cambiarCantidadBici(supabase, quoteId, c.linea_id, c.cantidad);
    if (r.error) errores.push(`${c.linea_id}: ${r.error}`);
  }

  // Paso 4: la cotización nueva con la bici que eligió el peregrino. Va al final, para que
  // se lleve lo que se acabe de marcar en esta misma llamada.
  if (crear_cotizacion) {
    if (errores.length) {
      return Response.json({ ok: false, error: "no_se_creo", errores }, { status: 409 });
    }
    const { data: lineas } = await supabase
      .from("quote_lines")
      .select("reference_id,quantity")
      .eq("quote_id", quoteId)
      .eq("type", "bike");
    const seleccion = ((lineas || []) as Array<{ reference_id: string | null; quantity: number | string }>)
      .filter((l) => l.reference_id)
      .map((l) => ({ bikeId: l.reference_id as string, qty: Number(l.quantity) || 1 }));

    const hija = await crearHijaConBici(supabase, quoteId, seleccion);
    if (!hija.ok) return Response.json({ ok: false, error: "no_se_creo", detalle: hija.error }, { status: 409 });

    const pdf = await renderAndStoreQuotePdf(supabase, hija.id);
    const pdfOk = "ok" in pdf && pdf.ok;
    return Response.json({
      ok: true,
      creada: {
        id: hija.id,
        code: hija.code,
        fianza_eur: hija.fianza_eur,
        pdf_regenerado: pdfOk,
        pdf_url: pdfOk ? await firmarPdf(supabase, hija.id) : null,
      },
      viene_de: quoteId,
      cotizacion: await estadoCotizacion(supabase, hija.id),
    });
  }

  // Las bicis salen en el PDF (la flota completa y las contratadas), así que hay que
  // regenerarlo: sin eso el documento y el total dirían cosas distintas.
  const pdf = await renderAndStoreQuotePdf(supabase, quoteId);
  const resumen = await resumenBicis(supabase, quoteId);
  return Response.json({
    ...resumen,
    ok: errores.length === 0,
    errores,
    pdf_regenerado: "ok" in pdf && pdf.ok,
  });
}

async function resumenBicis(supabase: ReturnType<typeof createAdminClient>, quoteId: string) {
  const flota = await flotaDeLaCotizacion(supabase, quoteId);
  if ("error" in flota) return { ok: false, error: "cotizacion_no_encontrada" };

  const { data: lineas } = await supabase
    .from("quote_lines")
    .select("id,reference_id,description,quantity,unit_price,total")
    .eq("quote_id", quoteId)
    .eq("type", "bike");

  const marcadas = ((lineas || []) as Array<Record<string, unknown>>).map((l) => ({
    linea_id: l.id,
    bici_id: l.reference_id,
    descripcion: l.description,
    cantidad: Number(l.quantity) || 1,
    precio_unitario: Number(l.unit_price) || 0,
    total: Number(l.total) || 0,
  }));
  const unidades = marcadas.reduce((s, m) => s + m.cantidad, 0);
  const { FIANZA_POR_BICI_EUR } = await import("@/lib/bikes/catalog");

  return {
    ok: true,
    ruta_en_bici: flota.esRutaBici,
    year: flota.year,
    personas: Number(flota.quote.people) || 1,
    fianza_por_bici_eur: FIANZA_POR_BICI_EUR,
    fianza_total_eur: unidades * FIANZA_POR_BICI_EUR,
    flota: flota.bikes.map((b) => ({
      id: b.id,
      nombre: b.name,
      gama: b.category_label,
      electrica: b.electric,
      tallas: b.sizes,
      dias_alquiler: b.days,
      price_cs: b.price_cs,
      price_pilgrim: b.price_pilgrim,
      cotizable: !!b.price_cs,
    })),
    marcadas,
  };
}
