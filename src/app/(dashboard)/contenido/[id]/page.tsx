import { notFound } from "next/navigation";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { leerSlides } from "@/lib/contenido/tipos";
import { esFormatoId, FORMATO_POR_DEFECTO } from "@/lib/contenido/formatos";
import { PLANTILLAS_LISTA, valoresPorDefecto } from "@/lib/contenido/plantillas/registry";
import Editor from "./Editor";

// El editor guarda contra la base todo el tiempo: nunca puede pintar una versión cacheada.
export const dynamic = "force-dynamic";

export default async function PiezaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createPublicSchemaClient();
  const { data: pieza } = await supabase
    .from("contenido_piezas")
    .select("id,titulo,formato,slides")
    .eq("id", id)
    .maybeSingle();

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
    <Editor
      piezaId={pieza.id}
      titulo={pieza.titulo}
      formatoInicial={formato}
      slidesIniciales={slides}
      definiciones={definiciones}
      valoresPorDefectoPorPlantilla={porDefecto}
    />
  );
}
