import "server-only";

import { renderAndStoreQuotePdf, type ComercialClient } from "@/lib/quotes/pdf";
import { mensajeError } from "@/lib/errors";
import { isQuoteStatus, type QuoteStatus } from "@/lib/quoteStatus";
import { tarifarRuta, type TipoAlojamiento } from "@/lib/quotes/tarifar";
import { MAX_PERSONAS_AGENTE } from "@/lib/quotes/agentQuote";
import { leerFilasHabitacion } from "@/lib/quotes/rooms";

/**
 * Editar una cotización que ya existe, con el mismo criterio que la pantalla de
 * Seguimiento pero **sin teclear precios**.
 *
 * Existe porque hasta ahora BayMax solo sabía crear: agregarle el correo a una cotización
 * ya hecha obligaba a recrearla desde cero y dejaba un duplicado en Seguimiento
 * (20-ago-2026, error marcado por Nico).
 *
 * Dos reglas que sostienen todo lo demás:
 *
 * 1. **Si cambia algo que mueve el precio** —ruta, modalidad, fecha de salida o personas—
 *    se vuelve a tarifar desde el catálogo del año de salida. Si ese año no tiene tarifa,
 *    NO se guarda nada: se devuelve `sin_tarifas_ano` y la cotización queda como estaba.
 * 2. **Si no cambia**, el precio no se toca. Es deliberado: cuando el año todavía no tiene
 *    tarifa, Nico teclea la cifra a mano en el CRM, y corregir un correo no puede borrarle
 *    ese número.
 *
 * El PDF se regenera siempre, porque hasta las notas salen en el documento.
 */

export type ModalidadCotizacion = "pension_doble" | "pension_single" | "hotel_doble" | "hotel_single";

export type ParcheCotizacion = {
  nombre?: string | null;
  telefono?: string | null;
  correo?: string | null;
  ruta_slug?: string | null;
  modalidad?: ModalidadCotizacion | null;
  fecha_salida?: string | null;
  personas?: number | null;
  notas?: string | null;
  estado?: string | null;
  valida_hasta?: string | null;
};

export type ResultadoEdicion =
  | { ok: true; cambios: string[]; avisos: string[]; retarifada: boolean; pdf_regenerado: boolean }
  | { ok: false; status: number; error: string; detalle?: string };

/** Del texto libre de `quotes.modality` a la modalidad del catálogo, si se puede. */
function modalidadGuardada(
  modality: string | null,
  rooms: { tipo?: string; dobles?: number; individuales?: number } | null,
): { tipo: TipoAlojamiento; todosIndividuales: boolean } | null {
  // `rooms_json` es el dato duro y sobrevive a cualquier etiqueta mixta.
  if (rooms?.tipo === "pension" || rooms?.tipo === "hotel") {
    return { tipo: rooms.tipo, todosIndividuales: (Number(rooms.dobles) || 0) === 0 };
  }
  const m = (modality ?? "").toLowerCase();
  const tipo: TipoAlojamiento | null = m.includes("hotel")
    ? "hotel"
    : m.includes("pensión") || m.includes("pension")
      ? "pension"
      : null;
  if (!tipo) return null;
  const hayDoble = m.includes("doble");
  const haySingle = m.includes("single") || m.includes("individual");
  if (haySingle && !hayDoble) return { tipo, todosIndividuales: true };
  if (hayDoble && !haySingle) return { tipo, todosIndividuales: false };
  return null; // etiqueta mixta sin rooms_json: no hay una modalidad única que reusar
}

export async function actualizarCotizacion(
  supabase: ComercialClient,
  quoteId: string,
  parche: ParcheCotizacion,
): Promise<ResultadoEdicion> {
  const { data: quote } = await supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (!quote) return { ok: false, status: 404, error: "cotizacion_no_encontrada" };

  const cambios: string[] = [];
  const avisos: string[] = [];
  const patch: Record<string, unknown> = {};
  const limpio = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    return s === "" ? null : s;
  };

  // ---- Datos que no mueven plata ----
  const nombre = parche.nombre !== undefined ? limpio(parche.nombre) : undefined;
  if (nombre !== undefined && nombre !== quote.client_name) {
    patch.client_name = nombre;
    cambios.push(`nombre → ${nombre ?? "—"}`);
  }
  const telefono = parche.telefono !== undefined ? limpio(parche.telefono) : undefined;
  if (telefono !== undefined && telefono !== quote.client_phone) {
    patch.client_phone = telefono;
    cambios.push(`teléfono → ${telefono ?? "—"}`);
  }
  const correo = parche.correo !== undefined ? limpio(parche.correo) : undefined;
  if (correo !== undefined && correo !== quote.client_email) {
    patch.client_email = correo;
    cambios.push(`correo → ${correo ?? "—"}`);
  }
  if (parche.notas !== undefined) {
    const notas = limpio(parche.notas);
    if (notas !== quote.notes) {
      patch.notes = notas;
      cambios.push("notas");
    }
  }
  if (parche.estado !== undefined && parche.estado !== null) {
    if (!isQuoteStatus(parche.estado)) {
      return { ok: false, status: 422, error: "estado_invalido", detalle: `Estado desconocido: ${parche.estado}.` };
    }
    if (parche.estado !== quote.status) {
      patch.status = parche.estado as QuoteStatus;
      cambios.push(`estado → ${parche.estado}`);
    }
  }
  if (parche.valida_hasta !== undefined) {
    const v = limpio(parche.valida_hasta);
    if (v !== quote.valid_until) {
      patch.valid_until = v;
      cambios.push(`válida hasta → ${v ?? "—"}`);
    }
  }

  // ---- Datos que SÍ mueven plata ----
  const personas = parche.personas != null ? Math.round(parche.personas) : null;
  if (personas != null && (personas < 1 || personas > MAX_PERSONAS_AGENTE)) {
    return { ok: false, status: 422, error: "personas_fuera_de_rango", detalle: `Entre 1 y ${MAX_PERSONAS_AGENTE}.` };
  }
  const fechaSalida = parche.fecha_salida ? parche.fecha_salida.trim() : null;
  const rutaSlug = parche.ruta_slug ? parche.ruta_slug.trim() : null;
  const modalidad = parche.modalidad ?? null;

  const cambiaRuta = !!rutaSlug;
  const cambiaFecha = !!fechaSalida && fechaSalida !== quote.start_date;
  const cambiaPersonas = personas != null && personas !== Number(quote.people);
  const cambiaModalidad = !!modalidad;
  const retarifa = cambiaRuta || cambiaFecha || cambiaPersonas || cambiaModalidad;

  if (retarifa) {
    // Ruta: la nueva si la mandaron, si no la que ya tenía (por id y, en las viejas sin
    // `route_id`, por nombre — es como la resuelve el resto de la plataforma).
    let route: { id: string; name: string; days: number | null } | null = null;
    if (rutaSlug) {
      const { data } = await supabase
        .from("routes")
        .select("id,name,days")
        .eq("slug", rutaSlug)
        .eq("active", true)
        .maybeSingle();
      route = data ?? null;
      if (!route) return { ok: false, status: 404, error: "ruta_no_encontrada" };
    } else {
      const q = supabase.from("routes").select("id,name,days");
      const { data } = quote.route_id
        ? await q.eq("id", quote.route_id).maybeSingle()
        : await q.eq("name", quote.route_name).maybeSingle();
      route = data ?? null;
      if (!route) {
        return {
          ok: false,
          status: 409,
          error: "ruta_no_encontrada",
          detalle: "La cotización no está atada a ninguna ruta del catálogo; no se puede volver a tarifar sola.",
        };
      }
    }

    const guardada = modalidadGuardada(
      quote.modality as string | null,
      (quote.rooms_json ?? null) as { tipo?: string; dobles?: number; individuales?: number } | null,
    );
    const tipo: TipoAlojamiento | null = modalidad
      ? modalidad.startsWith("hotel")
        ? "hotel"
        : "pension"
      : (guardada?.tipo ?? null);
    const todosIndividuales = modalidad ? modalidad.endsWith("_single") : (guardada?.todosIndividuales ?? false);
    if (!tipo) {
      return {
        ok: false,
        status: 409,
        error: "modalidad_desconocida",
        detalle: `La cotización tiene la modalidad "${quote.modality ?? "—"}", que no es una del catálogo. Hay que decir cuál va (pension_doble, pension_single, hotel_doble u hotel_single).`,
      };
    }

    const inicio = fechaSalida ?? (quote.start_date as string | null);
    if (!inicio) {
      return { ok: false, status: 422, error: "sin_fecha_salida", detalle: "Sin fecha de salida no hay tarifa: la tarifa es la del año de salida." };
    }
    const gente = personas ?? (Number(quote.people) || 1);

    const r = await tarifarRuta(supabase, { route, tipo, todosIndividuales, personas: gente, startDate: inicio });
    // Nada se guarda si la tarifa no existe: la cotización queda exactamente como estaba.
    if (!r.ok) return { ok: false, status: r.status, error: r.error, detalle: r.detalle };
    const t = r.tarifa;

    patch.route_id = route.id;
    patch.route_name = route.name;
    patch.start_date = inicio;
    patch.end_date = t.endDate;
    patch.people = gente;
    patch.modality = t.modalityLabel;
    patch.base_eur = t.baseEur;
    patch.season_supplement_eur = t.suplementoEur;
    patch.season_kind = t.season.type;
    patch.cost_base_eur = t.costBaseEur;
    patch.season_supplement_cost_eur = t.suplementoCostEur;
    patch.rooms_json = t.roomsJson;
    // Las tarjetas de precio tecleadas a mano se sueltan: si el precio vuelve a salir del
    // catálogo, dejarlas diría en el PDF un número distinto al del total.
    if (quote.price_blocks) {
      patch.price_blocks = null;
      avisos.push("Se soltaron los precios del PDF tecleados a mano: ahora salen del catálogo.");
    }
    // Un reparto a medida (dobles + triples, cada habitación con su precio) no sobrevive a
    // una re-tarifación: `rooms_json` acaba de quedar pisado por el reparto automático. Se
    // avisa porque la cotización pasa a cobrar otra cosa, no porque falle nada.
    if (leerFilasHabitacion(quote.rooms_json).length > 0) {
      avisos.push(
        "Se perdió el reparto de habitaciones a medida: la cotización volvió al reparto automático (pares en doble, el impar en individual). Si el grupo iba en triples, hay que volver a cargarlo en el expediente.",
      );
    }

    if (cambiaRuta) cambios.push(`ruta → ${route.name}`);
    if (cambiaFecha) cambios.push(`salida → ${inicio}`);
    if (cambiaPersonas) cambios.push(`personas → ${gente}`);
    if (cambiaModalidad || cambiaPersonas) cambios.push(`alojamiento → ${t.modalityLabel}`);
    cambios.push(`base ${t.baseEur} € · costo Pilgrim ${t.costBaseEur} €`);
    if (t.season.type !== "regular") {
      cambios.push(`${t.season.label}: +${t.suplementoEur} € (${t.season.surcharge_per_person_cs} €/persona)`);
    }

    if (cambiaPersonas) {
      const { data: lineas } = await supabase
        .from("quote_lines")
        .select("id")
        .eq("quote_id", quoteId)
        .in("type", ["optional", "bike"]);
      if ((lineas?.length ?? 0) > 0) {
        avisos.push(
          `Cambió el número de personas y hay ${lineas!.length} línea(s) de opcionales o bicis con la cantidad vieja: hay que revisarlas.`,
        );
      }
    }
  } else if (parche.fecha_salida || parche.personas != null || parche.modalidad || parche.ruta_slug) {
    avisos.push("No se volvió a tarifar: lo que mandaste ya era lo que tenía la cotización.");
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, cambios: [], avisos: [...avisos, "No había nada que cambiar."], retarifada: false, pdf_regenerado: false };
  }

  const { error } = await supabase.from("quotes").update(patch).eq("id", quoteId);
  if (error) return { ok: false, status: 500, error: mensajeError(error, "no_se_pudo_guardar") };

  // El total y el costo los recalcula la base sumando las líneas: nunca se escriben a mano.
  await supabase.rpc("recompute_quote_total", { p_quote_id: quoteId });

  // El cliente del directorio, para que la próxima cotización no salga con los datos viejos.
  // El teléfono es la llave de deduplicación: solo se mueve si nadie más lo tiene.
  if (quote.client_id && (nombre !== undefined || correo !== undefined || telefono !== undefined)) {
    const cambiosCliente: Record<string, string | null> = {};
    if (nombre !== undefined && nombre) cambiosCliente.full_name = nombre;
    if (correo !== undefined && correo) cambiosCliente.email = correo;
    if (telefono !== undefined && telefono) {
      const { data: otro } = await supabase.from("clients").select("id").eq("phone", telefono).maybeSingle();
      if (!otro || otro.id === quote.client_id) cambiosCliente.phone = telefono;
      else avisos.push(`Ese teléfono ya es de otro cliente del directorio: se cambió solo en la cotización.`);
    }
    if (Object.keys(cambiosCliente).length > 0) {
      await supabase.from("clients").update(cambiosCliente).eq("id", quote.client_id);
    }
  }

  // El PDF siempre: el documento lleva fechas, personas, notas y precios.
  const pdf = await renderAndStoreQuotePdf(supabase, quoteId);
  const pdfOk = "ok" in pdf && pdf.ok === true;
  if (!pdfOk) avisos.push("El PDF no se pudo regenerar: el documento sigue con los datos viejos.");

  return { ok: true, cambios, avisos, retarifada: retarifa, pdf_regenerado: pdfOk };
}
