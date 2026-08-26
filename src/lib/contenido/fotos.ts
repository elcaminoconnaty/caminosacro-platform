import "server-only";

import { createPublicSchemaClient } from "@/lib/supabase/server";

/**
 * De dónde saca fotos el Estudio de Contenido.
 *
 * ⚠️ REGLA QUE NO SE NEGOCIA: este módulo **lee** de `public.fotos` (el banco del bot) y
 * **nunca escribe** ahí. La Edge Function `publicar` elige de esa tabla por `status`, sin
 * mirar en qué bucket vive el archivo: insertar una fila bastaría para que el bot
 * publicara esa foto sola a las 7pm en la cuenta real. Las fotos que sube el usuario van
 * a `public.contenido_fotos` y al bucket `contenido-fotos`.
 */

export type FotoDelBanco = {
  id: number;
  url: string;
  /** Nombre del archivo, derivado de `storage_path`: el banco no guarda uno aparte. */
  nombre: string | null;
  ruta_tag: string | null;
  usada: boolean;
};

export type FotoSubida = {
  id: number;
  url: string;
  nombre: string | null;
};

/** Una foto lista para pintar en la rejilla, venga del banco o de las subidas. */
export type FotoBuscada = {
  id: number;
  url: string;
  nombre: string | null;
  ruta_tag: string | null;
  usada: boolean;
  fuente: "banco" | "subida";
};

export type FiltroEstado = "todas" | "disponibles" | "usadas";

export type ConsultaFotos = {
  fuente: "banco" | "subida";
  texto?: string;
  ruta?: string | null;
  estado?: FiltroEstado;
  /** Índice de la primera foto a traer: el buscador pide tandas seguidas. */
  desde?: number;
  tamano?: number;
};

export type PaginaFotos = {
  fotos: FotoBuscada[];
  /** Cuántas cumplen el filtro en total, no cuántas vinieron en esta tanda. */
  total: number;
  hayMas: boolean;
};

/**
 * Tamaño de tanda. 48 miniaturas llenan de sobra una pantalla grande y el navegador no
 * tiene que resolver 177 imágenes de golpe al abrir el buscador.
 */
export const TANDA_FOTOS = 48;

/** El banco no guarda el nombre: vive dentro de `storage_path`. */
function nombreDeRuta(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const trozo = storagePath.split("/").pop();
  return trozo && trozo.length > 0 ? trozo : null;
}

/**
 * Limpia el término antes de meterlo en un `or=(...)` de PostgREST: la coma y los
 * paréntesis son separadores de esa sintaxis y romperían la consulta entera.
 */
function limpiarTermino(bruto: string): string {
  return bruto.replace(/[,()*%\\"]/g, " ").trim();
}

/** Cada palabra tiene que aparecer en algún lado; máximo 4 para no armar una URL absurda. */
function palabras(texto: string | undefined): string[] {
  if (!texto) return [];
  return limpiarTermino(texto).split(/\s+/).filter(Boolean).slice(0, 4);
}

/**
 * El banco de fotos del bot. Se traen también las usadas: que el bot ya haya publicado
 * una foto suelta no impide usarla dentro de un carrusel, y son 177 fotos buenas.
 *
 * Solo devuelve la primera tanda. La pantalla del editor la usa como semilla para que el
 * buscador tenga algo que pintar en el instante en que se abre; el resto llega paginado
 * por `buscarFotos()`.
 */
export async function listarBanco(limite = TANDA_FOTOS): Promise<FotoDelBanco[]> {
  const { fotos } = await buscarFotos({ fuente: "banco", tamano: limite });
  return fotos.map((f) => ({
    id: f.id,
    url: f.url,
    nombre: f.nombre,
    ruta_tag: f.ruta_tag,
    usada: f.usada,
  }));
}

/** Las fotos subidas desde el editor. */
export async function listarSubidas(limite = TANDA_FOTOS): Promise<FotoSubida[]> {
  const { fotos } = await buscarFotos({ fuente: "subida", tamano: limite });
  return fotos.map((f) => ({ id: f.id, url: f.url, nombre: f.nombre }));
}

/**
 * Busca fotos por tandas, con texto y filtros. El filtrado ocurre en la base y no en el
 * navegador a propósito: así el buscador sirve igual cuando el banco pase de 177 a 2.000.
 */
export async function buscarFotos(consulta: ConsultaFotos): Promise<PaginaFotos> {
  const supabase = await createPublicSchemaClient();
  const desde = Math.max(0, consulta.desde ?? 0);
  const tamano = Math.min(120, Math.max(1, consulta.tamano ?? TANDA_FOTOS));
  const hasta = desde + tamano - 1;
  const terminos = palabras(consulta.texto);

  if (consulta.fuente === "banco") {
    let q = supabase
      .from("fotos")
      .select("id,public_url,storage_path,ruta_tag,status", { count: "exact" })
      // 'disponible' < 'usada' alfabéticamente: lo que el bot no ha publicado va primero.
      .order("status", { ascending: true })
      .order("id", { ascending: false })
      .range(desde, hasta);

    if (consulta.estado === "disponibles") q = q.eq("status", "disponible");
    if (consulta.estado === "usadas") q = q.eq("status", "usada");
    if (consulta.ruta) q = q.eq("ruta_tag", consulta.ruta);
    // Un `or` por palabra: PostgREST los combina con AND, así "sarria bici" exige las dos.
    for (const t of terminos) {
      q = q.or(`storage_path.ilike.%${t}%,ruta_tag.ilike.%${t}%`);
    }

    const { data, count, error } = await q;
    // ⚠️ Antes esto devolvía { fotos: [], total: 0 } en silencio: el buscador se veía
    // igual que "no hay fotos" que "la consulta falló" (RLS, red, lo que sea). Es
    // exactamente el fallo que ya mordió una vez al pipeline de Instagram (tablas con RLS
    // sin política, PostgREST devolviendo [] sin error, y nadie enterándose). Los tres
    // llamadores de esta función (listarBanco/listarSubidas en el Server Component de la
    // página, y buscarFotosAccion en fotoActions.ts) YA tienen su propio try/catch listo
    // para convertir una excepción en un {error} legible — solo hacía falta lanzarla.
    if (error) throw new Error(`No se pudo buscar en el banco de fotos: ${error.message}`);
    const fotos: FotoBuscada[] = (data ?? []).map((f) => ({
      id: f.id,
      url: f.public_url,
      nombre: nombreDeRuta(f.storage_path),
      ruta_tag: f.ruta_tag,
      usada: f.status === "usada",
      fuente: "banco",
    }));
    const total = count ?? fotos.length;
    return { fotos, total, hayMas: desde + fotos.length < total };
  }

  let q = supabase
    .from("contenido_fotos")
    .select("id,public_url,nombre,storage_path,ruta_tag", { count: "exact" })
    .order("id", { ascending: false })
    .range(desde, hasta);

  if (consulta.ruta) q = q.eq("ruta_tag", consulta.ruta);
  for (const t of terminos) {
    q = q.or(`nombre.ilike.%${t}%,storage_path.ilike.%${t}%,ruta_tag.ilike.%${t}%`);
  }

  const { data, count, error } = await q;
  // Mismo motivo que arriba: fallar en silencio con "0 resultados" es peor que fallar.
  if (error) throw new Error(`No se pudieron buscar tus fotos: ${error.message}`);
  const fotos: FotoBuscada[] = (data ?? []).map((f) => ({
    id: f.id,
    url: f.public_url,
    nombre: f.nombre ?? nombreDeRuta(f.storage_path),
    ruta_tag: f.ruta_tag,
    // Las subidas del estudio no las publica el bot: nunca están "usadas".
    usada: false,
    fuente: "subida",
  }));
  const total = count ?? fotos.length;
  return { fotos, total, hayMas: desde + fotos.length < total };
}

export type RutaDeFotos = { tag: string; n: number };

/**
 * Los `ruta_tag` que existen **de verdad** en cada fuente, con cuántas fotos tiene cada
 * uno. No hay lista fija en ningún lado: si el banco no tiene tags, el buscador no pinta
 * chips en vez de inventarse rutas que nadie etiquetó.
 *
 * PostgREST no hace `distinct`, así que se trae la columna y se agrupa acá. Es una sola
 * columna de texto de unos cientos de filas: sale más barato que una vista nueva.
 */
export async function listarRutasDeFotos(fuente: "banco" | "subida"): Promise<RutaDeFotos[]> {
  const supabase = await createPublicSchemaClient();
  const tabla = fuente === "banco" ? "fotos" : "contenido_fotos";
  const { data, error } = await supabase.from(tabla).select("ruta_tag").not("ruta_tag", "is", null).limit(2000);
  // Sin esto, una consulta que falla se ve igual que "nadie etiquetó nada todavía": cero
  // chips, sin ninguna pista de que hay un problema. El único llamador (rutasDeFotos en
  // fotoActions.ts) ya tiene try/catch para esto.
  if (error) throw new Error(`No se pudieron leer las rutas de fotos: ${error.message}`);

  const cuenta = new Map<string, number>();
  for (const fila of data ?? []) {
    const tag = (fila as { ruta_tag: string | null }).ruta_tag?.trim();
    if (!tag) continue;
    cuenta.set(tag, (cuenta.get(tag) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([tag, n]) => ({ tag, n }))
    .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, "es"));
}
