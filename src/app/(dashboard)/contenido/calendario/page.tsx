import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { leerProgramacion, listarOcupados } from "@/lib/contenido/programacion";
import { fechaLocal } from "@/lib/contenido/fechas";
import CalendarioContenido from "./CalendarioContenido";

// Se mira justo después de programar: nunca puede venir cacheado.
export const dynamic = "force-dynamic";

export default async function CalendarioContenidoPage() {
  const [ocupados, pref] = await Promise.all([listarOcupados(), leerProgramacion()]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Link href="/contenido" className="inline-flex items-center gap-1 text-xs text-muted hover:text-bosque transition">
            <ArrowLeft size={12} /> Estudio de contenido
          </Link>
          <h1 className="font-display text-3xl text-bosque mt-1">Calendario de publicaciones</h1>
          <p className="mt-1.5 text-sm text-muted max-w-2xl leading-relaxed">
            Lo que ya salió y lo que está en cola. Cada pieza sale sola a su hora (Colombia); para
            programar una, ábrela y pulsa «Aprobar y programar».
          </p>
        </div>
      </div>
      {/* El «hoy» se calcula acá en zona Bogotá y baja como prop, para que servidor y
          navegador pinten el mismo día (ver src/lib/quotes/franjaHoy.ts). */}
      <CalendarioContenido ocupados={ocupados} preferencia={pref} hoy={fechaLocal()} />
    </div>
  );
}
