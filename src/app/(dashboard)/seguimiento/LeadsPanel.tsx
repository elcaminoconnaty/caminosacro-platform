"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Inbox, Mail, MessageCircle, TriangleAlert, Undo2 } from "lucide-react";
import { fechaCortaISO, hace } from "@/lib/format";
import {
  agruparLeads,
  motivoLabel,
  tipoLabel,
  MOTIVO_EXPLICACION,
  type GrupoLead,
  type WebLead,
} from "@/lib/leads/webLeads";
import { marcarLeadAtendido } from "./leadsActions";

/**
 * Los leads del cotizador de la web que se quedaron sin precio.
 *
 * Por qué está en Seguimiento y no en una pantalla propia: para Nico es la misma
 * pregunta —«¿a quién le debo algo?»— y una pantalla aparte es una pantalla que no se
 * abre. Estas personas escribieron igual que Pepa; lo único distinto es que la web no
 * pudo darles una cifra, así que no hay cotización que enseñar. Hasta ahora eso las hacía
 * desaparecer del panel entero: quedaban en `comercial.web_leads` y en el correo, y en
 * ninguna pantalla.
 */

/** Solo dígitos: wa.me no acepta espacios ni signos. */
function soloDigitos(tel: string): string {
  return tel.replace(/\D/g, "");
}

/**
 * Colombia sin indicativo. La web recoge el teléfono a mano y hay filas de 10 dígitos
 * que empiezan por 3 (`3138865707`) y otras que ya vienen completas (`573105385516`).
 * Sin esto, el enlace de WhatsApp de la mitad de los leads no abre ningún chat.
 */
function telefonoWhatsApp(tel: string): string {
  const d = soloDigitos(tel);
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  return d;
}

export default function LeadsPanel({ leads }: { leads: WebLead[] }) {
  const [verAtendidos, setVerAtendidos] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});

  const pendientes = useMemo(() => agruparLeads(leads.filter((l) => !l.atendido_at)), [leads]);
  const atendidos = useMemo(() => agruparLeads(leads.filter((l) => l.atendido_at)), [leads]);

  // Sin una sola fila en la tabla no hay nada que contar y el panel sobra.
  if (leads.length === 0) return null;

  const mostrados = verAtendidos ? atendidos : pendientes;

  function cerrar(g: GrupoLead, atendido: boolean) {
    setError(null);
    setBusy(g.lead.id);
    const nota = notas[g.lead.id];
    startTransition(async () => {
      const r = await marcarLeadAtendido(g.ids, atendido, nota);
      if (r?.error) setError(r.error);
      else setNotas((prev) => ({ ...prev, [g.lead.id]: "" }));
      setBusy(null);
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
        <Inbox size={16} className={pendientes.length ? "text-dorado-oscuro" : "text-muted"} />
        <div className="flex-1 min-w-[220px]">
          <h2 className="font-display text-lg text-bosque">
            Leads sin precio
            {pendientes.length > 0 && (
              <span className="ml-2 text-xs align-middle px-2 py-0.5 rounded-full bg-dorado-oscuro/15 text-dorado-oscuro font-semibold">
                {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Cotizaron en caminosacro.com y la web no pudo darles una cifra, así que no hay
            cotización: hay que escribirles.
          </p>
        </div>
        {atendidos.length > 0 && (
          <button
            type="button"
            onClick={() => setVerAtendidos((v) => !v)}
            aria-pressed={verAtendidos}
            className={`text-xs px-3 py-1.5 rounded-md border transition ${
              verAtendidos ? "border-bosque bg-bosque/5 text-bosque" : "border-border hover:bg-taupe/40"
            }`}
          >
            {verAtendidos ? `Ver pendientes (${pendientes.length})` : `Ver atendidos (${atendidos.length})`}
          </button>
        )}
      </header>

      {error && (
        <div role="alert" className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <ul className="divide-y divide-border">
        {mostrados.map((g) => {
          const l = g.lead;
          const anio = l.start_date.slice(0, 4);
          const ocupado = busy === l.id && pending;
          const wa = telefonoWhatsApp(l.phone);
          return (
            <li key={l.id} className={`px-4 py-3 ${ocupado ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="flex-1 min-w-[240px] space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{l.full_name}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded bg-dorado-oscuro/15 text-dorado-oscuro font-semibold uppercase tracking-wide"
                      title={MOTIVO_EXPLICACION[l.motivo] ?? ""}
                    >
                      {motivoLabel(l.motivo)}
                    </span>
                    {/* El mismo envío dos veces es un doble clic en el cotizador, no dos
                        personas: se cuenta, no se repite la línea. */}
                    {g.veces > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-taupe/60 text-muted font-semibold" title="Llegó la misma solicitud varias veces">
                        ×{g.veces}
                      </span>
                    )}
                    {l.email_sent === false && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-semibold" title="El acuse automático no salió: esta persona no recibió nada.">
                        <TriangleAlert size={11} /> Sin acuse
                      </span>
                    )}
                    {l.code && <span className="text-[11px] font-mono text-muted">{l.code}</span>}
                  </div>
                  <div className="text-sm text-muted">
                    {l.route_name || l.route_slug} · {tipoLabel(l.tipo)} · salida{" "}
                    <span className="text-fg">{fechaCortaISO(l.start_date)}</span> · {l.people}{" "}
                    {l.people === 1 ? "persona" : "personas"}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 text-bosque hover:underline">
                      <Mail size={12} /> {l.email}
                    </a>
                    {wa && (
                      <a
                        href={`https://wa.me/${wa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-bosque hover:underline"
                      >
                        <MessageCircle size={12} /> {l.phone}
                      </a>
                    )}
                    <span className="text-muted">{hace(l.created_at)}</span>
                    {!l.marketing_optin && (
                      <span className="text-muted" title="No aceptó marketing: escribirle solo por esta consulta.">
                        sin opt-in
                      </span>
                    )}
                  </div>
                  {l.atendido_at && (
                    <div className="text-xs text-muted">
                      Atendido {hace(l.atendido_at)}
                      {l.atendido_nota ? ` · ${l.atendido_nota}` : ""}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {/* El atajo que de verdad cierra un `sin_tarifas_ano`: cargar el año en
                      el catálogo hace que la web cotice sola la próxima. */}
                  {l.motivo === "sin_tarifas_ano" && !l.atendido_at && (
                    <Link
                      href={`/catalogo?year=${anio}`}
                      className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition whitespace-nowrap"
                    >
                      Cargar tarifas {anio}
                    </Link>
                  )}
                  {!l.atendido_at && (
                    <Link
                      href="/cotizaciones/nueva"
                      className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition whitespace-nowrap"
                    >
                      Cotizar a mano
                    </Link>
                  )}
                  {l.atendido_at ? (
                    <button
                      type="button"
                      onClick={() => cerrar(g, false)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 disabled:opacity-40 transition whitespace-nowrap"
                    >
                      <Undo2 size={13} /> Reabrir
                    </button>
                  ) : (
                    <>
                      <input
                        value={notas[l.id] ?? ""}
                        onChange={(e) => setNotas((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        placeholder="Nota (opcional)"
                        className="px-2 py-1.5 rounded-md border border-border bg-white text-xs w-[160px]"
                      />
                      <button
                        type="button"
                        onClick={() => cerrar(g, true)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio disabled:opacity-40 transition whitespace-nowrap"
                      >
                        <Check size={13} /> Atendido
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {mostrados.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            {verAtendidos ? "Ninguno atendido todavía." : "Ningún lead pendiente. Todos atendidos."}
          </li>
        )}
      </ul>
    </section>
  );
}
