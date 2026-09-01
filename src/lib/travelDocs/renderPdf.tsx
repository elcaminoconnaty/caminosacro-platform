import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { TravelDocPDF, type TravelDocProps } from "@/lib/travelDocPdf";
import { AsistenciaPDF, type AsistenciaTexts } from "@/lib/asistenciaPdf";

/**
 * El único sitio que llama a renderToBuffer para la documentación de viaje.
 *
 * Existe para que `@react-pdf/renderer` y los componentes de PDF se resuelvan por el
 * MISMO camino. Antes el orquestador hacía `await import("@react-pdf/renderer")` por un
 * lado y `await import("@/lib/travelDocPdf")` por otro; el segundo registra las fuentes al
 * cargarse, y si las dos importaciones caen en instancias distintas del paquete (pasa en
 * cuanto algo resuelve la build ESM y algo la CJS), el render revienta con
 * "Font family not registered: Inter" — con las fuentes registradas, pero en el otro
 * almacén. Con un solo módulo que importa las dos cosas de forma estática, eso no puede
 * pasar.
 *
 * Se sigue cargando de forma diferida desde render.ts: @react-pdf pesa y no tiene por qué
 * entrar al bundle de todo lo que toque la documentación.
 */

export async function renderTravelDocBuffer(props: TravelDocProps): Promise<Buffer> {
  return renderToBuffer(<TravelDocPDF {...props} />);
}

export async function renderAsistenciaBuffer(texts: AsistenciaTexts): Promise<Buffer> {
  return renderToBuffer(<AsistenciaPDF texts={texts} />);
}
