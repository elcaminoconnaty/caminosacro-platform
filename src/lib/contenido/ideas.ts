import "server-only";

import { z } from "zod";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { createCommercialClient } from "@/lib/supabase/server";
import { aJsonSchema, type Encargo } from "./encargo";
import { SYSTEM_PROMPT, PILARES, RUTAS } from "./estrategia";
import { PLANTILLAS_LISTA, plantilla as buscarPlantilla, valoresPorDefecto } from "./plantillas/registry";

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

/**
 * CUÁNTO PESAN LAS MÉTRICAS DE INSTAGRAM, SEGÚN CUÁNTAS HAYA.
 *
 * Nico lo pidió tal cual: "quiero que las sugerencias no salgan de la nada, quiero que
 * salgan cada vez que tenga más y más data de las estadísticas de Instagram (sé que al
 * inicio vas a ser torpe)".
 *
 * La torpeza del principio no se arregla con mejores palabras: se arregla **no fingiendo**.
 * Con 15 posts medidos, cualquier ranking de pilares es ruido, así que el prompt le prohíbe
 * a Claude apoyarse en él y lo manda al catálogo y a las cotizaciones —que no dependen de
 * Instagram y ya tienen volumen—. A medida que entren métricas, el peso se invierte solo,
 * sin que nadie toque nada.
 *
 * Los cortes son a ojo pero no arbitrarios: por debajo de 20 posts casi ningún pilar llega
 * a 5 observaciones (UMBRAL_SENAL), y por encima de 40 la mayoría sí.
 */
const PESO_METRICAS = [
  { desde: 0, peso: "bajo" as const },
  { desde: 20, peso: "medio" as const },
  { desde: 40, peso: "alto" as const },
];

export type PesoMetricas = "bajo" | "medio" | "alto";

export function pesoDeLasMetricas(postsMedidos: number): PesoMetricas {
  return [...PESO_METRICAS].reverse().find((p) => postsMedidos >= p.desde)!.peso;
}

/** Lo que se le dice a Claude sobre cuánto puede fiarse de Instagram. */
function instruccionSegunPeso(peso: PesoMetricas, n: number): string {
  if (peso === "bajo") {
    return `Solo hay ${n} posts medidos en Instagram: DEMASIADO POCO. Las métricas de abajo son
un indicio, no una conclusión, y NO puedes basar una idea únicamente en ellas. Apóyate en el
catálogo, en las cotizaciones y en el calendario editorial, que son señales sólidas. Si citas
una métrica, di explícitamente que está por confirmar.`;
  }
  if (peso === "medio") {
    return `Hay ${n} posts medidos: ya se empiezan a ver tendencias, pero todavía no son firmes.
Puedes apoyarte en las métricas para uno o dos de tus ideas, siempre diciendo sobre cuántos
posts se sostiene. El resto que salga del catálogo y de las cotizaciones.`;
  }
  return `Hay ${n} posts medidos: suficiente para fiarse. Las métricas son ahora tu señal
principal; el catálogo y las cotizaciones sirven para completar lo que Instagram no cubre.`;
}

/** Un slide propuesto por Claude: misma forma que contenido_piezas.slides, sin la foto. */
const SlidePropuesto = z.object({
  plantilla: z.string(),
  valores: z.record(z.string(), z.string()),
});

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
        // Tolerante a propósito: si Claude devuelve 3 slides, un `.min(4)` haría fallar
        // TODA la respuesta y el usuario se quedaría sin ideas. La garantía de 4-6 se
        // aplica al entregar, en `completarSlides()`, que nunca falla.
        slides: z.array(SlidePropuesto).min(1).max(8),
        fuente_dato: z.enum(["metricas", "catalogo", "cotizaciones", "calendario"]),
      }),
    )
    // Tolerante por la misma razón que los slides: si Claude devuelve 2 ideas, un
    // `.min(3)` tiraría la respuesta entera y el usuario se quedaría sin ninguna. Es
    // preferible mostrar 2 buenas que ninguna. El prompt sigue pidiendo entre 3 y 6.
    .min(1)
    .max(8),
});

type Evidencia = { fuente: string; dato: string; n: number; senal_debil: boolean };

/** Rendimiento por pilar, siempre con la n a la vista. */
async function rendimientoPorPilar(): Promise<{ texto: string; evidencias: Evidencia[]; medidos: number }> {
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

  // Los posts históricos traen pilares que la estrategia YA RETIRÓ: `inspiracion` y
  // `permiso` son del marco viejo de "permiso emocional", que estrategia.ts prohíbe
  // expresamente desde entonces. Y el aprendizaje vigente que destiló el bot dice, tal
  // cual, "prioriza el pilar inspiración" — o sea que el motor le estaba pidiendo a Claude
  // un pilar que ya no existe en el catálogo.
  // Se separan: los vigentes guían, los retirados se muestran solo como contexto histórico
  // y con la advertencia de que no se pueden usar.
  const vigentes = new Set(PILARES.map((p) => p.id));
  const todas = [...porPilar.entries()]
    .map(([pilar, a]) => ({ pilar, ...a, porPost: a.n ? a.comercial / a.n : 0 }))
    .sort((a, b) => b.porPost - a.porPost);
  const filas = todas.filter((f) => vigentes.has(f.pilar));
  const retirados = todas.filter((f) => !vigentes.has(f.pilar));

  const evidencias: Evidencia[] = filas.map((f) => ({
    fuente: "instagram",
    dato: `pilar "${f.pilar}": ${f.porPost.toFixed(1)} acciones comerciales por post (alcance medio ${Math.round(f.alcance / Math.max(1, f.n))})`,
    n: f.n,
    senal_debil: f.n < UMBRAL_SENAL,
  }));

  const lineas = filas.map(
    (f) =>
      `- ${f.pilar}: ${f.porPost.toFixed(1)} acciones comerciales por post sobre n=${f.n}` +
      (f.n < UMBRAL_SENAL ? " ⚠️ SEÑAL DÉBIL, no afirmes nada con esto" : ""),
  );

  if (retirados.length) {
    lineas.push(
      "",
      "PILARES RETIRADOS — aparecen en los posts viejos pero YA NO EXISTEN en la estrategia.",
      "NO los propongas ni los cites como recomendación, aunque el aprendizaje de abajo los",
      "nombre: ese aprendizaje se destiló cuando todavía estaban vivos.",
      ...retirados.map((f) => `- ${f.pilar} (retirado): ${f.porPost.toFixed(1)} por post sobre n=${f.n}`),
    );
  }

  const texto = lineas.length ? lineas.join("\n") : "- todavía no hay posts con métricas";

  // Cuántos posts tienen métricas de verdad: es el número que decide cuánto pesa Instagram.
  const medidos = filas.reduce((a, f) => a + f.n, 0);

  return { texto, evidencias, medidos };
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
export type ContextoIdeas = { items: Evidencia[]; nota: string; medidos: number; peso: PesoMetricas };

export async function construirEncargoIdeas(): Promise<{ encargo: Encargo; contexto: ContextoIdeas }> {
  const [pilares, aprendizaje, demanda, sinPublicar, calendario] = await Promise.all([
    rendimientoPorPilar(),
    aprendizajeVigente(),
    demandaComercial(),
    rutasSinPublicar(),
    temaDeLaSemana(),
  ]);

  const postsMedidos = pilares.medidos;

  const plantillas = PLANTILLAS_LISTA.map(
    (p) => `- ${p.definicion.id} (${p.definicion.nombre}): ${p.definicion.descripcion}`,
  ).join("\n");

  // Catálogo con los campos EXACTOS de cada plantilla y su largo máximo: es la única
  // forma de que Claude proponga `slides` que el registry vaya a aceptar tal cual.
  const catalogoSlides = PLANTILLAS_LISTA.map((p) => {
    const campos = p.definicion.campos
      .map((c) => `${c.id} (máx ${c.maxLargo ?? "sin límite"} car.)`)
      .join(", ");
    return `- ${p.definicion.id} [rol: ${p.definicion.rol}]: campos → ${campos || "sin campos"}`;
  }).join("\n");

  const user = `Propón entre 3 y 6 ideas concretas de publicación para Instagram, basadas SOLO en los datos de abajo.

CUÁNTO PUEDES FIARTE DE INSTAGRAM AHORA MISMO:
${instruccionSegunPeso(pesoDeLasMetricas(postsMedidos), postsMedidos)}

REGLA INNEGOCIABLE SOBRE LOS DATOS: donde veas
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

FORMATOS: 4x5 (carrusel de feed, el que más rinde), 1x1, 9x16 (historia), reel (portada).

CADA IDEA TIENE QUE TRAER EL CARRUSEL ENTERO REDACTADO EN "slides".
**MÍNIMO 4 SLIDES, MÁXIMO 6. NUNCA MENOS DE 4.** Listo para publicar sin reescribir nada.
Reglas estrictas:
- Usa SOLO estos ids de plantilla y SOLO estos campos (nada inventado):
${catalogoSlides}
- Cada slide es { "plantilla": "<id de la lista de arriba>", "valores": { "<campo>": "<texto>" } }.
  Solo incluyas los campos que esa plantilla declara, y respeta su largo máximo.
- Estructura del carrusel: el primer slide usa una plantilla de rol "portada", el
  último usa "cierre-cta", y **entre 2 y 4 slides intermedios** usan plantillas de rol
  "cuerpo". No repitas la portada ni el cierre en medio.
- **Cada slide intermedio tiene que decir algo distinto y concreto**: un consejo, un dato,
  una objeción, una comparación. Nada de rellenar con frases que repiten la portada — un
  carrusel donde los slides del medio no aportan es peor que no proponerlo.
- Rellena TODOS los campos con texto de verdad, en la voz de la marca. Nada de textos de
  ejemplo ni marcadores tipo "[titular aquí]".
- "fuente_dato" dice de qué dato salió la idea: "metricas" (rendimiento por pilar en
  Instagram), "catalogo" (rutas sin publicar), "cotizaciones" (demanda comercial real),
  o "calendario" (tema editorial del blog). Elige el que de verdad sustenta la idea.`;

  const items = [...pilares.evidencias, ...demanda.evidencias];
  const debiles = items.filter((e) => e.senal_debil).length;
  const nota =
    debiles > 0
      ? `${debiles} de ${items.length} señales tienen muestra pequeña (n < ${UMBRAL_SENAL}). Tómalas como indicio, no como conclusión.`
      : `Todas las señales superan n = ${UMBRAL_SENAL}.`;

  return {
    encargo: { system: SYSTEM_PROMPT, user, schema: aJsonSchema(RespuestaIdeas) },
    contexto: { items, nota, medidos: postsMedidos, peso: pesoDeLasMetricas(postsMedidos) },
  };
}

type SlideLimpio = { plantilla: string; valores: Record<string, string> };

const MIN_SLIDES = 4;
const MAX_SLIDES = 6;

/** Descarta plantillas inventadas y campos que la plantilla no declara. */
function limpiarSlides(slides: SlideLimpio[]): SlideLimpio[] {
  return slides.flatMap((s) => {
    const p = buscarPlantilla(s.plantilla);
    if (!p) return [];
    const idsCampos = new Set(p.definicion.campos.map((c) => c.id));
    const valores: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.valores)) {
      if (idsCampos.has(k) && v?.trim()) valores[k] = v;
    }
    // Un slide sin un solo campo con texto no aporta nada: fuera.
    return Object.keys(valores).length ? [{ plantilla: s.plantilla, valores }] : [];
  });
}

/**
 * Garantiza un carrusel de entre 4 y 6 slides, siempre, y con estructura sensata.
 *
 * Nico lo pidió tal cual: "mínimo 4 slides, máximo 6, nunca menos de 4". Antes esto podía
 * devolver un array vacío cuando la validación tumbaba slides, y entonces aceptar la idea
 * abría una pieza de relleno — justo lo que hacía sentir que la idea "no venía bien
 * entregada".
 *
 * Reglas que se imponen aquí y no se dejan al modelo, porque el modelo falla de vez en
 * cuando y esto tiene que salir bien SIEMPRE:
 *   - el primero es una portada,
 *   - el último es el cierre con CTA,
 *   - por el medio, cuerpo; si faltan, se completan con plantillas de cuerpo.
 */
function completarSlides(slides: SlideLimpio[]): SlideLimpio[] {
  const limpios = limpiarSlides(slides);

  const rolDe = (id: string) => buscarPlantilla(id)?.definicion.rol;
  const portada = limpios.find((s) => rolDe(s.plantilla) === "portada");
  const cierre = limpios.find((s) => rolDe(s.plantilla) === "cierre");
  const cuerpo = limpios.filter((s) => rolDe(s.plantilla) === "cuerpo");

  // Plantillas de cuerpo con las que rellenar si Claude se quedó corto. Se rotan para no
  // repetir siempre la misma.
  const rellenos = ["tip-numerado", "dato-grande", "mito-realidad"].filter((id) => buscarPlantilla(id));

  const salida: SlideLimpio[] = [];
  salida.push(portada ?? { plantilla: "portada-ruta", valores: valoresPorDefecto("portada-ruta") });

  // Cuántos de cuerpo caben: entre 2 y 4, para acabar con 4-6 contando portada y cierre.
  const cuantosCuerpo = Math.min(Math.max(cuerpo.length, MIN_SLIDES - 2), MAX_SLIDES - 2);
  for (let i = 0; i < cuantosCuerpo; i++) {
    const propio = cuerpo[i];
    if (propio) {
      salida.push(propio);
    } else {
      const id = rellenos[i % rellenos.length] ?? "tip-numerado";
      salida.push({ plantilla: id, valores: valoresPorDefecto(id) });
    }
  }

  salida.push(cierre ?? { plantilla: "cierre-cta", valores: valoresPorDefecto("cierre-cta") });
  return salida;
}

/** Valida lo que devolvió el worker y le pega la evidencia con la que se pidió. */
export function interpretarIdeas(crudo: unknown, contexto: ContextoIdeas) {
  const r = RespuestaIdeas.safeParse(crudo);
  if (!r.success) return { error: "Claude respondió con una lista que no encaja. Vuelve a intentarlo." };
  return {
    ok: true as const,
    ideas: r.data.ideas.map((i) => ({
      ...i,
      slides: completarSlides(i.slides),
      evidencia: contexto,
    })) as IdeaGenerada[],
  };
}
