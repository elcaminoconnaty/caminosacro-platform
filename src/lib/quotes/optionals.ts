import "server-only";

import { mensajeError } from "@/lib/errors";
import { optionalPricesForYear, quoteYear } from "@/lib/pricing/year";
import type { ComercialClient } from "@/lib/quotes/pdf";
import { validarOpcionalLibre, type OpcionalLibre } from "@/lib/quotes/opcionalLibre";

export { MAX_DESC_OPCIONAL, type OpcionalLibre } from "@/lib/quotes/opcionalLibre";

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

// ---------------------------------------------------------------------------
// Opcional personalizado (línea suelta).
//
// El catálogo cubre lo repetible —seguros, noches extra, traslados, tours—, pero en casi
// toda cotización aparece algo que solo existe en ESE viaje: un traslado desde un pueblo
// que nadie más pide, una cena de despedida, un cambio de hotel por una noche. Hasta ahora
// eso se metía a mano en la base o se sumaba a la base de la ruta, y en los dos casos el
// seguimiento perdía el rastro de cuánto de eso era costo de Pilgrim.
//
// Se guarda como una línea `type='optional'` con `reference_id` en NULL: así entra sola al
// total del cliente y al costo Pilgrim (`recompute_quote_money`), sale en el resumen del
// PDF, en el correo a Pilgrim y en la lista de servicios del contrato, sin tocar nada de
// eso. El `reference_id` nulo es justo lo que la distingue de las del catálogo.
// ---------------------------------------------------------------------------

// El tope de caracteres, el tipo y la validación viven en `opcionalLibre.ts`, que el
// formulario del expediente (cliente) también importa: acá no se puede, este módulo es
// "server-only".

export async function agregarOpcionalLibre(
  supabase: ComercialClient,
  quoteId: string,
  datos: OpcionalLibre,
): Promise<{ ok?: true; error?: string }> {
  const v = validarOpcionalLibre(datos);
  if ("error" in v) return v;
  const { error } = await supabase.from("quote_lines").insert({
    quote_id: quoteId,
    type: "optional",
    description: v.ok.descripcion,
    quantity: v.ok.cantidad,
    unit_price: v.ok.precioCs,
    cost_unit: v.ok.precioPilgrim,
    reference_id: null,
  });
  if (error) return { error: mensajeError(error) };
  await supabase.rpc("recompute_quote_total", { p_quote_id: quoteId });
  return { ok: true };
}

/**
 * Edita una línea suelta. Acotado a `reference_id is null` a propósito: por acá no se
 * puede reescribir la descripción ni el precio de un opcional del catálogo, que tiene que
 * seguir diciendo lo mismo en todas las cotizaciones.
 */
export async function editarOpcionalLibre(
  supabase: ComercialClient,
  quoteId: string,
  lineId: string,
  datos: OpcionalLibre,
): Promise<{ ok?: true; error?: string }> {
  const v = validarOpcionalLibre(datos);
  if ("error" in v) return v;
  const { error } = await supabase
    .from("quote_lines")
    .update({
      description: v.ok.descripcion,
      quantity: v.ok.cantidad,
      unit_price: v.ok.precioCs,
      cost_unit: v.ok.precioPilgrim,
    })
    .eq("id", lineId)
    .eq("quote_id", quoteId)
    .eq("type", "optional")
    .is("reference_id", null);
  if (error) return { error: mensajeError(error) };
  await supabase.rpc("recompute_quote_total", { p_quote_id: quoteId });
  return { ok: true };
}

export async function eliminarOpcionalLibre(
  supabase: ComercialClient,
  quoteId: string,
  lineId: string,
): Promise<{ ok?: true; error?: string }> {
  const { error } = await supabase
    .from("quote_lines")
    .delete()
    .eq("id", lineId)
    .eq("quote_id", quoteId)
    .eq("type", "optional")
    .is("reference_id", null);
  if (error) return { error: mensajeError(error) };
  await supabase.rpc("recompute_quote_total", { p_quote_id: quoteId });
  return { ok: true };
}
