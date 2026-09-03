import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import AvisoCarga from "@/components/AvisoCarga";
import CalendarView, { type TripEvent } from "./CalendarView";

export default async function CalendarioPage() {
  const supabase = await createCommercialClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("id,code,client_name,route_name,start_date,end_date,people,status")
    .not("start_date", "is", null)
    .neq("status", "cancelada")
    .order("start_date", { ascending: true })
    .limit(1000);

  const events = (data ?? []).filter((e) => e.start_date) as TripEvent[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-bosque">Calendario</h1>
        <p className="text-muted text-sm mt-1">Próximos viajeros por fecha de salida. Click en un viaje para abrir su cotización.</p>
      </header>

      {/* Si la consulta falla no se pinta el calendario: con `events = []`, CalendarView escribe
          "No hay salidas próximas con los filtros actuales" y acusa a unos filtros que nadie puso,
          así que el usuario se va a toquetear los filtros en vez de recargar (B7). */}
      {error ? (
        <AvisoCarga
          titulo="No se pudo cargar el calendario."
          detalle={
            <>
              {mensajeError(error, "La consulta al servidor no respondió.")} No es cosa de los
              filtros: no se está mostrando ninguna salida porque no se pudieron leer.
            </>
          }
        />
      ) : (
        <CalendarView events={events} />
      )}
    </div>
  );
}
