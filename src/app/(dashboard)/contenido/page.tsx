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
      .select("id,titulo,formato,estado,slides,updated_at")
      .neq("estado", "archivado")
      .order("updated_at", { ascending: false })
      .limit(60),
    supabase
      .from("contenido_ideas")
      .select("id,titular,pilar,formato,angulo,razon,ruta_nombre,evidencia")
      .eq("estado", "nueva")
      .order("created_at", { ascending: false })
      .limit(12),
    estadoDelWorker(),
  ]);

  const filas: FilaPieza[] = (data ?? []).map((p) => ({
    id: p.id,
    titulo: p.titulo,
    formato: p.formato,
    estado: p.estado,
    n_slides: leerSlides(p.slides).slides.length,
    actualizado: p.updated_at,
  }));

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
