"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Inbox, Mail, MessageCircle, Send, TriangleAlert, Undo2 } from "lucide-react";
import { fechaCortaISO, hace } from "@/lib/format";
import {
  agruparLeads,
  motivoLabel,
  tipoLabel,
  MOTIVO_EXPLICACION,
  type GrupoLead,
  type WebLead,
} from "@/lib/leads/webLeads";
import type { SolicitudPrecio } from "@/lib/leads/solicitudPrecio";
import { enviarSolicitudPrecioPilgrim, marcarLeadAtendido } from "./leadsActions";

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

export default function LeadsPanel({
  leads,
  borradores,
  pilgrimEmail,
}: {
  leads: WebLead[];
  /** Borrador del correo a Pilgrim por lead pendiente, armado en el servidor. */
  borradores: Record<string, SolicitudPrecio>;
  pilgrimEmail: string;
}) {
  // Qué se está mirando. Nace en "pendientes" porque el panel contesta "¿a quién le
  // debo algo?", pero las tres opciones se pintan SIEMPRE, con su cuenta: con un solo
  // interruptor, cerrar el último lead dejaba la lista vacía y la única forma de volver
  // a ver a alguien era descubrir un botón que hasta entonces no estaba. Un lead
  // desaparecido de la pantalla es exactamente lo que este panel vino a arreglar.
  const [filtro, setFiltro] = useState<"pendientes" | "atendidos" | "todos">("pendientes");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});

  // Borrador de Pilgrim abierto, y el texto que se está editando. Se guardan por lead
  // para no perder lo escrito al plegar y volver a abrir.
  const [abierto, setAbierto] = useState<string | null>(null);
  const [textos, setTextos] = useState<Record<string, SolicitudPrecio>>({});
  const [resultados, setResultados] = useState<Record<string, { ok: boolean; texto: string }>>({});
  const [modoPrueba, setModoPrueba] = useState(false);
  const [emailPrueba, setEmailPrueba] = useState("");

  const pendientes = useMemo(() => agruparLeads(leads.filter((l) => !l.atendido_at)), [leads]);
  const atendidos = useMemo(() => agruparLeads(leads.filter((l) => l.atendido_at)), [leads]);
  const todos = useMemo(() => agruparLeads(leads), [leads]);

  // Sin una sola fila en la tabla no hay nada que contar y el panel sobra.
  if (leads.length === 0) return null;

  const mostrados = filtro === "atendidos" ? atendidos : filtro === "todos" ? todos : pendientes;

  function textoDe(id: string): SolicitudPrecio {
    return textos[id] ?? borradores[id] ?? { subject: "", body: "" };
  }

  function editar(id: string, campo: keyof SolicitudPrecio, valor: string) {
    setTextos((prev) => ({ ...prev, [id]: { ...textoDe(id), [campo]: valor } }));
  }

  function pedirPrecio(id: string) {
    const prueba = modoPrueba ? emailPrueba.trim() : "";
    if (modoPrueba && !prueba) {
      setResultados((p) => ({ ...p, [id]: { ok: false, texto: "Escribe el correo de prueba." } }));
      return;
    }
    setResultados((p) => ({ ...p, [id]: { ok: true, texto: "Enviando…" } }));
    setBusy(id);
    startTransition(async () => {
      const { subject, body } = textoDe(id);
      const r = await enviarSolicitudPrecioPilgrim(id, { subject, body, pruebaEmail: prueba || null });
      setResultados((p) => ({
        ...p,
        [id]: r.ok
          ? {
              ok: true,
              // "Enviado" solo con el id del proveedor. Sin eso lo único cierto es que
              // se encoló, y darlo por enviado fue como se perdieron tres solicitudes.
              texto: r.confirmado
                ? `✓ Enviado a ${r.email}${prueba ? " (prueba)" : ""}`
                : `⏳ En cola para ${r.email} — el proveedor todavía no lo confirmó.`,
            }
          : { ok: false, texto: r.error ?? "No se pudo enviar el correo." },
      }));
      setBusy(null);
    });
  }

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
        {/* Siempre los tres, siempre con su cuenta. Mismo gesto que los filtros de estado
            de la tabla de cotizaciones, y ninguno se esconde cuando su lista queda vacía. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ["pendientes", "Pendientes", pendientes.length],
            ["atendidos", "Atendidos", atendidos.length],
            ["todos", "Todos", todos.length],
          ] as const).map(([clave, etiqueta, cuantos]) => {
            const activo = filtro === clave;
            return (
              <button
                key={clave}
                type="button"
                onClick={() => setFiltro(clave)}
                aria-pressed={activo}
                className={`text-xs px-3 py-1.5 rounded-md border transition ${
                  activo ? "border-bosque bg-bosque/5 text-bosque font-medium" : "border-border hover:bg-taupe/40"
                }`}
              >
                {etiqueta} ({cuantos})
              </button>
            );
          })}
        </div>
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
                    {l.precio_solicitado_at && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-bosque/10 text-bosque font-semibold"
                        title="Ya se le pidió el precio a Pilgrim"
                      >
                        <Send size={10} /> precio pedido {hace(l.precio_solicitado_at)}
                      </span>
                    )}
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
                  {!l.atendido_at && borradores[l.id] && (
                    <button
                      type="button"
                      onClick={() => setAbierto((a) => (a === l.id ? null : l.id))}
                      aria-expanded={abierto === l.id}
                      className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border transition whitespace-nowrap ${
                        abierto === l.id
                          ? "border-bosque bg-bosque/5 text-bosque"
                          : "border-border hover:bg-taupe/40"
                      }`}
                    >
                      <Send size={13} />
                      {l.precio_solicitado_at ? "Volver a pedir precio" : "Pedir precio a Pilgrim"}
                    </button>
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

              {/* Borrador de la solicitud de precio a Pilgrim. Se pliega: en pantalla
                  puede haber varios leads y abrirlos todos sería ilegible. */}
              {abierto === l.id && borradores[l.id] && (
                <div className="mt-3 rounded-lg border border-border bg-taupe/20 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">
                      Para{" "}
                      <span className="font-medium text-fg">
                        {modoPrueba ? emailPrueba.trim() || "—" : pilgrimEmail || "—"}
                      </span>
                      {" · "}
                      {/* Lo que este correo NO lleva es la mitad del encargo, así que se
                          dice en pantalla y no solo en el código. */}
                      <span title="El correo y el teléfono del peregrino no salen de la plataforma.">
                        sin el contacto del peregrino
                      </span>
                    </p>
                    <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={modoPrueba}
                        onChange={(e) => setModoPrueba(e.target.checked)}
                        className="rounded border-border"
                      />
                      Probar a otra dirección
                    </label>
                  </div>

                  {modoPrueba && (
                    <input
                      value={emailPrueba}
                      onChange={(e) => setEmailPrueba(e.target.value)}
                      placeholder="correo de prueba"
                      className="w-full px-2 py-1.5 rounded-md border border-border bg-white text-xs"
                    />
                  )}

                  <input
                    value={textoDe(l.id).subject}
                    onChange={(e) => editar(l.id, "subject", e.target.value)}
                    className="w-full px-2 py-1.5 rounded-md border border-border bg-white text-xs font-medium"
                    aria-label="Asunto del correo a Pilgrim"
                  />
                  <textarea
                    value={textoDe(l.id).body}
                    onChange={(e) => editar(l.id, "body", e.target.value)}
                    rows={16}
                    className="w-full px-2 py-2 rounded-md border border-border bg-white text-xs font-mono leading-relaxed"
                    aria-label="Cuerpo del correo a Pilgrim"
                  />

                  {resultados[l.id] && (
                    <p
                      role="status"
                      className={`text-xs ${resultados[l.id].ok ? "text-bosque" : "text-red-700"}`}
                    >
                      {resultados[l.id].texto}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAbierto(null)}
                      className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
                    >
                      Cerrar
                    </button>
                    <button
                      type="button"
                      onClick={() => pedirPrecio(l.id)}
                      disabled={pending || (!modoPrueba && !pilgrimEmail)}
                      title={
                        !modoPrueba && !pilgrimEmail
                          ? "Falta el correo de Pilgrim en Configuración → Proveedor Pilgrim"
                          : undefined
                      }
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <Send size={13} />
                      {ocupado ? "Enviando…" : modoPrueba ? "Enviar prueba" : "Enviar a Pilgrim"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {mostrados.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            {filtro === "atendidos" ? (
              "Ninguno atendido todavía."
            ) : atendidos.length > 0 ? (
              <>
                Ningún lead pendiente:{" "}
                <button
                  type="button"
                  onClick={() => setFiltro("atendidos")}
                  className="text-bosque underline hover:no-underline"
                >
                  {atendidos.length === 1 ? "el que hay ya lo cerraste" : `los ${atendidos.length} que hay ya los cerraste`}
                </button>
                . Desde ahí se pueden reabrir.
              </>
            ) : (
              "Ningún lead pendiente."
            )}
          </li>
        )}
      </ul>
    </section>
  );
}
