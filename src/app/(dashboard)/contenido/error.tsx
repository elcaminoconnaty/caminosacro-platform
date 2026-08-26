"use client";

// Red de seguridad del estudio de contenido. Sin este archivo, cualquier fallo no
// atrapado en un Server Component o Server Action de `/contenido` o `/contenido/[id]`
// caía en el error boundary por defecto de Next: un "This page couldn't load" en inglés,
// sin sidebar ni topbar, que es exactamente el fallo que ya tumbó la pantalla una vez acá
// (ver la cabecera de `src/lib/contenido/arranques.ts`) y el que tumbó la firma de
// contratos (`src/app/contrato/[token]/error.tsx`). Este archivo cubre TODO el árbol de
// `/contenido`, incluida `/contenido/[id]`, porque no hay ningún `error.tsx` más
// específico debajo.

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";

export default function ErrorContenido({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[contenido] la pantalla falló:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="max-w-md flex flex-col items-center gap-2">
        <h1 className="font-display text-2xl text-bosque">Algo se atravesó</h1>
        <p className="text-sm text-muted leading-relaxed">
          El estudio de contenido no pudo cargar esta pantalla. No es nada que hayas hecho
          mal: prueba de nuevo, y si vuelve a pasar, tus piezas siguen intactas en la base —
          este fallo es de la pantalla, no del contenido.
        </p>
        {error.digest && (
          <p className="text-[11px] text-muted">Código para buscar en los logs: {error.digest}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-bosque text-white text-sm hover:bg-bosque-medio transition"
        >
          <RotateCcw size={14} /> Intentar de nuevo
        </button>
        <Link
          href="/contenido"
          className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-border text-sm text-fg hover:bg-taupe/40 transition"
        >
          <ArrowLeft size={14} /> Volver a la bandeja
        </Link>
      </div>
    </div>
  );
}
