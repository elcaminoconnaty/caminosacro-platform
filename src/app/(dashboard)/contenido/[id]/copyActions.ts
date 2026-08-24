"use server";

import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { sugerirCopy } from "@/lib/contenido/copy";
import { ClaudeNoDisponible } from "@/lib/contenido/claude";
import { revisarVoz } from "@/lib/contenido/vozLint";
import { leerSlides } from "@/lib/contenido/tipos";
import { refrescarDesdeCatalogo } from "@/lib/contenido/datos";

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

export async function pedirCopy(id: string) {
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

    // El copy tiene que hablar de los precios de HOY: se releen del catálogo antes de
    // pedírselo a Claude, igual que hace el render.
    const frescos = await refrescarDesdeCatalogo(slides);

    const r = await sugerirCopy({ slides: frescos, formato: pieza.formato, pilarSugerido: pieza.pilar });

    // Se guarda de una: si el usuario cierra la pestaña, no pierde lo que acaba de pagar.
    await supabase
      .from("contenido_piezas")
      .update({ caption: r.caption, hashtags: r.hashtags, pilar: r.pilar })
      .eq("id", id);

    return { ok: true as const, caption: r.caption, hashtags: r.hashtags, hallazgos: r.hallazgos };
  } catch (e) {
    if (e instanceof ClaudeNoDisponible) return { error: e.message };
    return { error: e instanceof Error ? e.message : "No se pudo escribir el copy." };
  }
}
