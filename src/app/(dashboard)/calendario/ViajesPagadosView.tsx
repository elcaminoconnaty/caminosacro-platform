"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { sumarDiasIso } from "@/lib/quotes/itinerario";
import {
  HITOS, HITO_CORTO, HITO_LABELS, TIPO_DIA_BG, detalleDelDia, fechaDeHito, tipoDelDia, type FechasViaje,
} from "@/lib/quotes/fechasViaje";
import type { ViajePagado } from "@/lib/quotes/viajesPagados";
import { LeyendaViaje, RAYADO_PARCIAL } from "@/components/viaje/RayaViaje";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Las puntas de la raya cuando sigue en la semana anterior o en la siguiente.
const PUNTA_IZQ = "polygon(6px 0, 100% 0, 100% 100%, 6px 100%, 0 50%)";
const PUNTA_DER = "polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%)";

const fechaCorta = (iso: string) => format(parseISO(iso), "EEE d LLL", { locale: es });
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const nombre = (v: ViajePagado) => v.client_name?.trim() || "Sin nombre";

function resumen(v: ViajePagado, f: FechasViaje): string {
  return [
    `${nombre(v)} · ${v.code}`,
    `${v.route_name ?? "—"}${v.people ? ` · ${v.people} pax` : ""}`,
    `Llega ${fechaCorta(f.llegada)}`,
    `Camina ${fechaCorta(f.inicioCamino)} → ${fechaCorta(f.finCamino)}`,
    ...(f.nochesExtra > 0 ? [`${f.nochesExtra} ${f.nochesExtra === 1 ? "noche extra" : "noches extra"} en Santiago`] : []),
    ...(f.tours.length > 0 ? [`Tours: ${f.tours.join(", ")}`] : []),
    `Sale ${fechaCorta(f.finReserva)}`,
  ].join("\n");
}

/** Toda la raya en pequeño, un tramo por día: para la lista lateral. */
function MiniRaya({ f, parcial }: { f: FechasViaje; parcial: boolean }) {
  const total = f.etapas + 2 + f.nochesExtra;
  return (
    <div className="flex h-2 rounded overflow-hidden">
      {Array.from({ length: total }, (_, i) => {
        const t = tipoDelDia(f, sumarDiasIso(f.llegada, i));
        return <i key={i} className={`flex-1 ${t ? TIPO_DIA_BG[t] : ""}`} style={parcial ? RAYADO_PARCIAL : undefined} />;
      })}
    </div>
  );
}

export default function ViajesPagadosView({ viajes }: { viajes: ViajePagado[] }) {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  // Al pasar por encima de un viaje se resalta su raya en el mes y su fila en la lista.
  const [resaltado, setResaltado] = useState<string | null>(null);
  const todayKey = useMemo(() => iso(new Date()), []);

  const conFechas = useMemo(
    () => viajes
      .filter((v): v is ViajePagado & { fechas: FechasViaje } => !!v.fechas)
      .sort((a, b) => a.fechas.llegada.localeCompare(b.fechas.llegada)),
    [viajes],
  );
  const sinFechas = useMemo(() => viajes.filter((v) => !v.fechas && v.status !== "completada"), [viajes]);
  const hayParciales = conFechas.some((v) => v.status === "pago_parcial");

  const semanas = useMemo(() => {
    const dias = eachDayOfInterval({
      start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
    });
    const out: Date[][] = [];
    for (let i = 0; i < dias.length; i += 7) out.push(dias.slice(i, i + 7));
    return out;
  }, [month]);

  // Los que todavía tienen reserva por delante (o en curso), por fecha de llegada.
  const vigentes = useMemo(() => conFechas.filter((v) => v.fechas.finReserva >= todayKey), [conFechas, todayKey]);

  return (
    <div className="space-y-3">
      <LeyendaViaje parcial={hayParciales} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden self-start">
          <div className="flex items-center justify-between px-3 py-3 border-b border-border">
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
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-7 bg-taupe/30 text-muted text-[11px] uppercase tracking-wider">
                {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
              </div>
              {semanas.map((dias) => {
                const claves = dias.map(iso);
                const desde = claves[0];
                const hasta = claves[6];
                const enSemana = conFechas.filter((v) => v.fechas.llegada <= hasta && v.fechas.finReserva >= desde);
                return (
                  <div key={desde} className="relative border-b border-border">
                    {/* Las celdas del fondo: número del día y líneas verticales. */}
                    <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                      {dias.map((d, i) => (
                        <div key={i} className={`border-r border-border last:border-r-0 ${isSameMonth(d, month) ? "" : "bg-taupe/10"}`} />
                      ))}
                    </div>
                    <div className="relative grid grid-cols-7">
                      {dias.map((d, i) => {
                        const esHoy = claves[i] === todayKey;
                        return (
                          <div key={i} className={`text-[11px] px-2 pt-1 flex justify-end ${isSameMonth(d, month) ? "text-fg" : "text-muted/50"}`}>
                            <span className={esHoy ? "bg-bosque text-white rounded-full w-5 h-5 flex items-center justify-center" : ""}>{format(d, "d")}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Una raya por viaje; `dense` deja que dos viajes que no se tocan compartan carril. */}
                    <div className="relative grid grid-cols-7 [grid-auto-flow:row_dense] gap-y-1.5 pt-1 pb-3 min-h-[64px] content-start">
                      {enSemana.map((v) => {
                        const f = v.fechas;
                        const a = Math.max(0, claves.findIndex((k) => k >= f.llegada));
                        let z = 6;
                        while (z > 0 && claves[z] > f.finReserva) z--;
                        const empieza = f.llegada >= desde;
                        const termina = f.finReserva <= hasta;
                        const parcial = v.status === "pago_parcial";
                        const on = resaltado === v.id;
                        return (
                          <Link
                            key={v.id}
                            href={`/seguimiento/${v.id}`}
                            aria-label={`${nombre(v)}, ${v.code}, del ${fechaCorta(f.llegada)} al ${fechaCorta(f.finReserva)}`}
                            onMouseEnter={() => setResaltado(v.id)}
                            onMouseLeave={() => setResaltado(null)}
                            style={{ gridColumn: `${a + 1} / ${z + 2}` }}
                            className={`relative flex h-6 mx-[3px] transition ${on ? "ring-2 ring-bosque rounded-full brightness-105" : ""}`}
                          >
                            {claves.slice(a, z + 1).map((k, i, arr) => {
                              const t = tipoDelDia(f, k) ?? "camino";
                              const primero = i === 0;
                              const ultimo = i === arr.length - 1;
                              const style = {
                                ...(parcial ? RAYADO_PARCIAL : {}),
                                ...(primero && !empieza ? { clipPath: PUNTA_IZQ } : {}),
                                ...(ultimo && !termina ? { clipPath: PUNTA_DER } : {}),
                              };
                              return (
                                <div
                                  key={k}
                                  title={`${detalleDelDia(f, k)}\n\n${resumen(v, f)}`}
                                  style={style}
                                  className={`relative flex-1 min-w-0 ${TIPO_DIA_BG[t]} ${primero && empieza ? "rounded-l-full" : ""} ${ultimo && termina ? "rounded-r-full" : ""}`}
                                >
                                  {/* Un punto blanco donde arranca y donde termina la caminata. */}
                                  {k === f.inicioCamino && <span className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white ring-2 ring-bosque z-10" />}
                                  {k === f.finCamino && <span className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white ring-2 ring-bosque z-10" />}
                                </div>
                              );
                            })}
                            <span className="absolute inset-y-0 left-2.5 right-1 flex items-center gap-1 text-[11px] font-semibold text-white whitespace-nowrap overflow-hidden pointer-events-none [text-shadow:0_1px_2px_rgba(0,0,0,.45)]">
                              {nombre(v)}
                              <span className="font-normal opacity-90">· {v.code}</span>
                            </span>
                          </Link>
                        );
                      })}
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
              <h2 className="font-display text-lg text-bosque">En curso y próximos</h2>
              <p className="text-xs text-muted mt-0.5">Viajes pagados, por fecha de llegada. Click para ir a su mes.</p>
            </div>
            <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto">
              {vigentes.map((v) => {
                const f = v.fechas;
                const enCurso = f.llegada <= todayKey && todayKey <= f.finReserva;
                const parcial = v.status === "pago_parcial";
                return (
                  <li key={v.id}>
                    <div
                      onMouseEnter={() => setResaltado(v.id)}
                      onMouseLeave={() => setResaltado(null)}
                      className={`px-4 py-3 space-y-1.5 transition ${resaltado === v.id ? "bg-taupe/30" : "hover:bg-taupe/20"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => setMonth(startOfMonth(parseISO(f.llegada)))} className="text-left min-w-0">
                          <div className="text-sm font-medium truncate">{nombre(v)}</div>
                          <div className="text-[11px] text-muted">{v.code}</div>
                        </button>
                        {enCurso ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bosque text-white shrink-0">En el Camino</span>
                        ) : parcial ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">Pago parcial</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted truncate">
                        {v.route_name || "—"}{v.people ? ` · ${v.people} pax` : ""} · {f.etapas} etapas
                        {f.nochesExtra > 0 ? ` + ${f.nochesExtra} ${f.nochesExtra === 1 ? "noche extra" : "noches extra"}` : ""}
                      </div>
                      <MiniRaya f={f} parcial={parcial} />
                      <dl className="grid grid-cols-4 gap-1 text-[10px] text-muted">
                        {HITOS.map((h) => (
                          <div key={h}>
                            <dt className="truncate" title={HITO_LABELS[h]}>{HITO_CORTO[h]}</dt>
                            <dd className={`capitalize text-[11px] font-medium ${fechaDeHito(f, h) < todayKey ? "text-muted line-through" : "text-fg"}`}>{fechaCorta(fechaDeHito(f, h))}</dd>
                          </div>
                        ))}
                      </dl>
                      <Link href={`/seguimiento/${v.id}`} className="inline-block text-[11px] text-bosque underline hover:no-underline">Abrir expediente</Link>
                    </div>
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
                      {nombre(v)} · {v.code}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
