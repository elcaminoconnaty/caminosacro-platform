"use server";

import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { construirEncargoCopy, interpretarCopy } from "@/lib/contenido/copy";
import { revisarVoz } from "@/lib/contenido/vozLint";
import { leerSlides } from "@/lib/contenido/tipos";
import { refrescarDesdeCatalogo } from "@/lib/contenido/datos";
import { encolar, consultarTrabajo, marcarConsumido, estadoDelWorker } from "@/lib/contenido/cola";

export async function guardarCopyPieza(id: string, caption: string, hashtags: string) {
  const supabase = await createPublicSchemaClient();
  const { error } = await supabase.from("contenido_piezas").update({ caption, hashtags }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  return { ok: true as const };
}

/** El revisor de voz corre en el servidor para no duplicar la lista de frases prohibidas. */
export async function revisarCopy(caption: string, hashtags: string) {
  return { ok: true as const, hallazgos: revisarVoz(caption, hashtags) };
}

/**
 * Encarga el copy. NO habla con Claude: deja el pedido en la cola y devuelve su número.
 * Quien lo resuelve es el worker del computador de Nico, con la suscripción. Ver la
 * cabecera de la migración 0026.
 */
export async function encargarCopy(id: string) {
  const supabase = await createPublicSchemaClient();
  const { data: pieza, error } = await supabase
    .from("contenido_piezas")
    .select("formato,slides,pilar")
    .eq("id", id)
    .maybeSingle();

  if (error) return { error: mensajeError(error) };
  if (!pieza) return { error: "Esa pieza ya no existe." };

  const { slides } = leerSlides(pieza.slides);
  if (slides.length === 0) return { error: "La pieza no tiene slides todavía." };

  // El copy tiene que hablar de los precios de HOY: se releen del catálogo antes de armar
  // el encargo, igual que hace el render.
  const frescos = await refrescarDesdeCatalogo(slides);
  const encargo = construirEncargoCopy({
    slides: frescos,
    formato: pieza.formato,
    pilarSugerido: pieza.pilar,
  });

  const r = await encolar("copy", encargo, id);
  if ("error" in r && r.error) return { error: r.error };

  const worker = await estadoDelWorker();
  return { ok: true as const, trabajoId: r.trabajoId, workerEncendido: worker.encendido };
}

/** Pregunta si el encargo ya está. Si lo está, guarda el copy y lo devuelve revisado. */
export async function recogerCopy(piezaId: string, trabajoId: number) {
  const t = await consultarTrabajo(trabajoId);

  if (t.estado === "pendiente" || t.estado === "tomado") {
    return { esperando: true as const, posicion: t.posicion };
  }
  if (t.estado === "error") return { error: t.error };
  if (t.estado !== "listo") return { error: "Ese encargo ya no existe." };

  const r = interpretarCopy(t.resultado);
  if ("error" in r && r.error) return { error: r.error };

  const supabase = await createPublicSchemaClient();
  await supabase
    .from("contenido_piezas")
    .update({ caption: r.caption, hashtags: r.hashtags, pilar: r.pilar })
    .eq("id", piezaId);
  await marcarConsumido(trabajoId);

  return { ok: true as const, caption: r.caption, hashtags: r.hashtags, hallazgos: r.hallazgos };
}

export async function consultarWorker() {
  return estadoDelWorker();
}
