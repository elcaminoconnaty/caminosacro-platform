import Link from "next/link";
import {
  eachMonthOfInterval, endOfMonth, format, getDay, getDaysInMonth, parseISO, startOfMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { sumarDiasIso, type EtapaItinerario } from "@/lib/quotes/itinerario";
import {
  HITOS, HITO_LABELS, TIPO_DIA_BG, TIPO_DIA_TEXTO, detalleDelDia, fechaDeHito, tipoDelDia,
  type FechasViaje, type TipoDia,
} from "@/lib/quotes/fechasViaje";
import { LeyendaViaje, RAYADO_PARCIAL } from "@/components/viaje/RayaViaje";

const LETRAS = ["L", "M", "X", "J", "V", "S", "D"];
const fechaCorta = (iso: string) => format(parseISO(iso), "EEE d LLL yyyy", { locale: es });

/**
 * El viaje dibujado sobre el calendario: una raya por todos sus días, con el mismo código
 * de colores que el calendario general. Sale siempre que haya salida e itinerario, esté
 * pagada o no, para ver cómo queda el viaje mientras se arma la cotización. Se redibuja
 * sola porque cada tarjeta que cambia fechas, etapas u opcionales revalida la página.
 */
export default function TripCalendarCard({
  fechas,
  etapas,
  estado,
}: {
  fechas: FechasViaje | null;
  etapas: EtapaItinerario[];
  estado: "borrador" | "parcial" | "pagado";
}) {
  const hoy = format(new Date(), "yyyy-MM-dd");
  const tipos: TipoDia[] = fechas
    ? (["llegada", "camino", "libre", "tour", "salida"] as TipoDia[]).filter((t) =>
        Array.from({ length: fechas.etapas + 2 + fechas.nochesExtra }, (_, i) => tipoDelDia(fechas, sumarDiasIso(fechas.llegada, i))).includes(t),
      )
    : [];

  return (
    <section className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-bosque">Calendario del viaje</h2>
          <p className="text-xs text-muted mt-0.5">
            {fechas
              ? `${fechas.etapas + 2 + fechas.nochesExtra} días · ${fechas.etapas + 1 + fechas.nochesExtra} noches · ${fechas.etapas} etapas${fechas.nochesExtra ? ` · ${fechas.nochesExtra} ${fechas.nochesExtra === 1 ? "noche extra" : "noches extra"} en Santiago` : ""}`
              : "Se dibuja con la fecha de salida y el itinerario."}
          </p>
        </div>
        {estado === "borrador" ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-taupe text-fg shrink-0">Borrador: así quedaría</span>
        ) : estado === "parcial" ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">Pago parcial</span>
        ) : (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-bosque text-white shrink-0">Pagado</span>
        )}
      </div>

      {!fechas ? (
        <div className="py-8 text-center text-sm text-muted border border-dashed border-border rounded-lg">
          Pon la fecha de salida en los datos de la cotización y carga el itinerario: aquí aparece el viaje dibujado.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {HITOS.map((h) => (
              <div key={h} className="border border-border rounded-lg px-3 py-2">
                <div className="text-[11px] text-muted">{HITO_LABELS[h]}</div>
                <div className="text-sm font-medium capitalize tabular-nums">{fechaCorta(fechaDeHito(fechas, h))}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {eachMonthOfInterval({ start: parseISO(fechas.llegada), end: parseISO(fechas.finReserva) }).map((mes) => {
              const desfase = (getDay(startOfMonth(mes)) + 6) % 7;
              const total = getDaysInMonth(mes);
              return (
                <div key={mes.toISOString()} className="space-y-1.5 max-w-sm">
                  <div className="font-display text-bosque capitalize">{format(mes, "LLLL yyyy", { locale: es })}</div>
                  <div className="grid grid-cols-7 gap-y-1 text-[11px] tabular-nums">
                    {LETRAS.map((l) => <div key={l} className="text-center text-[10px] text-muted pb-0.5">{l}</div>)}
                    {Array.from({ length: desfase }, (_, i) => <div key={`v${i}`} />)}
                    {Array.from({ length: total }, (_, i) => {
                      const dia = i + 1;
                      const key = format(new Date(mes.getFullYear(), mes.getMonth(), dia), "yyyy-MM-dd");
                      const t = tipoDelDia(fechas, key);
                      const col = (desfase + i) % 7;
                      // La raya se redondea donde empieza o termina el viaje, y también donde
                      // la corta el fin de semana o el fin de mes.
                      const a = t && (key === fechas.llegada || col === 0 || dia === 1);
                      const z = t && (key === fechas.finReserva || col === 6 || key === format(endOfMonth(mes), "yyyy-MM-dd"));
                      return (
                        <div
                          key={key}
                          title={t ? detalleDelDia(fechas, key, etapas) : undefined}
                          style={t && estado === "parcial" ? RAYADO_PARCIAL : undefined}
                          className={`relative h-7 grid place-items-center ${t ? `${TIPO_DIA_BG[t]} ${TIPO_DIA_TEXTO[t]} font-semibold cursor-default` : "text-fg"} ${a ? "rounded-l-full" : ""} ${z ? "rounded-r-full" : ""}`}
                        >
                          {dia}
                          {key === hoy && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-dorado-oscuro" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <LeyendaViaje tipos={tipos} />
          <p className="text-xs text-muted">
            Pasa el mouse por un día para ver qué toca.
            {estado === "borrador" ? (
              <> Mientras no haya un pago, el viaje no sale en el <Link href="/calendario?vista=pagados" className="underline hover:no-underline">calendario general</Link>.</>
            ) : (
              <> También está en el <Link href="/calendario?vista=pagados" className="underline hover:no-underline">calendario general</Link>.</>
            )}
          </p>
        </>
      )}
    </section>
  );
}
