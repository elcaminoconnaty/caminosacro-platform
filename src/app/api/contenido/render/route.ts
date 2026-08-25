import { renderSlide } from "@/lib/contenido/render";
import { SlideSchema } from "@/lib/contenido/tipos";
import { esFormatoId, FORMATO_POR_DEFECTO } from "@/lib/contenido/formatos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/contenido/render — dibuja el slide que viene en el cuerpo. Sin base de datos.
 *
 * POR QUÉ EXISTE, que es lo importante: el preview del editor iba por
 * `/api/contenido/piezas/<id>/<n>`, que lee de la base. Eso obligaba a **guardar antes de
 * poder ver**: escribir → esperar 600 ms → guardar (ida y vuelta a Supabase) → renderizar →
 * transferir. Entre uno y dos segundos por cada tecla, y de ahí venía el "se vuelve muy
 * complejo diseñar un post".
 *
 * Con este endpoint el preview dibuja lo que hay en pantalla AHORA, y el guardado ocurre
 * aparte, en segundo plano, sin que nadie lo espere.
 *
 * El endpoint por id sigue existiendo y sigue mandando para exportar y para las miniaturas
 * de la bandeja: ahí sí queremos lo que está guardado de verdad.
 *
 * No está en PUBLIC_PATHS de src/proxy.ts, así que exige sesión como todo el dashboard.
 */
export async function POST(request: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return new Response("Cuerpo inválido", { status: 400 });
  }

  const { slide, formato, escala } = (cuerpo ?? {}) as {
    slide?: unknown;
    formato?: string;
    escala?: number;
  };

  const parseo = SlideSchema.safeParse(slide);
  if (!parseo.success) return new Response("Slide inválido", { status: 400 });

  const crudo = formato ?? "";
  const f = esFormatoId(crudo) ? crudo : FORMATO_POR_DEFECTO;
  const respuesta = await renderSlide(f, parseo.data, { escala: escala ?? 1 });

  // Sin caché: cada petición trae un contenido distinto, y el editor solo pide cuando algo
  // cambió de verdad.
  const headers = new Headers(respuesta.headers);
  headers.set("cache-control", "no-store");
  return new Response(respuesta.body, { headers, status: respuesta.status });
}
