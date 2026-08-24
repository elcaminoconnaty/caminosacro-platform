import { notFound } from "next/navigation";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { leerSlides } from "@/lib/contenido/tipos";
import { esFormatoId, FORMATO_POR_DEFECTO } from "@/lib/contenido/formatos";
import { PLANTILLAS_LISTA, valoresPorDefecto } from "@/lib/contenido/plantillas/registry";
import { listarBanco, listarSubidas } from "@/lib/contenido/fotos";
import { listarRutas } from "@/lib/contenido/datos";
import { estadoDelWorker } from "@/lib/contenido/cola";
import Editor from "./Editor";
import BarraCopy from "./BarraCopy";

// El editor guarda contra la base todo el tiempo: nunca puede pintar una versión cacheada.
export const dynamic = "force-dynamic";

export default async function PiezaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Un solo viaje para todo lo que necesita la pantalla, como en seguimiento/[id].
  const supabase = await createPublicSchemaClient();
  const [{ data: pieza }, banco, subidas, rutas, worker] = await Promise.all([
    supabase.from("contenido_piezas").select("id,titulo,formato,slides,caption,hashtags").eq("id", id).maybeSingle(),
    listarBanco(),
    listarSubidas(),
    listarRutas(),
    estadoDelWorker(),
  ]);

  if (!pieza) notFound();

  const formato = esFormatoId(pieza.formato) ? pieza.formato : FORMATO_POR_DEFECTO;
  const { slides } = leerSlides(pieza.slides);

  // El registry vive en el servidor y contiene componentes, que no se pueden serializar
  // hacia el cliente. Se manda solo la parte declarativa: con eso el editor arma el
  // formulario y el selector de plantillas.
  const definiciones = PLANTILLAS_LISTA.map((p) => p.definicion);
  const porDefecto = Object.fromEntries(
    definiciones.map((d) => [d.id, valoresPorDefecto(d.id)]),
  );

  return (
    <div className="flex flex-col gap-5">
      <Editor
      piezaId={pieza.id}
      titulo={pieza.titulo}
      formatoInicial={formato}
      slidesIniciales={slides}
      definiciones={definiciones}
      valoresPorDefectoPorPlantilla={porDefecto}
      banco={banco}
      subidas={subidas}
      rutas={rutas}
      />
      <div className="max-w-3xl">
        <BarraCopy
          piezaId={pieza.id}
          captionInicial={pieza.caption ?? ""}
          hashtagsIniciales={pieza.hashtags ?? ""}
          workerEncendido={worker.encendido}
        />
      </div>
    </div>
  );
}
