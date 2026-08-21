import "server-only";

import { mensajeError } from "@/lib/errors";
import { quoteYear } from "@/lib/pricing/year";
import { DEFAULT_STATUS } from "@/lib/quoteStatus";
import type { ComercialClient } from "@/lib/quotes/pdf";
import {
  BIKE_COLUMNS,
  bikesForRouteYear,
  descripcionLineaBici,
  FIANZA_POR_BICI_EUR,
  normalizeBike,
  normalizeBikePrice,
  type BikeWithPrice,
} from "@/lib/bikes/catalog";

/**
 * El Camino en bici, en un solo lugar: marcar una bicicleta, cambiarle la cantidad y crear
 * la cotización hija con la que eligió el peregrino.
 *
 * Estaba dentro de las server actions de Seguimiento, así que era algo que solo podía pasar
 * a golpe de click. Al sacarlo acá, el endpoint del agente ejecuta EXACTAMENTE lo mismo que
 * el botón: mismas tarifas, misma línea, mismo `parent_quote_id`.
 */

/** Lo que se manda al crear la cotización hija: qué bici y cuántas unidades. */
export type SeleccionBici = { bikeId: string; qty: number };

/**
 * Resuelve la flota con la tarifa que le toca a ESTA cotización.
 *
 * El precio nunca viaja desde afuera: quien lo escribe en la línea es el servidor,
 * releyendo `bike_prices`. Si no fuera así, cualquiera podría cotizar una eléctrica al
 * precio de una MTB tocando el formulario (o pidiéndoselo al agente).
 *
 * La ruta se resuelve por `route_id` y, si la cotización vieja no lo tiene, por nombre.
 */
export async function flotaDeLaCotizacion(
  supabase: ComercialClient,
  quoteId: string,
): Promise<
  | { error: string }
  | { quote: Record<string, unknown>; routeId: string | null; esRutaBici: boolean; year: number; bikes: BikeWithPrice[] }
> {
  const { data: quote } = await supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (!quote) return { error: "Cotización no encontrada." };

  let routeId: string | null = (quote.route_id as string | null) ?? null;
  let esRutaBici = false;
  if (routeId) {
    const { data: r } = await supabase.from("routes").select("id,modality").eq("id", routeId).maybeSingle();
    esRutaBici = String(r?.modality || "").toLowerCase() === "bici";
  } else if (quote.route_name) {
    const { data: r } = await supabase.from("routes").select("id,modality").eq("name", quote.route_name).maybeSingle();
    routeId = r?.id ?? null;
    esRutaBici = String(r?.modality || "").toLowerCase() === "bici";
  }

  const year = quoteYear(quote.start_date as string | null);
  const [{ data: bikeRows }, { data: priceRows }] = await Promise.all([
    supabase.from("bikes").select(BIKE_COLUMNS).eq("active", true).order("position"),
    supabase.from("bike_prices").select("bike_id,route_id,year,days,price_pilgrim,price_cs").eq("year", year),
  ]);

  const bikes = bikesForRouteYear(
    ((bikeRows as Record<string, unknown>[]) || []).map(normalizeBike),
    ((priceRows as Record<string, unknown>[]) || []).map(normalizeBikePrice),
    routeId,
    year,
  );
  return { quote, routeId, esRutaBici, year, bikes };
}

/** Cómo se inserta una bici como línea. Un solo lugar para que la línea del paso 1 y la de
 *  la cotización hija salgan idénticas. */
export function lineaDeBici(quoteId: string, bike: BikeWithPrice, qty: number) {
  return {
    quote_id: quoteId,
    type: "bike" as const,
    description: descripcionLineaBici(bike, bike.days),
    quantity: Math.max(1, Math.round(qty) || 1),
    unit_price: bike.price_cs ?? 0,
    cost_unit: bike.price_pilgrim ?? 0,
    reference_id: bike.id,
  };
}

/**
 * Marca o desmarca una bicicleta en la cotización. Espejo de `alternarOpcional`.
 *
 * Cantidad por defecto: las personas de la cotización — un grupo de 4 casi siempre lleva 4
 * bicis. Se puede marcar más de un modelo a la vez porque los grupos mezclan (dos MTB y una
 * eléctrica para quien no quiere sufrir las cuestas de O Cebreiro).
 */
export async function alternarBici(
  supabase: ComercialClient,
  quoteId: string,
  bikeId: string,
  on: boolean,
  qtyHint?: number | null,
): Promise<{ ok?: true; error?: string }> {
  if (on) {
    const flota = await flotaDeLaCotizacion(supabase, quoteId);
    if ("error" in flota) return { error: flota.error };
    const bike = flota.bikes.find((b) => b.id === bikeId);
    if (!bike) return { error: "Esa bicicleta no está en la flota activa." };
    // Coincidencia EXACTA de año: una bici de 2027 cotizada con tarifa 2026 es plata
    // perdida en cada reserva, y acá sí hay dónde teclear el precio (en /catalogo).
    if (!bike.price_cs) {
      return { error: `Esa bicicleta no tiene tarifa ${flota.year} para esta ruta. Cargala en el catálogo.` };
    }
    const { error } = await supabase.from("quote_lines").insert(lineaDeBici(quoteId, bike, Math.max(1, qtyHint ?? 1)));
    if (error) return { error: mensajeError(error) };
  } else {
    // El filtro por `type` es a propósito: `reference_id` es la única llave que comparten
    // las líneas, y no queremos que desmarcar una bici toque un opcional por accidente.
    const { error } = await supabase
      .from("quote_lines")
      .delete()
      .eq("quote_id", quoteId)
      .eq("type", "bike")
      .eq("reference_id", bikeId);
    if (error) return { error: mensajeError(error) };
  }

  await supabase.rpc("recompute_quote_total", { p_quote_id: quoteId });
  return { ok: true };
}

/** Cambia cuántas unidades de ese modelo van. Acotado a líneas de bici para no pisar un
 *  opcional con el id equivocado. */
export async function cambiarCantidadBici(
  supabase: ComercialClient,
  quoteId: string,
  lineId: string,
  qty: number,
): Promise<{ ok?: true; error?: string }> {
  const { error } = await supabase
    .from("quote_lines")
    .update({ quantity: Math.max(1, Math.round(qty) || 1) })
    .eq("id", lineId)
    .eq("quote_id", quoteId)
    .eq("type", "bike");
  if (error) return { error: mensajeError(error) };
  await supabase.rpc("recompute_quote_total", { p_quote_id: quoteId });
  return { ok: true };
}

/**
 * Paso 4 del flujo en bici: el peregrino ya eligió, y esta cotización nace con la bici
 * adentro del total.
 *
 * Por qué una cotización NUEVA y no editar la primera: la primera se le mandó con la flota
 * entera como opcionales para que comparara, y esa versión hay que poder mirarla después
 * (qué le ofrecimos, a qué precio). `parent_quote_id` deja el rastro entre las dos.
 *
 * Lo que NO se copia — PDF, correos enviados, contratos, viajeros y pagos — es lo que
 * pertenece a la vida de la cotización vieja. Copiarlo haría creer que esta ya se mandó,
 * o que un contrato firmado sobre otro total aplica acá.
 */
export async function crearHijaConBici(
  supabase: ComercialClient,
  quoteId: string,
  seleccion: SeleccionBici[],
): Promise<{ ok: true; id: string; code: string; fianza_eur: number } | { ok: false; error: string }> {
  if (!seleccion?.length) return { ok: false, error: "Elegí al menos una bicicleta antes de crear la cotización." };

  const flota = await flotaDeLaCotizacion(supabase, quoteId);
  if ("error" in flota) return { ok: false, error: flota.error };
  const { quote } = flota;

  // Se re-resuelve el precio contra la base: la selección que llega solo dice qué modelo y
  // cuántos, nunca cuánto vale.
  const elegidas: Array<{ bike: BikeWithPrice; qty: number }> = [];
  for (const s of seleccion) {
    const bike = flota.bikes.find((b) => b.id === s.bikeId);
    if (!bike) return { ok: false, error: "Una de las bicicletas elegidas ya no está en la flota activa." };
    if (!bike.price_cs) {
      return { ok: false, error: `${bike.name} no tiene tarifa ${flota.year} para esta ruta. Cargala en el catálogo.` };
    }
    elegidas.push({ bike, qty: Math.max(1, Math.round(s.qty) || 1) });
  }

  const { data: code, error: codeErr } = await supabase.rpc("next_quote_code");
  if (codeErr) return { ok: false, error: mensajeError(codeErr, "No se pudo generar el código de la cotización.") };

  // Validez por defecto: 30 días desde hoy, igual que en el wizard de cotización nueva.
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: nueva, error: insErr } = await supabase
    .from("quotes")
    .insert({
      code,
      parent_quote_id: quoteId,
      client_id: quote.client_id ?? null,
      client_name: quote.client_name ?? null,
      client_phone: quote.client_phone ?? null,
      client_email: quote.client_email ?? null,
      route_id: flota.routeId,
      route_name: quote.route_name ?? null,
      start_date: quote.start_date ?? null,
      end_date: quote.end_date ?? null,
      valid_until: validUntil,
      people: quote.people ?? 1,
      modality: quote.modality ?? null,
      // La ruta no cambia: base, suplemento y sus espejos del lado Pilgrim salen tal cual
      // de `comercial.pricing` y ya estaban bien en la cotización original.
      base_eur: quote.base_eur ?? 0,
      season_supplement_eur: quote.season_supplement_eur ?? 0,
      season_kind: quote.season_kind ?? "regular",
      cost_base_eur: quote.cost_base_eur ?? 0,
      season_supplement_cost_eur: quote.season_supplement_cost_eur ?? 0,
      price_blocks: quote.price_blocks ?? null,
      rooms_json: quote.rooms_json ?? null,
      notes: quote.notes ?? null,
      // La hija hereda de quién nació: si la primera la hizo BayMax, esta también es suya.
      source: quote.source ?? null,
      // `quotes.status` no tiene 'borrador' en su CHECK (ver src/lib/quoteStatus.ts), así
      // que nace en el estado inicial de siempre y Nico la manda cuando la revisa.
      status: DEFAULT_STATUS,
    })
    .select("id,code")
    .single();
  if (insErr || !nueva) return { ok: false, error: mensajeError(insErr, "No se pudo crear la cotización con la bici.") };

  // Los extras ya acordados (seguro, noche extra, casco…) viajan con el peregrino: perderlos
  // obligaría a re-marcarlos uno por uno y a explicarle por qué cambió el total.
  const { data: opcionales } = await supabase
    .from("quote_lines")
    .select("position,description,quantity,unit_price,cost_unit,reference_id")
    .eq("quote_id", quoteId)
    .eq("type", "optional");

  const lineas: Record<string, unknown>[] = [
    ...((opcionales as Array<Record<string, unknown>> | null) || []).map((l) => ({
      quote_id: nueva.id,
      type: "optional",
      position: l.position ?? null,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      cost_unit: l.cost_unit,
      reference_id: l.reference_id ?? null,
    })),
    ...elegidas.map(({ bike, qty }) => lineaDeBici(nueva.id as string, bike, qty)),
  ];
  const { error: linesErr } = await supabase.from("quote_lines").insert(lineas);
  if (linesErr) {
    // Si las líneas fallan queda una cotización vacía que confunde más que ayudar.
    await supabase.from("quotes").delete().eq("id", nueva.id);
    return { ok: false, error: mensajeError(linesErr, "No se pudieron copiar las líneas a la cotización nueva.") };
  }

  await supabase.rpc("recompute_quote_total", { p_quote_id: nueva.id });

  const unidades = elegidas.reduce((s, e) => s + e.qty, 0);
  return { ok: true, id: nueva.id as string, code: nueva.code as string, fianza_eur: unidades * FIANZA_POR_BICI_EUR };
}
