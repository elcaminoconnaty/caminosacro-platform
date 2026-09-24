import Link from "next/link";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import AvisoCarga from "@/components/AvisoCarga";
import { viajesPagados } from "@/lib/quotes/viajesPagados";
import CalendarView, { type TripEvent } from "./CalendarView";
import ViajesPagadosView from "./ViajesPagadosView";

type Vista = "salidas" | "pagados";

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const vista: Vista = (await searchParams).vista === "pagados" ? "pagados" : "salidas";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-bosque">Calendario</h1>
          <p className="text-muted text-sm mt-1">
            {vista === "pagados"
              ? "Viajes con pago: cuándo llegan, cuándo empiezan y terminan de caminar y cuándo termina su reserva."
              : "Próximos viajeros por fecha de salida. Click en un viaje para abrir su cotización."}
          </p>
        </div>
        <nav className="flex rounded-lg border border-border overflow-hidden text-sm">
          {(["salidas", "pagados"] as const).map((v) => (
            <Link
              key={v}
              href={v === "salidas" ? "/calendario" : "/calendario?vista=pagados"}
              className={`px-3 py-1.5 transition ${vista === v ? "bg-bosque text-white" : "hover:bg-taupe/40"}`}
            >
              {v === "salidas" ? "Salidas" : "Viajes pagados"}
            </Link>
          ))}
        </nav>
      </header>

      {vista === "pagados" ? <Pagados /> : <Salidas />}
    </div>
  );
}

async function Pagados() {
  const supabase = await createCommercialClient();
  const { viajes, error } = await viajesPagados(supabase);
  if (error) {
    return (
      <AvisoCarga
        titulo="No se pudieron cargar los viajes pagados."
        detalle={mensajeError(error, "La consulta al servidor no respondió.")}
      />
    );
  }
  return <ViajesPagadosView viajes={viajes} />;
}

async function Salidas() {
  const supabase = await createCommercialClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("id,code,client_name,route_name,start_date,end_date,people,status")
    .not("start_date", "is", null)
    .neq("status", "cancelada")
    .order("start_date", { ascending: true })
    .limit(1000);

  const events = (data ?? []).filter((e) => e.start_date) as TripEvent[];

  // Si la consulta falla no se pinta el calendario: con `events = []`, CalendarView escribe
  // "No hay salidas próximas con los filtros actuales" y acusa a unos filtros que nadie puso,
  // así que el usuario se va a toquetear los filtros en vez de recargar (B7).
  if (error) {
    return (
      <AvisoCarga
        titulo="No se pudo cargar el calendario."
        detalle={
          <>
            {mensajeError(error, "La consulta al servidor no respondió.")} No es cosa de los
            filtros: no se está mostrando ninguna salida porque no se pudieron leer.
          </>
        }
      />
    );
  }
  return <CalendarView events={events} />;
}
