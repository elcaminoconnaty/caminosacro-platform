import "server-only";

import type { ComercialClient } from "@/lib/quotes/pdf";
import { mensajeError } from "@/lib/errors";
import { DEFAULT_STATUS } from "@/lib/quoteStatus";

/**
 * Duplica una cotización que ya existe.
 *
 * Es el hueco que `CRITERIOS.md` §1 daba por resuelto y no lo estaba: para volver a
 * cotizarle a alguien con dos noches más, o para armarle a otro cliente lo mismo que ya se
 * armó una vez, había que rehacer el recorrido entero del asistente y volver a marcar los
 * opcionales uno por uno.
 *
 * No es motor nuevo: es la misma mecánica de `crearHijaConBici` —la cotización hija del
 * flujo de bicis—, generalizada. Lo que cambia es que aquí se copian **todas** las líneas,
 * no solo los opcionales, porque una copia tiene que salir valiendo lo mismo que el
 * original; allá las bicis se re-resolvían contra el catálogo porque el peregrino acababa
 * de elegirlas.
 *
 * **Lo que NO se copia, y por qué.** El PDF, las fechas de correo enviado, los contratos,
 * los viajeros y los pagos pertenecen a la vida de la cotización vieja. Copiarlos haría
 * creer que esta ya se mandó, o que un contrato firmado sobre otro total aplica acá. Los
 * hoteles asignados tampoco: se eligieron para unas fechas concretas y lo normal al
 * duplicar es moverlas.
 *
 * La copia nace en el estado inicial (`sin_enviar`) y con validez de 30 días desde hoy: es
 * una cotización nueva, aunque su contenido venga de otra.
 */
export async function duplicarCotizacion(
  supabase: ComercialClient,
  quoteId: string,
): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
  const { data: original, error: leerErr } = await supabase
    .from("quotes")
    .select("id,client_id,client_name,client_phone,client_email,route_id,route_name,start_date,end_date,people,modality,base_eur,season_supplement_eur,season_kind,cost_base_eur,season_supplement_cost_eur,price_blocks,rooms_json,notes,source")
    .eq("id", quoteId)
    .maybeSingle();
  if (leerErr) return { ok: false, error: mensajeError(leerErr, "No se pudo leer la cotización original.") };
  if (!original) return { ok: false, error: "Esa cotización ya no existe." };

  const q = original as Record<string, unknown>;

  const { data: code, error: codeErr } = await supabase.rpc("next_quote_code");
  if (codeErr) return { ok: false, error: mensajeError(codeErr, "No se pudo generar el código de la cotización.") };

  // Validez por defecto: 30 días desde hoy, igual que en el asistente y en la hija de bici.
  const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const { data: nueva, error: insErr } = await supabase
    .from("quotes")
    .insert({
      code,
      // Deja el rastro de dónde salió, que es la misma columna que usa la hija de bici.
      parent_quote_id: quoteId,
      client_id: q.client_id ?? null,
      client_name: q.client_name ?? null,
      client_phone: q.client_phone ?? null,
      client_email: q.client_email ?? null,
      route_id: q.route_id ?? null,
      route_name: q.route_name ?? null,
      start_date: q.start_date ?? null,
      end_date: q.end_date ?? null,
      valid_until: validUntil,
      people: q.people ?? 1,
      modality: q.modality ?? null,
      // El dinero se copia tal cual: una copia que valiera distinto que el original no
      // serviría para lo que se usa esto. Si hay que re-tarifar, se hace editando.
      base_eur: q.base_eur ?? 0,
      season_supplement_eur: q.season_supplement_eur ?? 0,
      season_kind: q.season_kind ?? "regular",
      cost_base_eur: q.cost_base_eur ?? 0,
      season_supplement_cost_eur: q.season_supplement_cost_eur ?? 0,
      price_blocks: q.price_blocks ?? null,
      rooms_json: q.rooms_json ?? null,
      notes: q.notes ?? null,
      source: q.source ?? null,
      status: DEFAULT_STATUS,
    })
    .select("id,code")
    .single();
  if (insErr || !nueva) return { ok: false, error: mensajeError(insErr, "No se pudo crear la copia.") };

  // Todas las líneas: opcionales, bicis y los opcionales a la medida. Sin ellas la copia
  // saldría más barata que el original sin que nadie lo note, que es exactamente el error
  // que este atajo debería evitar.
  const { data: lineas, error: lineasErr } = await supabase
    .from("quote_lines")
    .select("type,position,description,quantity,unit_price,cost_unit,reference_id")
    .eq("quote_id", quoteId);

  if (lineasErr) {
    await supabase.from("quotes").delete().eq("id", nueva.id);
    return { ok: false, error: mensajeError(lineasErr, "No se pudieron leer las líneas de la cotización original.") };
  }

  const filas = ((lineas as Array<Record<string, unknown>> | null) || []).map((l) => ({
    quote_id: nueva.id,
    type: l.type,
    position: l.position ?? null,
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unit_price,
    cost_unit: l.cost_unit,
    reference_id: l.reference_id ?? null,
  }));

  if (filas.length > 0) {
    const { error: copiaErr } = await supabase.from("quote_lines").insert(filas);
    if (copiaErr) {
      // Una cotización a medio copiar confunde más que no tenerla: se deshace entera.
      await supabase.from("quotes").delete().eq("id", nueva.id);
      return { ok: false, error: mensajeError(copiaErr, "No se pudieron copiar las líneas a la copia.") };
    }
  }

  // `total_eur` y `cost_eur` son derivados: los calcula la base, nunca se escriben a mano.
  await supabase.rpc("recompute_quote_total", { p_quote_id: nueva.id });

  return { ok: true, id: nueva.id as string, code: nueva.code as string };
}
