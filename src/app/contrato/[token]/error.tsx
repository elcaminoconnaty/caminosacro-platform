"use client";

// Red de seguridad de la página de firma. Sin este archivo, cualquier fallo caía en el
// error boundary que trae Next por defecto, que le muestra al peregrino un seco
// "This page couldn't load" en inglés — fue exactamente lo que vio la primera clienta
// que intentó firmar (la foto de su pasaporte superaba el límite de 1 MB de Next).

import { useEffect } from "react";
import Aviso from "./Aviso";

export default function ErrorFirma({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[contrato] la página de firma falló:", error);
  }, [error]);

  return (
    <Aviso
      titulo="Algo se atravesó"
      detalle="No pudimos cargar tu contrato en este momento. Inténtalo de nuevo; si vuelve a pasar, escríbenos y lo resolvemos contigo — tu enlace sigue siendo válido."
    >
      <button
        type="button"
        onClick={reset}
        className="inline-block rounded-full bg-bosque px-6 py-2.5 text-sm font-medium text-white transition hover:bg-bosque-medio"
      >
        Intentar de nuevo
      </button>
    </Aviso>
  );
}
