import "server-only";

import { z } from "zod";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { createCommercialClient } from "@/lib/supabase/server";
import { aJsonSchema, type Encargo } from "./encargo";
import { SYSTEM_PROMPT, PILARES, RUTAS } from "./estrategia";
import { PLANTILLAS_LISTA } from "./plantillas/registry";

/**
 * "¿Qué publico?" respondido con datos, no con intuición.
 *
 * ADVERTENCIA DE HONESTIDAD ESTADÍSTICA — es la decisión de diseño central de este
 * archivo. La cuenta tiene ~18 posts y ~15 filas de métricas. Con esos volúmenes, decir
 * "el pilar X rinde 0.08 contra 0.034 del promedio" es ruido presentado como hallazgo, y
 * es la forma más rápida de que el módulo pierda credibilidad la primera semana.
 * Por eso:
 *   - toda evidencia lleva SU n, y la interfaz la muestra al lado de la afirmación;
 *   - por debajo de UMBRAL_SENAL la señal se marca como débil y no se afirma nada;
 *   - el peso real lo llevan las señales que sí aguantan este tamaño de muestra:
 *     los aprendizajes que ya destila el bot semanalmente, el calendario editorial, y
 *     sobre todo las COTIZACIONES — qué rutas pide la gente de verdad, que no depende
 *     de Instagram en absoluto.
 */
const UMBRAL_SENAL = 5;

export const RespuestaIdeas = z.object({
  ideas: z
    .array(
      z.object({
        titular: z.string(),
        pilar: z.string(),
        plantilla_sugerida: z.string(),
        formato: z.string(),
        angulo: z.string(),
        razon: z.string(),
        ruta_nombre: z.string().nullable(),
      }),
    )
    .min(3)
    .max(6),
});

type Evidencia = { fuente: string; dato: string; n: number; senal_debil: boolean };

/** Rendimiento por pilar, siempre con la n a la vista. */
async function rendimientoPorPilar(): Promise<{ texto: string; evidencias: Evidencia[] }> {
  const supabase = await createPublicSchemaClient();
  const { data } = await supabase
    .from("posts_log")
    .select("pilar,ruta,post_metricas(reach,saved,shares,profile_visits,likes)")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(60);

  const porPilar = new Map<string, { n: number; comercial: number; alcance: number }>();
  for (const p of data ?? []) {
    const m = Array.isArray(p.post_metricas) ? p.post_metricas[0] : p.post_metricas;
    if (!m || !p.pilar) continue;
    const acc = porPilar.get(p.pilar) ?? { n: 0, comercial: 0, alcance: 0 };
    acc.n += 1;
    // Mismo criterio que la Edge Function `aprender`: pesan lo que indica intención
    // comercial (guardar, compartir, visitar el perfil), no el like.
    acc.comercial += (m.saved ?? 0) + (m.shares ?? 0) + (m.profile_visits ?? 0);
    acc.alcance += m.reach ?? 0;
    porPilar.set(p.pilar, acc);
  }

  const filas = [...porPilar.entries()]
    .map(([pilar, a]) => ({ pilar, ...a, porPost: a.n ? a.comercial / a.n : 0 }))
    .sort((a, b) => b.porPost - a.porPost);

  const evidencias: Evidencia[] = filas.map((f) => ({
    fuente: "instagram",
    dato: `pilar "${f.pilar}": ${f.porPost.toFixed(1)} acciones comerciales por post (alcance medio ${Math.round(f.alcance / Math.max(1, f.n))})`,
    n: f.n,
    senal_debil: f.n < UMBRAL_SENAL,
  }));

  const texto = filas.length
    ? filas
        .map(
          (f) =>
            `- ${f.pilar}: ${f.porPost.toFixed(1)} acciones comerciales por post sobre n=${f.n}` +
            (f.n < UMBRAL_SENAL ? " ⚠️ SEÑAL DÉBIL, no afirmes nada con esto" : ""),
        )
        .join("\n")
    : "- todavía no hay posts con métricas";

  return { texto, evidencias };
}

/** Los aprendizajes que ya destiló el bot semanal: la señal más madura que existe. */
async function aprendizajeVigente(): Promise<string> {
  const supabase = await createPublicSchemaClient();
  const { data } = await supabase
    .from("aprendizajes")
    .select("periodo,resumen")
    .eq("vigente", true)
    .maybeSingle();
  return data ? `Periodo ${data.periodo}:\n${data.resumen}` : "todavía no hay aprendizajes destilados";
}

/** Qué rutas pide la gente de verdad. No depende de Instagram, y por eso vale más. */
async function demandaComercial(): Promise<{ texto: string; evidencias: Evidencia[] }> {
  const supabase = await createCommercialClient();
  const { data } = await supabase
    .from("quotes")
    .select("route_name,start_date,created_at")
    .not("route_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const porRuta = new Map<string, number>();
  const porMes = new Map<number, number>();
  for (const q of data ?? []) {
    porRuta.set(q.route_name, (porRuta.get(q.route_name) ?? 0) + 1);
    if (q.start_date) {
      const mes = new Date(q.start_date).getUTCMonth() + 1;
      porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
    }
  }

  const top = [...porRuta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const meses = [...porMes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const total = data?.length ?? 0;

  const texto = [
    `Cotizaciones analizadas: ${total}.`,
    "Rutas más pedidas:",
    ...top.map(([r, n]) => `- ${r}: ${n} cotizaciones`),
    meses.length ? `Meses de salida más pedidos: ${meses.map(([m, n]) => `mes ${m} (${n})`).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const evidencias: Evidencia[] = top.map(([r, n]) => ({
    fuente: "cotizaciones",
    dato: `"${r}" pedida en ${n} cotizaciones`,
    n,
    senal_debil: n < 3,
  }));

  return { texto, evidencias };
}

/** Rutas del catálogo que nunca han salido en un post: contenido que falta por hacer. */
async function rutasSinPublicar(): Promise<string> {
  const [pub, cat] = await Promise.all([
    (await createPublicSchemaClient()).from("posts_log").select("ruta").not("ruta", "is", null),
    (await createCommercialClient()).from("routes").select("name").eq("active", true),
  ]);
  const publicadas = new Set((pub.data ?? []).map((p) => (p.ruta ?? "").toLowerCase()));
  const sin = (cat.data ?? [])
    .map((r) => r.name)
    .filter((n) => ![...publicadas].some((p) => p && n.toLowerCase().includes(p)));
  return sin.length ? sin.slice(0, 10).join(" · ") : "todas las rutas ya aparecieron alguna vez";
}

/** El tema editorial de esta semana, para que el blog e Instagram hablen de lo mismo. */
async function temaDeLaSemana(): Promise<string> {
  const supabase = await createPublicSchemaClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("blog_calendario")
    .select("fecha,categoria,subcategoria,titulo,keyword")
    .gte("fecha", hoy)
    .order("fecha")
    .limit(5);
  if (!data?.length) return "sin calendario editorial cargado para las próximas fechas";
  return data.map((d) => `- ${d.fecha} · ${d.categoria ?? ""}: ${d.titulo} (keyword: ${d.keyword ?? "—"})`).join("\n");
}

export type IdeaGenerada = z.infer<typeof RespuestaIdeas>["ideas"][number] & {
  evidencia: { items: Evidencia[]; nota: string };
};

/** Contexto con el que se armó el encargo: hay que guardarlo para adjuntarlo a las ideas. */
export type ContextoIdeas = { items: Evidencia[]; nota: string };

export async function construirEncargoIdeas(): Promise<{ encargo: Encargo; contexto: ContextoIdeas }> {
  const [pilares, aprendizaje, demanda, sinPublicar, calendario] = await Promise.all([
    rendimientoPorPilar(),
    aprendizajeVigente(),
    demandaComercial(),
    rutasSinPublicar(),
    temaDeLaSemana(),
  ]);

  const plantillas = PLANTILLAS_LISTA.map(
    (p) => `- ${p.definicion.id} (${p.definicion.nombre}): ${p.definicion.descripcion}`,
  ).join("\n");

  const user = `Propón entre 3 y 6 ideas concretas de publicación para Instagram, basadas SOLO en los datos de abajo.

REGLA INNEGOCIABLE SOBRE LOS DATOS: la cuenta tiene pocos posts todavía. Donde veas
"SEÑAL DÉBIL" NO afirmes que algo funciona: como mucho di que hay un indicio por
confirmar. Las señales fuertes son los aprendizajes destilados y, sobre todo, las
cotizaciones —lo que la gente pide de verdad—, que no dependen de Instagram.
Cada idea DEBE traer una "razon" que cite un dato concreto de abajo. Sin dato verificable,
no propongas la idea.

RENDIMIENTO POR PILAR EN INSTAGRAM (con su n):
${pilares.texto}

APRENDIZAJES YA DESTILADOS (señal fuerte):
${aprendizaje}

DEMANDA COMERCIAL REAL — cotizaciones (señal fuerte, independiente de Instagram):
${demanda.texto}

RUTAS DEL CATÁLOGO QUE NUNCA HAN SALIDO EN UN POST:
${sinPublicar}

CALENDARIO EDITORIAL DEL BLOG (conviene que Instagram acompañe):
${calendario}

PILARES DISPONIBLES (usa el id):
${PILARES.map((p) => `- ${p.id}: ${p.objetivo.slice(0, 140)}`).join("\n")}

PLANTILLAS DISPONIBLES (usa el id en plantilla_sugerida):
${plantillas}

RUTAS CON PRECIO CONOCIDO:
${RUTAS.filter((r) => r.desde).map((r) => `- ${r.nombre}: desde ${r.desde}€ — ${r.detalle}`).join("\n")}

FORMATOS: 4x5 (carrusel de feed, el que más rinde), 1x1, 9x16 (historia), reel (portada).`;

  const items = [...pilares.evidencias, ...demanda.evidencias];
  const debiles = items.filter((e) => e.senal_debil).length;
  const nota =
    debiles > 0
      ? `${debiles} de ${items.length} señales tienen muestra pequeña (n < ${UMBRAL_SENAL}). Tómalas como indicio, no como conclusión.`
      : `Todas las señales superan n = ${UMBRAL_SENAL}.`;

  return {
    encargo: { system: SYSTEM_PROMPT, user, schema: aJsonSchema(RespuestaIdeas) },
    contexto: { items, nota },
  };
}

/** Valida lo que devolvió el worker y le pega la evidencia con la que se pidió. */
export function interpretarIdeas(crudo: unknown, contexto: ContextoIdeas) {
  const r = RespuestaIdeas.safeParse(crudo);
  if (!r.success) return { error: "Claude respondió con una lista que no encaja. Vuelve a intentarlo." };
  return {
    ok: true as const,
    ideas: r.data.ideas.map((i) => ({ ...i, evidencia: contexto })) as IdeaGenerada[],
  };
}
