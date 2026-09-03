"use client";

// Red de seguridad de TODO el panel.
//
// Existe por un hallazgo de la auditoría (B7): sin `error.tsx` en `(dashboard)` ni
// `global-error.tsx`, cualquier excepción *lanzada* dentro de un componente de servidor del
// panel caía en la pantalla por defecto de Next —en inglés, fuera del layout y sin salida—.
// El aviso rojo de `AvisoCarga` solo cubre los errores *devueltos* por Supabase; los
// lanzados no tenían dónde caer. Mismo patrón que `contenido/error.tsx` y
// `contrato/[token]/error.tsx`, que ya existían: el hueco era solo el CRM.

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";

export default function ErrorPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[panel] la pantalla falló:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="max-w-md flex flex-col items-center gap-2">
        <h1 className="font-display text-2xl text-bosque">Algo se atravesó</h1>
        <p className="text-sm text-muted leading-relaxed">
          No se pudo cargar esta pantalla. No es nada que hayas hecho mal, y no se perdió
          nada: los datos siguen intactos en la base — el fallo es de la pantalla. Prueba de
          nuevo, y si vuelve a pasar, apunta el código de abajo.
        </p>
        {error.digest && (
          <p className="text-[11px] text-muted">Código para buscar en los logs: {error.digest}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-bosque text-white text-sm hover:bg-bosque-medio transition"
        >
          <RotateCcw size={14} /> Intentar de nuevo
        </button>
        <Link
          href="/seguimiento"
          className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-border text-sm text-fg hover:bg-taupe/40 transition"
        >
          <ArrowLeft size={14} /> Ir a Seguimiento
        </Link>
      </div>
    </div>
  );
}
