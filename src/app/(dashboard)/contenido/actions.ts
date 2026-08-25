"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { FORMATO_POR_DEFECTO, esFormatoId } from "@/lib/contenido/formatos";
import { valoresPorDefecto, plantilla } from "@/lib/contenido/plantillas/registry";
import type { Slide } from "@/lib/contenido/tipos";

/**
 * Puntos de partida de una pieza nueva.
 *
 * Antes solo había uno —portada de ruta + cierre— y eso empujaba TODO el contenido a
 * hablar de una ruta del catálogo. Nico lo dijo: "para agregar slides solo tengo unas
 * opciones limitadas a las mismas rutas". Empezar por un consejo, una duda frecuente o
 * una cifra son maneras legítimas de aportar valor sin vender nada.
 *
 * Todos arrancan con contenido real de la marca (los `porDefecto` de cada plantilla salen
 * de TIPS y FAQS de estrategia.ts), nunca con un lienzo en blanco: el módulo promete
 * cambiar textos, no inventar desde cero.
 */
export const ARRANQUES = {
  ruta: {
    etiqueta: "Una ruta del catálogo",
    ayuda: "Portada con km, días y precio reales. Eliges la ruta y se autollena.",
    plantillas: ["portada-ruta", "etapas-ruta", "cierre-cta"],
  },
  consejo: {
    etiqueta: "Un consejo del Camino",
    ayuda: "Aporta valor sin vender: el pilar que mejor conecta con la comunidad.",
    plantillas: ["tip-numerado", "lista-empaque", "cierre-cta"],
  },
  pregunta: {
    etiqueta: "Una duda frecuente",
    ayuda: "La pregunta que más se repite, respondida con seguridad.",
    plantillas: ["pregunta-grande", "mito-realidad", "cierre-cta"],
  },
  cifra: {
    etiqueta: "Un dato que sorprende",
    ayuda: "Una cifra con contexto, de las que dan ganas de compartir.",
    plantillas: ["cifra-contexto", "dato-grande", "cierre-cta"],
  },
  bici: {
    etiqueta: "El Camino en bici",
    ayuda: "La flota real, con las fotos de las bicicletas.",
    plantillas: ["ficha-bici", "ficha-bici", "cierre-cta"],
  },
  blanco: {
    etiqueta: "Empezar de cero",
    ayuda: "Solo portada y cierre. Tú decides el resto.",
    plantillas: ["portada-ruta", "cierre-cta"],
  },
} as const;

export type ArranqueId = keyof typeof ARRANQUES;

function slidesDeArranque(id: ArranqueId): Slide[] {
  const receta = ARRANQUES[id] ?? ARRANQUES.blanco;
  // Si una plantilla de la receta ya no existe (se renombró), se salta en vez de crear un
  // slide que el editor no sabría dibujar.
  return receta.plantillas
    .filter((pl) => plantilla(pl) !== null)
    .map((pl) => ({ plantilla: pl, valores: valoresPorDefecto(pl), foto: null }));
}

export async function crearPieza(formData: FormData) {
  const formatoCrudo = String(formData.get("formato") ?? "");
  const formato = esFormatoId(formatoCrudo) ? formatoCrudo : FORMATO_POR_DEFECTO;
  const titulo = String(formData.get("titulo") ?? "").trim() || "Pieza sin título";
  const arranqueCrudo = String(formData.get("arranque") ?? "ruta");
  const arranque = (arranqueCrudo in ARRANQUES ? arranqueCrudo : "ruta") as ArranqueId;

  const supabase = await createPublicSchemaClient();
  const { data, error } = await supabase
    .from("contenido_piezas")
    .insert({ titulo, formato, slides: slidesDeArranque(arranque) })
    .select("id")
    .single();

  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  redirect(`/contenido/${data.id}`);
}

export async function duplicarPieza(id: string) {
  const supabase = await createPublicSchemaClient();
  const { data: original, error: errLeer } = await supabase
    .from("contenido_piezas")
    .select("titulo,formato,slides,caption,hashtags,pilar,ruta_id")
    .eq("id", id)
    .maybeSingle();

  if (errLeer) return { error: mensajeError(errLeer) };
  if (!original) return { error: "Esa pieza ya no existe." };

  // La copia arranca siempre en borrador y sin rastro de exportación: es una pieza nueva,
  // no una versión de la anterior.
  const { data, error } = await supabase
    .from("contenido_piezas")
    .insert({ ...original, titulo: `${original.titulo} (copia)`, estado: "borrador" })
    .select("id")
    .single();

  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  return { ok: true as const, id: data.id as string };
}

export async function borrarPieza(id: string) {
  const supabase = await createPublicSchemaClient();
  const { error } = await supabase.from("contenido_piezas").delete().eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  return { ok: true as const };
}

export async function renombrarPieza(id: string, titulo: string) {
  const limpio = titulo.trim();
  if (!limpio) return { error: "El título no puede quedar vacío." };

  const supabase = await createPublicSchemaClient();
  const { error } = await supabase.from("contenido_piezas").update({ titulo: limpio }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  revalidatePath(`/contenido/${id}`);
  return { ok: true as const };
}
