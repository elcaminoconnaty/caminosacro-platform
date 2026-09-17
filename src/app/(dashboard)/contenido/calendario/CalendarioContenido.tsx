"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/cn";
import { CADENCIA, CADENCIAS, horaLocal, type CadenciaId } from "@/lib/contenido/fechas";
import type { DiaOcupado, Programacion } from "@/lib/contenido/programacion";
import { desprogramarPieza, guardarProgramacion } from "../[id]/programarActions";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const CLASE: Record<DiaOcupado["tipo"], string> = {
  publicado: "bg-bosque text-white",
  programado: "bg-dorado text-bosque",
  publicando: "bg-dorado-oscuro text-bosque",
  error: "bg-red-100 text-red-800",
};
const ETIQUETA: Record<DiaOcupado["tipo"], string> = {
  publicado: "Publicado", programado: "Programado", publicando: "Publicando", error: "Falló",
};

/**
 * Cuadrícula mensual calcada de /calendario (viajes), con lo que ocupa cada día. Las
 * fechas son cadenas `YYYY-MM-DD` ya en Bogotá: la cuadrícula se arma con date-fns sobre
 * fechas "de calendario" a mediodía UTC para que ningún huso las corra de día.
 */
export default function CalendarioContenido({
  ocupados, preferencia, hoy,
}: { ocupados: DiaOcupado[]; preferencia: Programacion; hoy: string }) {
  const router = useRouter();
  const [month, setMonth] = useState<Date>(() => aFecha(hoy.slice(0, 7) + "-01"));
  const [hora, setHora] = useState(preferencia.hora);
  const [cadencia, setCadencia] = useState<CadenciaId>(preferencia.cadencia);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const byDay = useMemo(() => {
    const m = new Map<string, DiaOcupado[]>();
    for (const o of ocupados) {
      const arr = m.get(o.fecha);
      if (arr) arr.push(o);
      else m.set(o.fecha, [o]);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.instante ?? "").localeCompare(b.instante ?? ""));
    return m;
  }, [ocupados]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  const mesKey = format(month, "yyyy-MM");
  const delMes = ocupados.filter((o) => o.fecha.startsWith(mesKey));
  const programadasMes = delMes.filter((o) => o.tipo === "programado" || o.tipo === "publicando").length;
  const publicadasMes = delMes.filter((o) => o.tipo === "publicado").length;

  const proximas = useMemo(
    () => ocupados
      .filter((o) => (o.tipo === "programado" || o.tipo === "publicando" || o.tipo === "error") && o.fecha >= hoy)
      .sort((a, b) => (a.instante ?? a.fecha).localeCompare(b.instante ?? b.fecha))
      .slice(0, 30),
    [ocupados, hoy],
  );

  function guardar(h: string, c: CadenciaId) {
    setAviso(null);
    iniciar(async () => {
      const r = await guardarProgramacion(h, c);
      if ("error" in r && r.error) setAviso(r.error);
    });
  }

  function quitar(id: string) {
    setAviso(null);
    iniciar(async () => {
      const r = await desprogramarPieza(id);
      if ("error" in r && r.error) setAviso(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-3">
        <div className="bg-bg-card border border-border rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-display text-xl text-bosque capitalize">{format(month, "LLLL yyyy", { locale: es })}</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setMonth((m) => subMonths(m, 1))} className="p-1.5 rounded-md border border-border hover:bg-taupe/40 transition" aria-label="Mes anterior">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setMonth(aFecha(hoy.slice(0, 7) + "-01"))} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
                Hoy
              </button>
              <button onClick={() => setMonth((m) => addMonths(m, 1))} className="p-1.5 rounded-md border border-border hover:bg-taupe/40 transition" aria-label="Mes siguiente">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-muted">
            <span>
              <strong className="text-fg">{publicadasMes}</strong> publicadas · <strong className="text-fg">{programadasMes}</strong> en cola este mes
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-bosque inline-block" /> publicado</span>
              <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-dorado inline-block" /> programado</span>
              <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-red-200 inline-block" /> falló</span>
            </span>
          </div>

          {/* Preferencias: lo que "Aprobar y programar" propone. Se guardan al cambiar. */}
          <div className="flex items-center gap-3 flex-wrap border-t border-border pt-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              Ritmo
              <select
                value={cadencia}
                disabled={pendiente}
                onChange={(e) => { const c = e.target.value as CadenciaId; setCadencia(c); guardar(hora, c); }}
                className="px-2 py-1 rounded-md border border-border bg-bg-card text-xs text-fg"
              >
                {CADENCIAS.map((c) => <option key={c} value={c}>{CADENCIA[c].etiqueta}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              Hora por defecto
              <input
                type="time"
                value={hora}
                disabled={pendiente}
                onChange={(e) => setHora(e.target.value)}
                onBlur={() => hora !== preferencia.hora && guardar(hora, cadencia)}
                className="px-2 py-1 rounded-md border border-border bg-bg-card text-xs text-fg"
              />
            </label>
            <span className="text-[11px] text-muted">{CADENCIA[cadencia].ayuda} Se usa para proponer el siguiente día libre.</span>
            {aviso && <span className="text-[11px] text-dorado-oscuro">{aviso}</span>}
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 bg-taupe/30 text-muted text-[11px] uppercase tracking-wider">
            {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const evs = byDay.get(key) ?? [];
              const inMonth = isSameMonth(day, month);
              const isToday = key === hoy;
              return (
                <div key={key} className={cn("min-h-[92px] border-b border-r border-border p-1.5", !inMonth && "bg-taupe/10", key < hoy && inMonth && "bg-taupe/5")}>
                  <div className={cn("text-[11px] mb-1 flex justify-end", inMonth ? "text-fg" : "text-muted/50")}>
                    <span className={isToday ? "bg-bosque text-white rounded-full w-5 h-5 flex items-center justify-center" : ""}>
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 3).map((o, i) => {
                      const texto = `${o.instante && o.tipo !== "publicado" ? `${horaLocal(o.instante)} ` : ""}${o.titulo ?? ""}`;
                      const clase = cn("block truncate text-[10px] leading-tight px-1 py-0.5 rounded", CLASE[o.tipo]);
                      const title = `${ETIQUETA[o.tipo]} · ${o.titulo ?? ""}${o.error ? ` · ${o.error}` : ""}`;
                      if (o.pieza_id) {
                        return <Link key={`${o.pieza_id}-${i}`} href={`/contenido/${o.pieza_id}`} title={title} className={clase}>{texto}</Link>;
                      }
                      if (o.permalink) {
                        return <a key={`bot-${i}`} href={o.permalink} target="_blank" rel="noreferrer" title={title} className={clase}>{texto}</a>;
                      }
                      return <span key={`x-${i}`} title={title} className={clase}>{texto}</span>;
                    })}
                    {evs.length > 3 && <div className="text-[10px] text-muted px-1">+{evs.length - 3} más</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="bg-bg-card border border-border rounded-xl overflow-hidden self-start">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-display text-lg text-bosque">En cola</h2>
          <p className="text-xs text-muted mt-0.5">Desde hoy, por hora de salida (Colombia).</p>
        </div>
        <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto">
          {proximas.map((o, i) => (
            <li key={`${o.pieza_id ?? "x"}-${i}`} className="px-4 py-3 flex items-start gap-3">
              <div className="text-center shrink-0 w-10">
                <div className="font-display text-lg text-bosque leading-none">{Number(o.fecha.slice(8, 10))}</div>
                <div className="text-[10px] text-muted uppercase">{format(aFecha(o.fecha), "LLL", { locale: es })}</div>
              </div>
              <div className="min-w-0 flex-1">
                {o.pieza_id ? (
                  <Link href={`/contenido/${o.pieza_id}`} className="text-sm font-medium truncate block hover:text-bosque">{o.titulo}</Link>
                ) : (
                  <div className="text-sm font-medium truncate">{o.titulo}</div>
                )}
                <div className="text-xs text-muted">
                  {o.instante ? horaLocal(o.instante) : "—"} · <span className={cn("px-1 rounded", CLASE[o.tipo])}>{ETIQUETA[o.tipo]}</span>
                </div>
                {o.error && <div className="text-[11px] text-red-700 leading-snug mt-0.5">{o.error}</div>}
                {o.tipo === "programado" && o.pieza_id && (
                  <button type="button" disabled={pendiente} onClick={() => quitar(o.pieza_id!)}
                    className="mt-1 text-[11px] text-muted underline hover:text-bosque disabled:opacity-50">
                    Quitar de la cola
                  </button>
                )}
              </div>
            </li>
          ))}
          {proximas.length === 0 && (
            <li className="px-4 py-10 text-center text-muted text-sm">Nada en cola. Abre una pieza y pulsa «Aprobar y programar».</li>
          )}
        </ul>
      </aside>
    </div>
  );
}

/** `YYYY-MM-DD` → Date a mediodía local: date-fns la formatea sin que ningún huso la corra. */
function aFecha(fecha: string): Date {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d, 12);
}
