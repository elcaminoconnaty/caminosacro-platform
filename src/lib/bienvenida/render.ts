import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { ComercialClient } from "@/lib/quotes/pdf";
import { etapasCaminadas, etapasDeCondiciones, type EtapaItinerario } from "@/lib/quotes/itinerario";
import { extrasDeLineas, habitacionesDelGrupo } from "@/lib/quotes/extrasItinerario";
import { mensajeError } from "@/lib/errors";
import { introRuta, mezclarTextosCarta, tituloRuta, type TextosCarta } from "@/lib/bienvenida/textos";
import type { FilaCarta } from "@/lib/bienvenida/cartaPdf";

/**
 * Todo lo que la carta necesita de una cotización, ya resuelto.
 *
 * El itinerario es el MISMO que el del PDF de la cotización: el propio de la cotización
 * (`condiciones_json.etapas`) si se editó en el seguimiento, si no el del catálogo; más las
 * noches extra en Santiago y los tours contratados. Así la carta nunca le cuenta al
 * peregrino un viaje distinto del que compró.
 */
export type DatosCarta = {
  code: string;
  titulo: string;
  intro: string;
  cifras: string;
  itinerario: FilaCarta[];
  textos: TextosCarta;
  /** De dónde salió el itinerario, para decírselo a Nico en la tarjeta. */
  fuente: "cotizacion" | "catalogo";
};

/** Clave de `comercial.settings` con los textos de la carta. Ver @/lib/bienvenida/textos. */
export const CARTA_BIENVENIDA_KEY = "carta_bienvenida";

/** Los textos de Configuración, completados con los de fábrica donde falte algo. */
export async function getTextosCarta(supabase: ComercialClient): Promise<TextosCarta> {
  const { data } = await supabase.from("settings").select("value").eq("key", CARTA_BIENVENIDA_KEY).maybeSingle();
  return mezclarTextosCarta(data?.value ?? null);
}

const fmtKm = (km: number) => `${Math.round(km * 10) / 10} km`;

/** "Santiago de Compostela" → "Santiago", como en las cartas originales. */
const corto = (lugar: string | null | undefined) => {
  const t = (lugar ?? "").trim();
  return /santiago/i.test(t) ? "Santiago" : t;
};

export async function datosCartaBienvenida(
  supabase: ComercialClient,
  quoteId: string,
): Promise<{ ok: true; datos: DatosCarta } | { error: string }> {
  const [{ data: quote }, { data: servicios }, { data: lineas }, textos] = await Promise.all([
    supabase
      .from("quotes")
      .select("code,route_id,route_name,condiciones_json,rooms_json,modality,people")
      .eq("id", quoteId)
      .maybeSingle(),
    // Solo los activos, igual que el PDF de la cotización (ver @/lib/quotes/pdf).
    supabase.from("optional_services").select("id,category").eq("active", true),
    supabase
      .from("quote_lines")
      .select("description,quantity,reference_id")
      .eq("quote_id", quoteId)
      .eq("type", "optional"),
    getTextosCarta(supabase),
  ]);
  if (!quote) return { error: "Cotización no encontrada" };

  // La ruta se busca como la busca la ficha del seguimiento: por id, o por nombre.
  const rutaQ = supabase.from("routes").select("id,name,family,origin,destination,difficulty,modality");
  const { data: ruta } = quote.route_id
    ? await rutaQ.eq("id", quote.route_id).maybeSingle()
    : await rutaQ.eq("name", quote.route_name ?? "").maybeSingle();

  let etapas: EtapaItinerario[] = etapasCaminadas(etapasDeCondiciones(quote.condiciones_json));
  let fuente: DatosCarta["fuente"] = "cotizacion";
  if (etapas.length === 0 && ruta?.id) {
    const { data: st } = await supabase
      .from("route_stages")
      .select("day,from_place,to_place,km,accommodation")
      .eq("route_id", ruta.id)
      .order("day");
    etapas = etapasCaminadas(
      ((st || []) as Array<EtapaItinerario & { km: number | string | null }>).map((e) => ({
        ...e,
        km: e.km != null ? Number(e.km) : null,
      })),
    );
    fuente = "catalogo";
  }
  if (etapas.length === 0) {
    return { error: "Esta cotización no tiene itinerario. Cárgalo en la tarjeta de Itinerario y vuelve a generar la carta." };
  }

  const categorias = new Map<string, string>();
  for (const o of (servicios || []) as Array<{ id: string; category: string }>) categorias.set(o.id, o.category);
  const extras = extrasDeLineas(
    (lineas || []) as Array<{ description: string; quantity: number | string; reference_id: string | null }>,
    categorias,
    habitacionesDelGrupo(quote),
  );

  const origen = etapas[0].from_place || ruta?.origin || null;
  const ultimo = etapas[etapas.length - 1].to_place || ruta?.destination || "Santiago de Compostela";
  const destino = corto(ultimo);
  const km = etapas.reduce((a, e) => a + (Number(e.km) || 0), 0);
  const enBici = String(ruta?.modality || "").toLowerCase() === "bici";

  // Día 1 llegada, una fila por etapa, las noches extra y el fin de servicios: la misma
  // cuenta que `buildItinerarioStages` en @/lib/quotePdf.
  const filas: FilaCarta[] = [{ dia: 1, etapa: `Llegada a ${origen || "—"}`, distancia: "—" }];
  etapas.forEach((e, i) => {
    const tramo = e.from_place && e.to_place ? `${e.from_place} → ${e.to_place}` : (e.to_place || e.from_place || "—");
    filas.push({ dia: i + 2, etapa: tramo, distancia: fmtKm(Number(e.km) || 0) });
  });
  const nochesExtra = extras?.extraNights ?? 0;
  const tours = extras?.tours ?? [];
  for (let i = 0; i < nochesExtra; i++) {
    const etapa = i < nochesExtra - 1
      ? tours[i] || `Día libre en ${destino}`
      : tours.slice(i).join(" · ") || `Día libre en ${destino}`;
    filas.push({ dia: etapas.length + 2 + i, etapa, distancia: "—" });
  }
  const fin = nochesExtra === 0 && tours.length > 0
    ? `${destino} · Fin de servicios · ${tours.join(" · ")}`
    : `${destino} · Fin de servicios`;
  filas.push({ dia: etapas.length + 2 + nochesExtra, etapa: fin, distancia: "—" });

  const dias = etapas.length + 2 + nochesExtra;
  const noches = etapas.length + 1 + nochesExtra;
  const dificultad = (ruta?.difficulty || "Media").toLowerCase();
  const cifras = [
    `${dias} días`,
    `${noches} noches`,
    `${etapas.length} ${etapas.length === 1 ? "etapa" : "etapas"}`,
    `${Math.round(km)} km`,
    enBici ? "En bici" : "A pie",
    `Dificultad ${dificultad}`,
  ].join(" · ");

  const datosRuta = {
    familia: ruta?.family ?? null,
    nombre: ruta?.name ?? quote.route_name ?? null,
    origen,
    enBici,
    km,
    etapas: etapas.length,
  };

  return {
    ok: true,
    datos: {
      code: quote.code,
      titulo: tituloRuta(datosRuta),
      intro: introRuta(datosRuta, textos),
      cifras,
      itinerario: filas,
      textos,
      fuente,
    },
  };
}

/** Nombre del archivo que descarga Nico: el código y la ruta, como el resto de documentos. */
export function nombreArchivoCarta(code: string, titulo: string): string {
  const limpio = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `Bienvenida_${limpio}_${code}.pdf`;
}

/**
 * El PDF. `titulo` e `intro` sustituyen a los sugeridos cuando Nico los corrigió en la
 * tarjeta; vacíos, van los de siempre.
 */
export async function renderCartaBienvenida(
  supabase: ComercialClient,
  quoteId: string,
  corregidos: { titulo?: string | null; intro?: string | null } = {},
): Promise<{ ok: true; buffer: Buffer; filename: string } | { error: string }> {
  const r = await datosCartaBienvenida(supabase, quoteId);
  if ("error" in r) return r;
  const d = r.datos;
  const titulo = corregidos.titulo?.trim() || d.titulo;
  const intro = corregidos.intro?.trim() || d.intro;

  let portada: Buffer | undefined;
  try {
    portada = fs.readFileSync(path.join(process.cwd(), "src/lib/bienvenida/portada.jpg"));
  } catch {
    // sin foto, la portada queda en verde
  }

  const React = await import("react");
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { CartaBienvenidaPDF } = await import("@/lib/bienvenida/cartaPdf");
  try {
    const element = React.createElement(CartaBienvenidaPDF, {
      titulo,
      intro,
      cifras: d.cifras,
      itinerario: d.itinerario,
      textos: d.textos,
      portada,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);
    return { ok: true, buffer, filename: nombreArchivoCarta(d.code, titulo) };
  } catch (e) {
    console.error("[cartaBienvenida] render falló:", e);
    return { error: mensajeError(e as Error, "No se pudo generar la carta de bienvenida.") };
  }
}
