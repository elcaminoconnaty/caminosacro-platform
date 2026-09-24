"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isSameDay, parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { statusColor, statusLabel } from "@/lib/quoteStatus";
import {
  HITOS, HITO_COLORS, HITO_CORTO, HITO_LABELS, fechaDeHito, type HitoViaje,
} from "@/lib/quotes/fechasViaje";
import type { ViajePagado } from "@/lib/quotes/viajesPagados";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_POR_DIA = 4;

type Marca = { viaje: ViajePagado; hito: HitoViaje };

const fechaCorta = (iso: string) => format(parseISO(iso), "EEE d LLL", { locale: es });

export default function ViajesPagadosView({ viajes }: { viajes: ViajePagado[] }) {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [activos, setActivos] = useState<Set<HitoViaje>>(new Set(HITOS));
  // Al pasar por encima de un viaje se resaltan sus cuatro marcas en el mes.
  const [resaltado, setResaltado] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);
  const todayKey = format(today, "yyyy-MM-dd");

  const conFechas = useMemo(() => viajes.filter((v) => v.fechas), [viajes]);
  const sinFechas = useMemo(() => viajes.filter((v) => !v.fechas && v.status !== "completada"), [viajes]);

  const porDia = useMemo(() => {
    const m = new Map<string, Marca[]>();
    for (const v of conFechas) {
      for (const h of HITOS) {
        if (!activos.has(h)) continue;
        const key = fechaDeHito(v.fechas!, h);
        const arr = m.get(key);
        if (arr) arr.push({ viaje: v, hito: h });
        else m.set(key, [{ viaje: v, hito: h }]);
      }
    }
    // Dentro del día, en el orden del viaje: primero quien llega, al final quien se va.
    for (const arr of m.values()) arr.sort((a, b) => HITOS.indexOf(a.hito) - HITOS.indexOf(b.hito));
    return m;
  }, [conFechas, activos]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  // Los que todavía tienen reserva por delante (o en curso), por fecha de llegada.
  const vigentes = useMemo(
    () => conFechas
      .filter((v) => v.fechas!.finReserva >= todayKey)
      .sort((a, b) => a.fechas!.llegada.localeCompare(b.fechas!.llegada)),
    [conFechas, todayKey],
  );

  function toggle(h: HitoViaje) {
    setActivos((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
      <div className="space-y-3">
        <div className="bg-bg-card border border-border rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-bosque capitalize">{format(month, "LLLL yyyy", { locale: es })}</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setMonth((m) => subMonths(m, 1))} className="p-1.5 rounded-md border border-border hover:bg-taupe/40 transition" aria-label="Mes anterior">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setMonth(startOfMonth(new Date()))} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
                Hoy
              </button>
              <button onClick={() => setMonth((m) => addMonths(m, 1))} className="p-1.5 rounded-md border border-border hover:bg-taupe/40 transition" aria-label="Mes siguiente">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {HITOS.map((h) => {
              const on = activos.has(h);
              return (
                <button
                  key={h}
                  onClick={() => toggle(h)}
                  className={`text-[11px] px-2 py-0.5 rounded transition ${on ? HITO_COLORS[h] : "bg-zinc-100 text-zinc-400 line-through"}`}
                >
                  {HITO_LABELS[h]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 bg-taupe/30 text-muted text-[11px] uppercase tracking-wider">
            {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const marcas = porDia.get(key) ?? [];
              const inMonth = isSameMonth(day, month);
              const isToday = isSameDay(day, today);
              return (
                <div key={key} className={`min-h-[104px] border-b border-r border-border p-1.5 ${inMonth ? "" : "bg-taupe/10"}`}>
                  <div className={`text-[11px] mb-1 flex justify-end ${inMonth ? "text-fg" : "text-muted/50"}`}>
                    <span className={isToday ? "bg-bosque text-white rounded-full w-5 h-5 flex items-center justify-center" : ""}>
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {marcas.slice(0, MAX_POR_DIA).map(({ viaje, hito }) => (
                      <Link
                        key={`${viaje.id}-${hito}`}
                        href={`/seguimiento/${viaje.id}`}
                        onMouseEnter={() => setResaltado(viaje.id)}
                        onMouseLeave={() => setResaltado(null)}
                        title={`${HITO_LABELS[hito]} · ${viaje.client_name ?? viaje.code} · ${viaje.route_name ?? ""}`}
                        className={`block truncate text-[10px] leading-tight px-1 py-0.5 rounded ${HITO_COLORS[hito]} ${resaltado === viaje.id ? "ring-2 ring-bosque" : ""}`}
                      >
                        <span className="font-semibold">{HITO_CORTO[hito]}</span> {viaje.client_name || viaje.code}
                      </Link>
                    ))}
                    {marcas.length > MAX_POR_DIA && (
                      <div className="text-[10px] text-muted px-1">+{marcas.length - MAX_POR_DIA} más</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="space-y-4 self-start">
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-display text-lg text-bosque">Viajes pagados</h2>
            <p className="text-xs text-muted mt-0.5">En curso y próximos, por fecha de llegada.</p>
          </div>
          <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto">
            {vigentes.map((v) => {
              const f = v.fechas!;
              const enCurso = f.llegada <= todayKey && todayKey <= f.finReserva;
              return (
                <li key={v.id}>
                  <Link
                    href={`/seguimiento/${v.id}`}
                    onMouseEnter={() => setResaltado(v.id)}
                    onMouseLeave={() => setResaltado(null)}
                    className={`block px-4 py-3 transition ${resaltado === v.id ? "bg-taupe/30" : "hover:bg-taupe/20"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">{v.client_name || v.code}</div>
                      {enCurso && <span className="text-[10px] px-1.5 py-0.5 rounded bg-bosque text-white shrink-0">En el Camino</span>}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {v.route_name || "—"}{v.people ? ` · ${v.people} pax` : ""} · {f.etapas} etapas
                      {f.nochesExtra > 0 ? ` + ${f.nochesExtra} ${f.nochesExtra === 1 ? "noche extra" : "noches extra"}` : ""}
                    </div>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                      {HITOS.map((h) => (
                        <div key={h} className="contents">
                          <dt><span className={`inline-block px-1.5 rounded ${HITO_COLORS[h]}`}>{HITO_LABELS[h]}</span></dt>
                          <dd className={`capitalize ${fechaDeHito(f, h) < todayKey ? "text-muted line-through" : ""}`}>{fechaCorta(fechaDeHito(f, h))}</dd>
                        </div>
                      ))}
                    </dl>
                    <span className={`inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded ${statusColor(v.status)}`}>{statusLabel(v.status)}</span>
                  </Link>
                </li>
              );
            })}
            {vigentes.length === 0 && (
              <li className="px-4 py-10 text-center text-muted text-sm">No hay viajes pagados en curso ni por venir.</li>
            )}
          </ul>
        </div>

        {sinFechas.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <h3 className="text-sm font-medium text-amber-900">Pagados sin fechas calculables</h3>
            <p className="text-xs text-amber-800 mt-0.5">Les falta la fecha de salida o el itinerario. No salen en el calendario hasta completarlos.</p>
            <ul className="mt-2 space-y-1">
              {sinFechas.map((v) => (
                <li key={v.id}>
                  <Link href={`/seguimiento/${v.id}`} className="text-xs text-amber-900 underline hover:no-underline">
                    {v.client_name || v.code} · {v.route_name || "sin ruta"}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
