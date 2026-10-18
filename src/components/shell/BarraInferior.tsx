"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV, PESTANAS_CELULAR, enSeccion } from "./nav";

const PESTANAS = PESTANAS_CELULAR.map((href) => NAV.find((n) => n.href === href)!);
const RESTO = NAV.filter((n) => !PESTANAS_CELULAR.includes(n.href));

/**
 * La barra de pestañas de abajo, solo en el celular (como en cualquier app del iPhone):
 * lo que más se usa a un toque del pulgar, y "Más" abre una hoja con el resto de
 * secciones y el botón de salir. Fondo sólido: en Safari de iOS lo translúcido dejaba
 * ver el contenido por detrás (lo que pasó en El Camino con Naty).
 */
export function BarraInferior({ email }: { email: string }) {
  const path = usePathname();
  const [abierto, setAbierto] = useState(false);

  // Al cambiar de pantalla, la hoja se cierra.
  useEffect(() => setAbierto(false), [path]);

  // Mientras la hoja está abierta, la página de atrás no se desplaza.
  useEffect(() => {
    if (!abierto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, [abierto]);

  const enMas = RESTO.some((n) => enSeccion(path, n.href));
  const item = "app-nav-item flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-medium";

  return (
    <>
      <nav
        className="app-nav md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg-card pb-[env(safe-area-inset-bottom)]"
        aria-label="Navegación principal"
      >
        <div className="flex">
          {PESTANAS.map(({ href, label, icon: Icon }) => {
            const on = enSeccion(path, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(item, on ? "text-bosque" : "text-muted")}
              >
                <Icon size={22} strokeWidth={on ? 2.25 : 1.75} />
                <span className="truncate max-w-full px-0.5">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setAbierto(true)}
            aria-label="Más secciones"
            aria-expanded={abierto}
            className={cn(item, enMas ? "text-bosque" : "text-muted")}
          >
            <Menu size={22} strokeWidth={enMas ? 2.25 : 1.75} />
            Más
          </button>
        </div>
      </nav>

      {abierto && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Más secciones">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-tinta/40"
            onClick={() => setAbierto(false)}
          />
          <div className="app-nav absolute bottom-0 inset-x-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-bg-card border-t border-border pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
              <div className="min-w-0">
                <p className="font-display text-xl text-bosque leading-tight">Camino Sacro</p>
                {email && <p className="text-xs text-muted truncate">{email}</p>}
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="h-10 w-10 -mr-2 rounded-md flex items-center justify-center text-muted active:bg-taupe/40"
              >
                <X size={22} />
              </button>
            </div>
            <nav className="grid grid-cols-3 gap-2 p-4" aria-label="Otras secciones">
              {RESTO.map(({ href, label, icon: Icon, soon }) => {
                const on = enSeccion(path, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setAbierto(false)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs text-center min-h-20",
                      on ? "bg-bosque text-white border-bosque" : "border-border text-fg active:bg-taupe/40",
                    )}
                  >
                    <Icon size={22} className={on ? "" : "text-bosque"} />
                    <span className="leading-tight">{label}</span>
                    {soon && !on && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-taupe text-muted">Pronto</span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <form action="/auth/signout" method="post" className="px-4">
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border border-border text-sm text-fg active:bg-taupe/40"
              >
                <LogOut size={18} className="text-muted" />
                Salir
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
