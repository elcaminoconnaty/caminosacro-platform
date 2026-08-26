"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { construirEncargoIdeas, interpretarIdeas, type ContextoIdeas } from "@/lib/contenido/ideas";
import { encolar, consultarTrabajo, marcarConsumido, estadoDelWorker } from "@/lib/contenido/cola";
import { esFormatoId, FORMATO_POR_DEFECTO } from "@/lib/contenido/formatos";
import { plantilla, valoresPorDefecto } from "@/lib/contenido/plantillas/registry";
import { leerSlides, type Slide } from "@/lib/contenido/tipos";

/**
 * Encarga las ideas. Igual que el copy: no habla con Claude, deja el pedido en la cola.
 * El contexto con el que se armó (las evidencias y su n) viaja dentro del encargo para
 * poder pegárselo a las ideas cuando vuelvan.
 */
export async function encargarIdeas() {
  try {
    const { encargo, contexto } = await construirEncargoIdeas();
    const r = await encolar("ideas", { ...encargo, contexto } as never);
    if ("error" in r && r.error) return { error: r.error };
    const worker = await estadoDelWorker();
    return { ok: true as const, trabajoId: r.trabajoId, workerEncendido: worker.encendido, contexto };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo preparar el encargo de ideas." };
  }
}

/** Pregunta si el encargo ya está. Si lo está, guarda las ideas en la bandeja. */
export async function recogerIdeas(trabajoId: number, contexto: ContextoIdeas) {
  // Igual que `encargarIdeas`: esta acción la llama un `setTimeout` en el cliente para
  // sondear, no un `<form>`. Sin atrapar, un fallo de `consultarTrabajo` o
  // `interpretarIdeas` (JSON mal formado, etc.) tumbaría toda la pantalla de `/contenido`
  // en vez de avisar en la barra de "Qué publicar".
  try {
    const t = await consultarTrabajo(trabajoId);

    if (t.estado === "pendiente" || t.estado === "tomado") {
      return { esperando: true as const, posicion: t.posicion };
    }
    if (t.estado === "error") return { error: t.error };
    if (t.estado !== "listo") return { error: "Ese encargo ya no existe." };

    const r = interpretarIdeas(t.resultado, contexto);
    if (!("ok" in r) || !r.ideas) return { error: "error" in r ? r.error : "Respuesta inesperada." };
    const ideas = r.ideas;

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
        slides: i.slides,
        fuente_dato: i.fuente_dato,
      })),
    );
    if (error) return { error: mensajeError(error) };

    await marcarConsumido(trabajoId);
    revalidatePath("/contenido");
    return { ok: true as const, cuantas: ideas.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron recoger las ideas." };
  }
}

/**
 * Respaldo para ideas que llegaron sin `slides` (worker viejo, o Claude no dio
 * suficientes slides válidos): portada con el titular de la idea, el slide que la idea
 * sugiere, y el cierre. Es el comportamiento de siempre, ahora relegado a respaldo.
 */
function slidesDeRelleno(idea: {
  titular: string;
  ruta_nombre: string | null;
  plantilla_sugerida: string | null;
}): Slide[] {
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

  const sugerida = idea.plantilla_sugerida ? plantilla(idea.plantilla_sugerida) : null;
  if (sugerida && sugerida.definicion.id !== "portada-ruta" && sugerida.definicion.rol !== "cierre") {
    slides.push({
      plantilla: sugerida.definicion.id,
      valores: valoresPorDefecto(sugerida.definicion.id),
      foto: null,
    });
  }

  // MÍNIMO 4 SLIDES, TAMBIÉN POR AQUÍ. `completarSlides()` en ideas.ts garantiza el rango
  // para el carrusel que escribe Claude, pero este es el camino de RESPALDO —cuando la
  // idea vino sin slides— y se quedaba en tres. Una pieza sembrada así ya apareció con 3.
  // La regla es de producto, no del generador: tiene que valer en los dos caminos.
  const RELLENOS = ["tip-numerado", "dato-grande", "mito-realidad"];
  let i = 0;
  while (slides.length < 3 && i < RELLENOS.length) {
    const id = RELLENOS[i++];
    if (!plantilla(id) || slides.some((s) => s.plantilla === id)) continue;
    slides.push({ plantilla: id, valores: valoresPorDefecto(id), foto: null });
  }

  slides.push({ plantilla: "cierre-cta", valores: valoresPorDefecto("cierre-cta"), foto: null });
  return slides;
}

/**
 * Convierte una idea en una pieza ya armada. Si la idea trae el carrusel ya redactado
 * (`slides`), lo usa tal cual y en su orden; si no, cae al relleno de siempre. La gracia
 * es que aceptar una idea no deje al usuario frente a un lienzo en blanco.
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

  // La idea ya trae el carrusel redactado (validado contra el registry al guardarse):
  // úsalo tal cual, en su orden. Si vino vacío (worker viejo, o Claude no dio suficientes
  // slides válidos), cae al relleno de siempre para no dejar al usuario en blanco.
  const { slides: slidesIdea } = leerSlides(idea.slides);
  const slides: Slide[] = slidesIdea.length > 0 ? slidesIdea : slidesDeRelleno(idea);

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

  await supabase.from("contenido_ideas").update({ estado: "usada", pieza_id: pieza.id }).eq("id", id);

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
