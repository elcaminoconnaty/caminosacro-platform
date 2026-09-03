import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Se muestra cuando una pantalla del panel llama a `notFound()`: hoy lo hacen el expediente
// (`seguimiento/[id]/page.tsx`) y la ficha de Clara (`clara/[userId]/page.tsx`).
//
// Existe por un hallazgo de la auditoría (B7): sin este archivo salía el 404 por defecto de
// Next —"404 · This page could not be found", negro sobre blanco, en inglés, fuera del
// layout y sin un solo enlace—. Y como en el celular la barra lateral no existe, quien
// llegaba ahí (una cotización borrada, un código mal tecleado, un enlace viejo de WhatsApp)
// se quedaba sin más salida que el botón atrás del navegador.
export default function NoEncontradoPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="max-w-md flex flex-col items-center gap-2">
        <h1 className="font-display text-2xl text-bosque">Esto ya no está</h1>
        <p className="text-sm text-muted leading-relaxed">
          Puede que se haya borrado, que el código esté mal tecleado, o que el enlace venga
          de una pestaña vieja. Desde Seguimiento lo encuentras si todavía existe.
        </p>
      </div>
      <Link
        href="/seguimiento"
        className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-bosque text-white text-sm hover:bg-bosque-medio transition"
      >
        <ArrowLeft size={14} /> Volver a Seguimiento
      </Link>
    </div>
  );
}
