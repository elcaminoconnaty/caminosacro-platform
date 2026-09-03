import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Aviso de "no se pudo cargar" para las pantallas del panel.
 *
 * Existe por un hallazgo de B7: el aviso ámbar que se usaba antes (`bg-amber-50` sobre el
 * crema del panel) contrasta 1,05 contra el fondo de página, así que la caja era invisible y
 * lo único que la delataba era el color de la letra. Al lado se pintaban KPI en 0,00 € y
 * "Sin cotizaciones aún", o sea que lo falso se veía más que lo verdadero.
 *
 * Reglas de este aviso, y por qué:
 * - barra roja a la izquierda (`border-l-4 border-l-red-600`): 5,4 de contraste contra el
 *   crema, se ve de reojo;
 * - `role="alert"`: en el CRM no había ni uno, así que un error que aparece después de pulsar
 *   no existía para quien no estuviera mirando ese trozo de pantalla;
 * - título en negrita + detalle: el mensaje técnico va debajo, no en lugar del titular.
 */
export default function AvisoCarga({
  titulo,
  detalle,
}: {
  titulo: string;
  detalle?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 border-l-4 border-l-red-600 bg-red-50 px-4 py-3"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-700" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-red-900">{titulo}</p>
          {detalle ? <p className="text-sm text-red-800 mt-0.5">{detalle}</p> : null}
        </div>
      </div>
    </div>
  );
}
