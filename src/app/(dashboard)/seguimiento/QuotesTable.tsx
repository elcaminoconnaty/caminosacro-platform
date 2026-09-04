"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Copy, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import { eur, fechaCorta } from "@/lib/format";
import { QUOTE_STATUSES, STATUS_COLORS, STATUS_LABELS, statusLabel } from "@/lib/quoteStatus";
import { updateQuoteStatus, deleteQuote, duplicateQuote } from "./[id]/actions";
import { coincideCotizacion } from "@/lib/quotes/buscar";
import { enFoco, resumirFranja, type Foco } from "@/lib/quotes/franjaHoy";

export type QuoteRow = {
  id: string;
  code: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  route_name: string | null;
  start_date: string | null;
  people: number | null;
  total_eur: number;
  cost_eur: number;
  cobrado: number;
  saldo: number;
  utilidad: number;
  status: string | null;
  source: string | null;
  valid_until: string | null;
  /** Contratos emitidos para esta cotización, y cuántos siguen sin firma. */
  contratos: number;
  sin_firmar: number;
};

// Cotizaciones que creó un visitante externo (cotizador de caminosacro.com o /cotizar),
// no el equipo desde el CRM.
export function esCotizacionWeb(source: string | null): boolean {
  return source === "wordpress" || source === "web";
}

// Cotizaciones que armó BayMax por Telegram. Se comportan como internas (mismo
// tope de personas, sin correo automático al cliente), pero van marcadas: Nico
// tiene que poder ver de un vistazo qué creó el agente y qué creó él a mano.
export function esCotizacionBayMax(source: string | null): boolean {
  return source === "baymax";
}

type SortKey = "code" | "client_name" | "route_name" | "start_date" | "total_eur" | "saldo" | "status";
type SortDir = "asc" | "desc";

function cmp(a: QuoteRow, b: QuoteRow, key: SortKey): number {
  switch (key) {
    case "total_eur": return a.total_eur - b.total_eur;
    case "saldo": return a.saldo - b.saldo;
    case "start_date": {
      const av = a.start_date || "";
      const bv = b.start_date || "";
      if (av === bv) return 0;
      if (!av) return 1; // sin fecha al final
      if (!bv) return -1;
      return av < bv ? -1 : 1;
    }
    default: {
      const av = String(a[key] ?? "").toLowerCase();
      const bv = String(b[key] ?? "").toLowerCase();
      return av.localeCompare(bv, "es");
    }
  }
}

export default function QuotesTable({ rows, hoy }: { rows: QuoteRow[]; hoy: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set(QUOTE_STATUSES));
  const [routeFilter, setRouteFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Cubo de la franja «Hoy» que está aplicado. Es un filtro más, no una vista aparte: se
  // combina con la búsqueda y con los demás, y «Limpiar» también lo quita.
  const [foco, setFoco] = useState<Foco | null>(null);

  const franja = useMemo(() => resumirFranja(rows, hoy), [rows, hoy]);

  const routes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.route_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "es")),
    [rows],
  );

  const filtered = useMemo(() => {
    // La misma regla que usa BayMax por Telegram (@/lib/quotes/buscar): busca también por
    // correo, ignora tildes y compara los teléfonos por sus dígitos. Si algo aparece acá
    // tiene que aparecer allá, y al revés.
    const q = search.trim();
    const allStatusesOn = activeStatuses.size === QUOTE_STATUSES.length;
    const out = rows.filter((r) => {
      if (q && !coincideCotizacion(r, q)) return false;
      if (!allStatusesOn && !activeStatuses.has(r.status ?? "")) return false;
      if (routeFilter && r.route_name !== routeFilter) return false;
      if (from && (!r.start_date || r.start_date < from)) return false;
      if (to && (!r.start_date || r.start_date > to)) return false;
      if (foco && !enFoco(r, foco, hoy)) return false;
      return true;
    });
    out.sort((a, b) => {
      const c = cmp(a, b, sortKey);
      return sortDir === "asc" ? c : -c;
    });
    return out;
  }, [rows, search, activeStatuses, routeFilter, from, to, foco, hoy, sortKey, sortDir]);

  function toggleStatus(s: string) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "start_date" || key === "total_eur" || key === "saldo" ? "desc" : "asc");
    }
  }

  function onChangeStatus(id: string, status: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const r = await updateQuoteStatus(id, status);
      if (r?.error) setError(r.error);
      setBusyId(null);
    });
  }

  function onDuplicate(row: QuoteRow) {
    setError(null);
    setBusyId(row.id);
    startTransition(async () => {
      const r = await duplicateQuote(row.id);
      if (r?.error) setError(r.error);
      // Se abre la copia: lo primero que se hace con una es cambiarle las fechas o el
      // cliente, así que dejarla en el listado obligaría a buscarla.
      else if (r?.id) router.push(`/seguimiento/${r.id}`);
      setBusyId(null);
    });
  }

  function onDelete(row: QuoteRow) {
    const label = row.client_name ? `${row.code} · ${row.client_name}` : row.code;
    if (!confirm(`¿Borrar la cotización ${label} por completo? Esta acción no se puede deshacer.`)) return;
    setError(null);
    setBusyId(row.id);
    startTransition(async () => {
      const r = await deleteQuote(row.id);
      if (r?.error) setError(r.error);
      setBusyId(null);
    });
  }

  const resetFilters = () => {
    setSearch("");
    setActiveStatuses(new Set(QUOTE_STATUSES));
    setRouteFilter("");
    setFrom("");
    setTo("");
    setFoco(null);
  };

  const filtersOn = search || routeFilter || from || to || foco || activeStatuses.size !== QUOTE_STATUSES.length;

  return (
    <div className="space-y-3">
      {/* Franja «Hoy»: qué pide trabajo. Pulsar un cubo filtra la tabla de abajo. */}
      <section aria-label="Qué pide trabajo hoy" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {franja.map((f) => {
          const activo = foco === f.foco;
          const vacio = f.cuantas === 0;
          return (
            <button
              key={f.foco}
              type="button"
              onClick={() => setFoco(activo ? null : f.foco)}
              disabled={vacio}
              aria-pressed={activo}
              className={[
                "text-left rounded-xl border px-4 py-3 transition",
                // El borde izquierdo es lo que se ve de reojo; el rojo se reserva para lo
                // que se rompe si no se hace hoy, y no se gasta en el resto.
                activo ? "border-bosque ring-1 ring-bosque bg-bosque/5" : "border-border bg-bg-card",
                vacio ? "opacity-55 cursor-default" : "hover:border-bosque/50 cursor-pointer",
                f.urgente && !vacio ? "border-l-4 border-l-red-600" : "border-l-4 border-l-transparent",
              ].join(" ")}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-display text-2xl ${
                    vacio ? "text-muted" : f.urgente ? "text-red-700" : "text-bosque"
                  }`}
                >
                  {f.cuantas}
                </span>
                <span className="text-sm font-medium text-fg">{f.titulo}</span>
              </div>
              <div className="text-xs text-muted mt-0.5">
                {vacio ? "ninguna ahora" : f.pie}
                {!vacio && f.eur != null && f.eur > 0 && (
                  <> · <span className="text-fg font-medium">{eur(f.eur)}</span></>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Controles */}
      <div className="bg-bg-card border border-border rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente, correo, teléfono, código o ruta…"
              className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-white text-sm"
            />
          </div>
          <select
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-border bg-white text-sm max-w-[220px]"
          >
            <option value="">Todas las rutas</option>
            {routes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Salida
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1.5 rounded-md border border-border bg-white text-sm" />
            <span>—</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1.5 rounded-md border border-border bg-white text-sm" />
          </label>
          {filtersOn && (
            <button onClick={resetFilters} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
              Limpiar
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted mr-1">Estado:</span>
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

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">{error}</div>
      )}

      {/* Tabla */}
      <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
              <tr>
                <Th label="Código" onClick={() => sortBy("code")} active={sortKey === "code"} dir={sortDir} />
                <Th label="Cliente" onClick={() => sortBy("client_name")} active={sortKey === "client_name"} dir={sortDir} />
                <th className="text-left px-4 py-2.5">Teléfono</th>
                <Th label="Ruta" onClick={() => sortBy("route_name")} active={sortKey === "route_name"} dir={sortDir} />
                <Th label="Salida" onClick={() => sortBy("start_date")} active={sortKey === "start_date"} dir={sortDir} />
                <th className="text-center px-4 py-2.5">Pax</th>
                <Th label="Total €" align="right" onClick={() => sortBy("total_eur")} active={sortKey === "total_eur"} dir={sortDir} />
                <th className="text-right px-4 py-2.5">Cobrado</th>
                <Th label="Saldo" align="right" onClick={() => sortBy("saldo")} active={sortKey === "saldo"} dir={sortDir} />
                <th className="text-center px-4 py-2.5">Firmas</th>
                <Th label="Estado" onClick={() => sortBy("status")} active={sortKey === "status"} dir={sortDir} />
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((q) => (
                <tr key={q.id} className={`hover:bg-taupe/20 ${busyId === q.id && pending ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <Link href={`/seguimiento/${q.id}`} className="text-bosque font-medium hover:underline">{q.code}</Link>
                    {esCotizacionWeb(q.source) && (
                      <span className="ml-1.5 align-middle text-[10px] px-1.5 py-0.5 rounded bg-dorado-oscuro/15 text-dorado-oscuro font-semibold uppercase tracking-wide">Web</span>
                    )}
                    {esCotizacionBayMax(q.source) && (
                      <span className="ml-1.5 align-middle text-[10px] px-1.5 py-0.5 rounded bg-bosque-medio/15 text-bosque-medio font-semibold uppercase tracking-wide">BayMax</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{q.client_name || <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted text-xs font-mono">{q.client_phone || "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{q.route_name || "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">{q.start_date ? fechaCorta(q.start_date) : "—"}</td>
                  <td className="px-4 py-2.5 text-muted text-center">{q.people ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">{q.total_eur > 0 ? eur(q.total_eur) : <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2.5 text-right">{q.cobrado > 0 ? eur(q.cobrado) : <span className="text-muted">—</span>}</td>
                  <td className={`px-4 py-2.5 text-right ${q.saldo > 0 ? "text-amber-700 font-medium" : "text-muted"}`}>
                    {q.total_eur > 0 ? eur(q.saldo) : "—"}
                  </td>
                  {/* Firmas: "1 de 2" y en rojo si falta alguna. Sin contratos emitidos
                      todavía se pone "—", que no es lo mismo que "0 de 0". */}
                  <td className="px-4 py-2.5 text-center whitespace-nowrap">
                    {q.contratos === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span
                        className={`text-xs font-medium ${q.sin_firmar > 0 ? "text-red-700" : "text-muted"}`}
                        title={
                          q.sin_firmar > 0
                            ? `${q.sin_firmar} de ${q.contratos} sin firmar`
                            : "Todos los contratos firmados"
                        }
                      >
                        {q.contratos - q.sin_firmar} de {q.contratos}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <select
                      value={q.status ?? ""}
                      onChange={(e) => onChangeStatus(q.id, e.target.value)}
                      disabled={pending}
                      className={`text-[11px] px-2 py-1 rounded border-0 cursor-pointer ${q.status ? STATUS_COLORS[q.status as keyof typeof STATUS_COLORS] ?? "bg-zinc-100 text-zinc-700" : "bg-zinc-100 text-zinc-700"}`}
                    >
                      {!q.status && <option value="">—</option>}
                      {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {/* p-1.5 con -m-1.5 agranda el área tocable de 15x15 a 27x27 sin mover la
                        fila: 15x15 no llega ni al mínimo de 24x24 y esto borra de verdad. */}
                    <span className="inline-flex items-center gap-1">
                      <button
                        onClick={() => onDuplicate(q)}
                        disabled={pending}
                        title={`Duplicar ${q.code}`}
                        className="p-1.5 text-muted hover:text-bosque disabled:opacity-40 transition"
                      >
                        <Copy size={15} />
                        <span className="sr-only">Duplicar {q.code}</span>
                      </button>
                      <button
                        onClick={() => onDelete(q)}
                        disabled={pending}
                        title={`Borrar ${q.code}`}
                        className="p-1.5 text-muted hover:text-red-600 disabled:opacity-40 transition"
                      >
                        <Trash2 size={15} />
                        <span className="sr-only">Borrar {q.code}</span>
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-muted">
                    {rows.length === 0 ? "Sin cotizaciones aún." : "Ninguna cotización coincide con los filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-muted border-t border-border">
          Mostrando {filtered.length} de {rows.length} cotizaciones
        </div>
      </section>
    </div>
  );
}

function Th({
  label, onClick, active, dir, align = "left",
}: { label: string; onClick: () => void; active: boolean; dir: SortDir; align?: "left" | "right" }) {
  return (
    <th className={`px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-fg transition ${active ? "text-fg" : ""}`}>
        <span>{label}</span>
        {active ? (dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
      </button>
    </th>
  );
}
