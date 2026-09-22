import "server-only";

import type { ComercialClient } from "@/lib/quotes/pdf";
import type { ModoLogo } from "./marca";
import { MEMORIA_VACIA, type MemoriaLogos } from "./logoProveedor";

/**
 * Lo que la plataforma ya aprendió sobre los logos de los proveedores de equipaje.
 *
 * Vive en `comercial.settings` y no en una tabla propia porque son dos listas de huellas y
 * nada más: la misma casa donde viven los suplementos de temporada y los firmantes.
 *
 *   {
 *     "logos":    ["sha256…"],   ← confirmados como logo: se quitan sin preguntar
 *     "respetar": ["sha256…"]    ← Nico dijo que no son un logo: no se tocan nunca
 *   }
 *
 * La huella es el SHA-256 de los bytes del objeto imagen dentro del PDF, tal como vienen,
 * sin descomprimir. Sirve porque el generador de la etiqueta (FPDF, del lado de Correos)
 * incrusta SIEMPRE el mismo archivo de logo: dos etiquetas del mismo proveedor dan la misma
 * huella aunque los datos del viaje sean distintos. Y si el proveedor cambia su logo, la
 * huella cambia y la plataforma vuelve a pedir que se revise en vez de dar por hecho.
 *
 * Arranca con las dos variantes que ya conocemos, así que la primera etiqueta que se suba
 * sale reconocida sin que nadie confirme nada.
 */
const CLAVE = "etiquetas_logos_proveedor";

/**
 * Qué se pone en el hueco del logo que se quita: `{ "modo": "marca" | "sin-logo" }`.
 *
 * Vive aparte de las huellas porque no es algo que la plataforma aprenda, sino algo que
 * Nico decide. Arranca en `"marca"`, que es como se venía haciendo, y cambia desde la
 * tarjeta del expediente: el modo con el que se deja una etiqueta queda también como el
 * de las siguientes, para no tener que repetir la decisión etiqueta por etiqueta.
 */
const CLAVE_MODO = "etiquetas_modo_logo";

const MODO_POR_DEFECTO: ModoLogo = "marca";

/** Con qué relleno se procesa la próxima etiqueta que se suba. */
export async function leerModoLogo(supabase: ComercialClient): Promise<ModoLogo> {
  const { data } = await supabase.from("settings").select("value").eq("key", CLAVE_MODO).maybeSingle();
  const guardado = (data?.value as { modo?: unknown } | null)?.modo;
  return guardado === "sin-logo" || guardado === "marca" ? guardado : MODO_POR_DEFECTO;
}

/** Deja esa decisión como la de las próximas etiquetas. */
export async function recordarModoLogo(supabase: ComercialClient, modo: ModoLogo): Promise<void> {
  await supabase
    .from("settings")
    .upsert({ key: CLAVE_MODO, value: { modo }, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/**
 * Logo de Pilgrim tal como lo incrustan las dos plantillas de Correos que hemos visto.
 *
 *   - `df24dc…` — plantilla con recuadro blanco alrededor del logo (expediente A47397,
 *     Amalia Matallana, CS-2026-034). PNG de 1366×1320.
 *   - `4f753d…` — plantilla sin recuadro, el logo directo sobre el amarillo (expediente
 *     A43236, Isabel Londoño, CS-2026-004). PNG de 268×268.
 *
 * Las dos son el mismo dibujo (la vieira verde y la palabra "pilgrim"), guardado a dos
 * resoluciones distintas, y por eso son dos huellas y no una.
 */
const CONOCIDOS = [
  "df24dc428bca77e1d0cba118ddb7d5b3bbdbb9329c93ab1bbfde1599f9bd62c4",
  "4f753da537578c7ac5c53e0189ceec329c287553c0c68b34c4a3e0f2c55d4d2d",
];

export async function leerMemoriaLogos(supabase: ComercialClient): Promise<MemoriaLogos> {
  const { data } = await supabase.from("settings").select("value").eq("key", CLAVE).maybeSingle();
  const guardado = (data?.value ?? {}) as Partial<MemoriaLogos>;
  return {
    logos: unir(CONOCIDOS, guardado.logos),
    respetar: unir([], guardado.respetar),
  };
}

/** Guarda huellas confirmadas como logo (o como "esto no se toca"). */
export async function recordarLogos(
  supabase: ComercialClient,
  cambio: { logos?: string[]; respetar?: string[] },
): Promise<void> {
  const actual = await leerMemoriaLogos(supabase);
  // Una huella no puede estar en las dos listas: la última decisión manda.
  const respetar = unir(actual.respetar, cambio.respetar).filter((h) => !cambio.logos?.includes(h));
  const logos = unir(actual.logos, cambio.logos).filter((h) => !cambio.respetar?.includes(h));
  await supabase
    .from("settings")
    .upsert({ key: CLAVE, value: { logos, respetar }, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

function unir(base: string[], extra: unknown): string[] {
  const lista = Array.isArray(extra) ? extra.filter((h): h is string => typeof h === "string") : [];
  return [...new Set([...base, ...lista])];
}

export { MEMORIA_VACIA };
