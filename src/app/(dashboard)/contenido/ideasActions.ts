"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { sugerirQuePublicar } from "@/lib/contenido/ideas";
import { FaltaClaveAnthropic } from "@/lib/contenido/claude";
import { esFormatoId, FORMATO_POR_DEFECTO } from "@/lib/contenido/formatos";
import { plantilla, valoresPorDefecto } from "@/lib/contenido/plantillas/registry";
import type { Slide } from "@/lib/contenido/tipos";

export async function generarIdeas() {
  try {
    const ideas = await sugerirQuePublicar();
    const supabase = await createPublicSchemaClient();
    const { error } = await supabase.from("contenido_ideas").insert(
      ideas.map((i) => ({
        titular: i.titular,
        pilar: i.pilar,
        formato: i.formato,
        plantilla_sugerida: i.plantilla_sugerida,
        angulo: i.angulo,
        razon: i.razon,
        evidencia: i.evidencia,
        ruta_nombre: i.ruta_nombre,
      })),
    );
    if (error) return { error: mensajeError(error) };
    revalidatePath("/contenido");
    return { ok: true as const, cuantas: ideas.length };
  } catch (e) {
    if (e instanceof FaltaClaveAnthropic) return { error: e.message };
    return { error: e instanceof Error ? e.message : "No se pudieron generar ideas." };
  }
}

/**
 * Convierte una idea en una pieza ya armada: portada con el titular de la idea, el slide
 * que la idea sugiere, y el cierre. La gracia es que aceptar una idea no deje al usuario
 * frente a un lienzo en blanco.
 */
export async function aceptarIdea(id: number) {
  const supabase = await createPublicSchemaClient();
  const { data: idea, error: errLeer } = await supabase
    .from("contenido_ideas")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (errLeer) return { error: mensajeError(errLeer) };
  if (!idea) return { error: "Esa idea ya no existe." };

  const formato = esFormatoId(idea.formato ?? "") ? idea.formato : FORMATO_POR_DEFECTO;

  const slides: Slide[] = [
    {
      plantilla: "portada-ruta",
      valores: {
        ...valoresPorDefecto("portada-ruta"),
        titular: idea.titular,
        eyebrow: idea.ruta_nombre ?? valoresPorDefecto("portada-ruta").eyebrow ?? "",
      },
      foto: null,
    },
  ];

  // El slide que la idea sugiere, si esa plantilla existe y no es ya la portada.
  const sugerida = idea.plantilla_sugerida ? plantilla(idea.plantilla_sugerida) : null;
  if (sugerida && sugerida.definicion.id !== "portada-ruta" && sugerida.definicion.rol !== "cierre") {
    slides.push({
      plantilla: sugerida.definicion.id,
      valores: valoresPorDefecto(sugerida.definicion.id),
      foto: null,
    });
  }

  slides.push({ plantilla: "cierre-cta", valores: valoresPorDefecto("cierre-cta"), foto: null });

  const { data: pieza, error } = await supabase
    .from("contenido_piezas")
    .insert({
      titulo: idea.titular.slice(0, 80),
      formato,
      slides,
      pilar: idea.pilar,
      idea_id: idea.id,
    })
    .select("id")
    .single();

  if (error) return { error: mensajeError(error) };

  await supabase
    .from("contenido_ideas")
    .update({ estado: "usada", pieza_id: pieza.id })
    .eq("id", id);

  revalidatePath("/contenido");
  redirect(`/contenido/${pieza.id}`);
}

export async function descartarIdea(id: number) {
  const supabase = await createPublicSchemaClient();
  const { error } = await supabase.from("contenido_ideas").update({ estado: "descartada" }).eq("id", id);
  if (error) return { error: mensajeError(error) };
  revalidatePath("/contenido");
  return { ok: true as const };
}
