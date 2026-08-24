import "server-only";

import { createCommercialClient } from "@/lib/supabase/server";
import { quoteYear, CATALOG_BASE_YEAR } from "@/lib/pricing/year";

/**
 * Los datos reales que alimentan las plantillas: el catálogo de rutas.
 *
 * Decisión de diseño importante: lo que sale de acá se **copia dentro del slide**
 * (`valores`), no se lee en el momento de dibujar. Dos razones:
 *   1. El render queda puro y offline — `scripts/contenido_smoke.tsx` puede recorrer todo
 *      el catálogo de plantillas sin base de datos ni sesión.
 *   2. Una pieza publicada no debe cambiar sola si mañana sube un precio. Lo que se
 *      publicó es lo que se publicó.
 * Si el precio cambia, el editor tiene un botón para volver a traer los datos.
 */

export type RutaLista = {
  id: string;
  nombre: string;
  km: number | null;
  dias: number | null;
  etapas: number | null;
  dificultad: string | null;
};

export type EtapaRuta = { dia: number; desde: string; hasta: string; km: number };

export async function listarRutas(): Promise<RutaLista[]> {
  const supabase = await createCommercialClient();
  const { data } = await supabase
    .from("routes")
    .select("id,name,km,days,stages,difficulty")
    .eq("active", true)
    .order("name");

  return (data ?? []).map((r) => ({
    id: r.id,
    nombre: r.name,
    km: r.km,
    dias: r.days,
    etapas: r.stages,
    dificultad: r.difficulty,
  }));
}

/** Precio "desde X€" de una ruta: el más barato de las modalidades del año vigente. */
async function precioDesde(
  supabase: Awaited<ReturnType<typeof createCommercialClient>>,
  rutaId: string,
): Promise<number | null> {
  const anio = quoteYear(null) ?? CATALOG_BASE_YEAR;
  const { data } = await supabase
    .from("pricing")
    .select("price_cs,year")
    .eq("route_id", rutaId)
    .eq("season", "regular")
    .not("price_cs", "is", null);

  const filas = (data ?? []).filter((p) => p.price_cs != null);
  if (filas.length === 0) return null;

  // Se prefiere el año vigente. Si esa ruta no lo tiene cargado, se usa el más reciente
  // que exista y ya está: acá no se cotiza, se hace contenido.
  const delAnio = filas.filter((p) => p.year === anio);
  const usar = delAnio.length ? delAnio : filas;
  return Math.min(...usar.map((p) => Number(p.price_cs)));
}

export async function etapasDeRuta(rutaId: string): Promise<EtapaRuta[]> {
  const supabase = await createCommercialClient();
  const { data } = await supabase
    .from("route_stages")
    .select("day,from_place,to_place,km")
    .eq("route_id", rutaId)
    .order("day");

  return (data ?? [])
    .filter((e) => e.km != null)
    .map((e) => ({
      dia: e.day,
      desde: e.from_place ?? "",
      hasta: e.to_place ?? "",
      km: Number(e.km),
    }));
}

export type DatosDeRuta = {
  nombre: string;
  eyebrow: string;
  datos: string;
  precio: string;
  etapas_json: string;
};

/**
 * Todo lo que una plantilla necesita saber de una ruta, ya formateado para escribirse
 * dentro de `slide.valores`.
 */
export async function datosDeRuta(rutaId: string): Promise<DatosDeRuta | null> {
  const supabase = await createCommercialClient();
  const [{ data: ruta }, etapas, desde] = await Promise.all([
    supabase.from("routes").select("name,km,days,stages,difficulty,family").eq("id", rutaId).maybeSingle(),
    etapasDeRuta(rutaId),
    precioDesde(supabase, rutaId),
  ]);
  if (!ruta) return null;

  // La línea de datos se arma solo con lo que existe: una ruta sin km cargados no debe
  // mostrar "null km".
  const partes: string[] = [];
  if (ruta.km) partes.push(`${Math.round(Number(ruta.km))} km`);
  if (ruta.days) partes.push(`${ruta.days} días`);
  if (ruta.stages) partes.push(`${ruta.stages} etapas`);

  return {
    nombre: ruta.name,
    eyebrow: ruta.family ? `Camino ${ruta.family}` : ruta.name,
    datos: partes.join(" · "),
    precio: desde != null ? `desde ${Math.round(desde)} €` : "",
    etapas_json: JSON.stringify(etapas),
  };
}

/**
 * Refresca contra el catálogo los valores de los slides que tienen ruta elegida.
 *
 * REGLA DE FUENTE ÚNICA DE VERDAD: la plataforma manda. Si Nico cambia un precio o los km
 * de una etapa en el catálogo, la pieza lo refleja la próxima vez que se dibuja — no hay
 * que volver a elegir la ruta ni acordarse de nada.
 *
 * Lo que quedó guardado dentro del slide sigue existiendo, pero solo como respaldo: se usa
 * si la ruta se borró del catálogo, para que una pieza vieja no se rompa. Y no hay riesgo
 * de que "cambie sola" una pieza ya publicada, porque lo publicado es el JPEG exportado,
 * no esta plantilla.
 *
 * Esto vive en la capa de servidor (endpoint y página), NO dentro del render: así el
 * render sigue siendo puro y `contenido_smoke` puede recorrer todas las plantillas sin
 * base de datos.
 */
export async function refrescarDesdeCatalogo<T extends { valores: Record<string, string> }>(
  slides: T[],
): Promise<T[]> {
  const ids = [...new Set(slides.map((s) => s.valores.ruta).filter(Boolean))];
  if (ids.length === 0) return slides;

  const frescos = new Map<string, DatosDeRuta>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const d = await datosDeRuta(id);
        if (d) frescos.set(id, d);
      } catch {
        // Si el catálogo no responde, la pieza se dibuja con lo que tenía guardado.
        // Mejor una pieza con datos de ayer que un preview roto.
      }
    }),
  );

  return slides.map((s) => {
    const d = s.valores.ruta ? frescos.get(s.valores.ruta) : undefined;
    if (!d) return s;
    return {
      ...s,
      valores: {
        ...s.valores,
        ruta_nombre: d.nombre,
        datos: d.datos,
        etapas_json: d.etapas_json,
        // El precio se sobrescribe solo si el catálogo lo tiene: si una ruta se quedó sin
        // tarifa cargada para el año vigente, es mejor conservar la última conocida que
        // borrar el pill de la pieza sin avisar.
        ...(d.precio ? { precio: d.precio } : {}),
      },
    };
  });
}
