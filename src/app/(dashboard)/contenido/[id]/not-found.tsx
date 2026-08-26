import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Se muestra cuando `PiezaPage` llama a `notFound()` porque el id no existe (se borró,
// se escribió mal en la URL, o quedó de una pestaña vieja). Sin este archivo, Next cae en
// su 404 genérico: sale del layout del dashboard, sin sidebar ni topbar, y el usuario no
// sabe si perdió la sesión, si el módulo se rompió o si de verdad la pieza no está.
export default function PiezaNoEncontrada() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="max-w-md flex flex-col items-center gap-2">
        <h1 className="font-display text-2xl text-bosque">Esta pieza ya no existe</h1>
        <p className="text-sm text-muted leading-relaxed">
          Puede que se haya borrado, o que el enlace sea de una pestaña vieja. Revisa la
          bandeja: si la seguías necesitando, es más rápido crearla de nuevo que buscarla.
        </p>
      </div>
      <Link
        href="/contenido"
        className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-bosque text-white text-sm hover:bg-bosque-medio transition"
      >
        <ArrowLeft size={14} /> Volver a la bandeja
      </Link>
    </div>
  );
}
