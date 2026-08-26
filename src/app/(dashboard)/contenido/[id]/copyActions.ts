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
  // Envuelto en try/catch a propósito: `refrescarDesdeCatalogo`, `construirEncargoCopy` y
  // `encolar` pueden lanzar (catálogo caído, cola sin migrar, etc.) y esta acción la llama
  // un botón del editor, no un `<form action>`. Si algo de esto lanza sin atraparse, React
  // lo trata como un error no manejado del boundary más cercano y tumba TODA la pantalla
  // del editor con un "This page couldn't load" — el mismo fallo que ya se documentó en
  // `src/lib/contenido/arranques.ts`, solo que disparado en tiempo de uso y no de build.
  try {
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
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo preparar el encargo de copy." };
  }
}

/** Pregunta si el encargo ya está. Si lo está, guarda el copy y lo devuelve revisado. */
export async function recogerCopy(piezaId: string, trabajoId: number) {
  // Mismo motivo que en `encargarCopy`: esta acción la sondea un `setTimeout` en el
  // cliente, no un `<form>`; sin atrapar, un fallo de `consultarTrabajo` o
  // `interpretarCopy` tumbaría la pantalla en vez de mostrarse como aviso.
  try {
    const t = await consultarTrabajo(trabajoId);

    if (t.estado === "pendiente" || t.estado === "tomado") {
      return { esperando: true as const, posicion: t.posicion };
    }
    if (t.estado === "error") return { error: t.error };
    if (t.estado !== "listo") return { error: "Ese encargo ya no existe." };

    const r = interpretarCopy(t.resultado);
    if ("error" in r && r.error) return { error: r.error };

    const supabase = await createPublicSchemaClient();
    const { error } = await supabase
      .from("contenido_piezas")
      .update({ caption: r.caption, hashtags: r.hashtags, pilar: r.pilar })
      .eq("id", piezaId);
    if (error) return { error: mensajeError(error) };
    await marcarConsumido(trabajoId);

    return { ok: true as const, caption: r.caption, hashtags: r.hashtags, hallazgos: r.hallazgos };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo recoger el copy." };
  }
}

export async function consultarWorker() {
  return estadoDelWorker();
}
