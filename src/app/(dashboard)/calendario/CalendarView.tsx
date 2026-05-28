"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isSameDay, parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { QUOTE_STATUSES, STATUS_COLORS, STATUS_LABELS } from "@/lib/quoteStatus";

export type TripEvent = {
  id: string;
  code: string;
  client_name: string | null;
  route_name: string | null;
  start_date: string;
  end_date: string | null;
  people: number | null;
  status: string | null;
};

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function CalendarView({ events }: { events: TripEvent[] }) {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set(QUOTE_STATUSES));
  const today = useMemo(() => new Date(), []);

  const visible = useMemo(
    () => events.filter((e) => activeStatuses.has(e.status ?? "")),
    [events, activeStatuses],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, TripEvent[]>();
    for (const e of visible) {
      const key = e.start_date.slice(0, 10);
      const arr = m.get(key);
      if (arr) arr.push(e);
      else m.set(key, [e]);
    }
    return m;
  }, [visible]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  const upcoming = useMemo(() => {
    const todayKey = format(today, "yyyy-MM-dd");
    return visible
      .filter((e) => e.start_date.slice(0, 10) >= todayKey)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 20);
  }, [visible, today]);

  function toggleStatus(s: string) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-3">
        {/* Cabecera de mes + filtros */}
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
            {QUOTE_STATUSES.map((s) => {
              const on = activeStatuses.has(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={`text-[11px] px-2 py-0.5 rounded transition ${on ? STATUS_COLORS[s] : "bg-zinc-100 text-zinc-400 line-through"}`}
                >
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cuadrícula del mes */}
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 bg-taupe/30 text-muted text-[11px] uppercase tracking-wider">
            {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const evs = byDay.get(key) ?? [];
              const inMonth = isSameMonth(day, month);
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={key}
                  className={`min-h-[92px] border-b border-r border-border p-1.5 ${inMonth ? "" : "bg-taupe/10"}`}
                >
                  <div className={`text-[11px] mb-1 flex justify-end ${inMonth ? "text-fg" : "text-muted/50"}`}>
                    <span className={isToday ? "bg-bosque text-white rounded-full w-5 h-5 flex items-center justify-center" : ""}>
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 3).map((e) => (
                      <Link
                        key={e.id}
                        href={`/seguimiento/${e.id}`}
                        title={`${e.client_name ?? e.code} · ${e.route_name ?? ""}`}
                        className={`block truncate text-[10px] leading-tight px-1 py-0.5 rounded ${STATUS_COLORS[e.status as keyof typeof STATUS_COLORS] ?? "bg-zinc-100 text-zinc-700"}`}
                      >
                        {e.client_name || e.code}
                      </Link>
                    ))}
                    {evs.length > 3 && (
                      <div className="text-[10px] text-muted px-1">+{evs.length - 3} más</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Próximas salidas */}
      <aside className="bg-bg-card border border-border rounded-xl overflow-hidden self-start">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-display text-lg text-bosque">Próximas salidas</h2>
          <p className="text-xs text-muted mt-0.5">Desde hoy, por fecha de inicio.</p>
        </div>
        <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto">
          {upcoming.map((e) => (
            <li key={e.id}>
              <Link href={`/seguimiento/${e.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-taupe/20 transition">
                <div className="text-center shrink-0 w-10">
                  <div className="font-display text-lg text-bosque leading-none">{format(parseISO(e.start_date), "d")}</div>
                  <div className="text-[10px] text-muted uppercase">{format(parseISO(e.start_date), "LLL", { locale: es })}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{e.client_name || e.code}</div>
                  <div className="text-xs text-muted truncate">{e.route_name || "—"}{e.people ? ` · ${e.people} pax` : ""}</div>
                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[e.status as keyof typeof STATUS_COLORS] ?? "bg-zinc-100 text-zinc-700"}`}>
                    {STATUS_LABELS[e.status as keyof typeof STATUS_LABELS] ?? e.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
          {upcoming.length === 0 && (
            <li className="px-4 py-10 text-center text-muted text-sm">No hay salidas próximas con los filtros actuales.</li>
          )}
        </ul>
      </aside>
    </div>
  );
}
