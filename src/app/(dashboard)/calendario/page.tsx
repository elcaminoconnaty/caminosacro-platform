import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
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

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          {mensajeError(error, "No se pudo cargar el calendario.")}
        </div>
      )}

      <CalendarView events={events} />
    </div>
  );
}
