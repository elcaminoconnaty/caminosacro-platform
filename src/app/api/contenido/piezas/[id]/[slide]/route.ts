import { createPublicSchemaClient } from "@/lib/supabase/server";
import { renderSlide } from "@/lib/contenido/render";
import { leerSlides } from "@/lib/contenido/tipos";
import { esFormatoId, FORMATO_POR_DEFECTO } from "@/lib/contenido/formatos";

// Satori y resvg corren sobre wasm en Node; nada de esto vive en el edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/contenido/piezas/<id>/<n> — el slide n de una pieza, como PNG.
 *
 * Es el único generador de imágenes del módulo: lo consumen tanto el preview del editor
 * como la exportación. Que sean el mismo endpoint es la razón de que el archivo final no
 * pueda verse distinto al preview.
 *
 * Query:
 *   ?v=<hash>    huella del slide. No se lee: existe para romper la caché cuando el
 *                contenido cambia (ver src/lib/contenido/hashSlide.ts).
 *   ?escala=0.5  render a media resolución, para que el preview pese menos.
 *
 * La ruta NO está en PUBLIC_PATHS de src/proxy.ts, así que exige sesión como el resto
 * del dashboard.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; slide: string }> },
) {
  const { id, slide: slideParam } = await params;
  const url = new URL(request.url);
  const escala = Number(url.searchParams.get("escala")) || 1;

  const supabase = await createPublicSchemaClient();
  const { data: pieza, error } = await supabase
    .from("contenido_piezas")
    .select("formato,slides")
    .eq("id", id)
    .maybeSingle();

  if (error) return new Response(`Error leyendo la pieza: ${error.message}`, { status: 500 });
  if (!pieza) return new Response("Pieza no encontrada", { status: 404 });

  const formato = esFormatoId(pieza.formato) ? pieza.formato : FORMATO_POR_DEFECTO;
  const { slides } = leerSlides(pieza.slides);
  const n = Number.parseInt(slideParam, 10);
  const elSlide = Number.isFinite(n) && n >= 0 && n < slides.length ? slides[n] : null;

  const respuesta = renderSlide(formato, elSlide, { escala });

  // `immutable` + el ?v=<hash> de la URL: navegar entre slides ya vistos no cuesta un
  // solo byte, y basta con que cambie el hash para que el navegador pida el nuevo.
  const headers = new Headers(respuesta.headers);
  headers.set("cache-control", "private, max-age=31536000, immutable");
  return new Response(respuesta.body, { headers, status: respuesta.status });
}
