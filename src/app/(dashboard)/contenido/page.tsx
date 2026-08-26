import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { leerSlides } from "@/lib/contenido/tipos";
import PiezasGrid, { type FilaPieza } from "./PiezasGrid";
import NuevaPieza from "./NuevaPieza";
import IdeasPanel, { type FilaIdea } from "./IdeasPanel";
import ResumenMetricas from "./ResumenMetricas";
import { estadoDelWorker } from "@/lib/contenido/cola";

// La bandeja se mira después de guardar en el editor: nunca puede venir cacheada.
export const dynamic = "force-dynamic";

export default async function ContenidoPage() {
  // Un solo viaje para toda la pantalla, como en seguimiento/[id].
  const supabase = await createPublicSchemaClient();
  const [{ data, error }, { data: ideasData }, worker] = await Promise.all([
    supabase
      .from("contenido_piezas")
      .select("id,titulo,formato,estado,slides,updated_at,export_paths,exportado_at")
      .neq("estado", "archivado")
      .order("updated_at", { ascending: false })
      // 27 rutas + bicis + lo que se cree a mano: 60 se quedaba corto y cortaba la lista
      // en silencio. El filtrado y la búsqueda van en el cliente sobre esto.
      .limit(300),
    supabase
      .from("contenido_ideas")
      .select("id,titular,pilar,formato,angulo,razon,ruta_nombre,evidencia,slides,fuente_dato")
      .eq("estado", "nueva")
      .order("created_at", { ascending: false })
      .limit(12),
    estadoDelWorker(),
  ]);

  // El bucket `contenido-piezas` es público, así que la miniatura es una URL directa: no
  // hay que firmar nada ni pasar por el servidor.
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;

  const filas: FilaPieza[] = (data ?? []).map((p) => {
    const rutas = Array.isArray(p.export_paths) ? (p.export_paths as string[]) : [];
    return {
      id: p.id,
      titulo: p.titulo,
      formato: p.formato,
      estado: p.estado,
      n_slides: leerSlides(p.slides).slides.length,
      actualizado: p.updated_at,
      // El archivo exportado se sube SIEMPRE a la misma ruta (upsert), así que su URL no
      // cambia aunque el contenido sí. Sin este sufijo, la miniatura se quedaba mostrando
      // la primera exportación durante un mes entero, que es lo que dura la caché del
      // optimizador de imágenes. Es el mismo bug que hacía descargar la exportación vieja,
      // pero por el otro lado.
      miniatura: rutas[0]
        ? `${base}${rutas[0]}${p.exportado_at ? `?v=${Date.parse(p.exportado_at)}` : ""}`
        : null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-bosque">Estudio de contenido</h1>
          <p className="mt-1.5 text-sm text-muted max-w-2xl leading-relaxed">
            Carruseles, portadas de reel e historias con la identidad de Camino Sacro ya
            puesta. Montas la foto, cambias los textos y la pieza sale lista.
          </p>
        </div>

        <NuevaPieza />
      </div>

      {error && (
        <p className="text-xs text-dorado-oscuro">
          No se pudieron leer las piezas: {mensajeError(error)}
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <div className="flex flex-col gap-5">
          <ResumenMetricas />
          <PiezasGrid filas={filas} />
        </div>
        <IdeasPanel
          ideas={(ideasData ?? []) as FilaIdea[]}
          workerEncendido={worker.encendido}
          workerHace={worker.hace_seg}
        />
      </div>
    </div>
  );
}
