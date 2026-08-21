import "server-only";

import { mensajeError } from "@/lib/errors";
import { optionalPricesForYear, quoteYear } from "@/lib/pricing/year";
import type { ComercialClient } from "@/lib/quotes/pdf";

/**
 * Agrega o quita un servicio opcional de una cotización y recalcula los totales.
 *
 * Extraído de la server action `toggleQuoteOptional` para que el endpoint del
 * agente use exactamente la misma regla de precio y de cantidad; la action quedó
 * como envoltura que además revalida las páginas.
 */
export async function alternarOpcional(
  supabase: ComercialClient,
  quoteId: string,
  optionalId: string,
  on: boolean,
  peopleHint?: number | null,
): Promise<{ ok?: true; error?: string }> {
  if (on) {
    // El precio sale del año de SALIDA de la cotización (migración 0019). Si ese año no
    // está cargado se usa el anterior — la tarjeta ya lo avisó en ámbar. El precio queda
    // como snapshot en la línea, así que cambiarle la fecha después no la re-tarifa sola.
    const [{ data: opt }, { data: quote }] = await Promise.all([
      supabase
        .from("optional_services")
        .select("name,unit,optional_prices(year,price_pilgrim,price_cs)")
        .eq("id", optionalId)
        .maybeSingle(),
      supabase.from("quotes").select("start_date").eq("id", quoteId).maybeSingle(),
    ]);
    if (!opt) return { error: "Opcional no encontrado" };

    const filas = ((opt.optional_prices || []) as Array<{ year: number; price_pilgrim: number | string | null; price_cs: number | string | null }>)
      .map((p) => ({ optional_id: optionalId, year: Number(p.year), price_pilgrim: Number(p.price_pilgrim) || 0, price_cs: Number(p.price_cs) || 0 }));
    const precio = optionalPricesForYear(filas, quoteYear(quote?.start_date)).get(optionalId);
    if (!precio) return { error: "Ese opcional no tiene precio cargado en ningún año. Cargalo en el catálogo." };

    // Cantidad por defecto: si es por persona, usa people; si es por noche/vehículo/unidad, 1
    const isPerPerson = (opt.unit || "").toLowerCase().includes("persona");
    const qty = isPerPerson ? Math.max(1, peopleHint ?? 1) : 1;
    const description = `${opt.name} (${opt.unit})`;
    const { error } = await supabase.from("quote_lines").insert({
      quote_id: quoteId,
      type: "optional",
      description,
      quantity: qty,
      unit_price: precio.price_cs,
      cost_unit: precio.price_pilgrim,
      reference_id: optionalId,
    });
    if (error) return { error: mensajeError(error) };
  } else {
    const { error } = await supabase
      .from("quote_lines")
      .delete()
      .eq("quote_id", quoteId)
      .eq("reference_id", optionalId);
    if (error) return { error: mensajeError(error) };
  }
  await supabase.rpc("recompute_quote_total", { p_quote_id: quoteId });
  return { ok: true };
}

/**
 * Cambia cuántas unidades van de una línea opcional (3 noches extra, 2 traslados…).
 *
 * Acotado a `type='optional'` para no pisar una bici con el id equivocado, igual que su
 * espejo `cambiarCantidadBici`. Extraído de la server action para que el endpoint del
 * agente cambie la cantidad con la misma regla, incluido el recálculo del total.
 */
export async function cambiarCantidadOpcional(
  supabase: ComercialClient,
  quoteId: string,
  lineId: string,
  cantidad: number,
): Promise<{ ok?: true; error?: string }> {
  const { error } = await supabase
    .from("quote_lines")
    .update({ quantity: Math.max(1, Math.round(cantidad) || 1) })
    .eq("id", lineId)
    .eq("quote_id", quoteId)
    .eq("type", "optional");
  if (error) return { error: mensajeError(error) };
  await supabase.rpc("recompute_quote_total", { p_quote_id: quoteId });
  return { ok: true };
}
