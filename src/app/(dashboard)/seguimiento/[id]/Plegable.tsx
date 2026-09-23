"use client";

import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

// Avisa a las demás tarjetas de la pestaña; el evento "storage" solo llega a las otras.
const EVENTO = "plegable-cambio";

function suscribir(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

/**
 * Pliega una tarjeta del seguimiento dejando solo su cabecera, como la de WhatsApp.
 *
 * No toca la tarjeta por dentro: todas son una <section> cuyo primer hijo es la cabecera
 * (título, resumen y botones), así que el CSS de `.plegable` (globals.css) esconde el resto
 * y le pone el chevrón al título. El clic en la cabecera abre y cierra, salvo que caiga en
 * un botón, enlace o campo: esos siguen haciendo lo suyo ("+ Pago", "Enviar correo"…).
 *
 * Lo abierto o cerrado se recuerda por sección en este navegador: si Nico cierra el
 * itinerario, sigue cerrado en la próxima cotización que abra.
 */
export default function Plegable({
  seccion,
  titulo,
  abiertoInicial = true,
  children,
}: {
  /** Clave con que se recuerda el estado: una por tipo de tarjeta, no por cotización. */
  seccion: string;
  /** Para el botón de teclado; lo que se ve es el título de la propia tarjeta. */
  titulo: string;
  abiertoInicial?: boolean;
  children: ReactNode;
}) {
  const clave = `seguimiento:plegable:${seccion}`;
  const guardado = useSyncExternalStore(suscribir, () => leer(clave), () => null);
  const abierto = guardado === null ? abiertoInicial : guardado === "1";

  function cambiar() {
    try {
      localStorage.setItem(clave, abierto ? "0" : "1");
    } catch {}
    window.dispatchEvent(new Event(EVENTO));
  }

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const cabecera = e.currentTarget.querySelector(":scope > section > :first-child");
    if (!cabecera?.contains(t)) return;
    if (t.closest("button, a, input, select, textarea, label")) return;
    // Seleccionar texto de la cabecera (un monto, un código) no es pedir que se pliegue.
    if (window.getSelection()?.toString()) return;
    cambiar();
  }

  return (
    <div className="plegable" data-abierto={abierto} onClick={onClick}>
      {/* Solo aparece al llegar con el tabulador: con el ratón basta la cabecera. */}
      <button
        type="button"
        onClick={cambiar}
        aria-expanded={abierto}
        className="sr-only focus:not-sr-only focus:mb-1 focus:inline-block focus:text-xs focus:text-bosque focus:underline"
      >
        {abierto ? `Plegar ${titulo}` : `Desplegar ${titulo}`}
      </button>
      {children}
    </div>
  );
}
