"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { NAV } from "./nav";

/** Las pantallas de primer nivel: ahí no hay "volver", hay barra de pestañas. */
const RAIZ = new Set(NAV.map((n) => n.href));

/**
 * Instalada como app en el iPhone no hay botón de atrás del navegador: sin esto, desde
 * una ficha (p. ej. /seguimiento/[id]) no había forma de devolverse. Solo en el celular.
 * Si la app se abrió directo en esta pantalla (sin historial), sube un nivel.
 */
export function BotonVolver() {
  const path = usePathname();
  const router = useRouter();
  if (path === "/" || RAIZ.has(path)) return null;

  function volver() {
    if (window.history.length > 1) router.back();
    else router.push(path.split("/").slice(0, -1).join("/") || "/seguimiento");
  }

  return (
    <button
      type="button"
      onClick={volver}
      aria-label="Volver"
      className="md:hidden -ml-2 h-10 w-10 shrink-0 rounded-md flex items-center justify-center active:bg-white/10"
    >
      <ChevronLeft size={24} />
    </button>
  );
}
