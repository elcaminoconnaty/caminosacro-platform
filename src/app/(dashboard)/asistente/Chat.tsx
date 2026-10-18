"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Database, FileText, History, Mail, Plus, Sparkles, X } from "lucide-react";
import type { Uso } from "@/lib/asistente/agente";
import { cn } from "@/lib/cn";

export type Mensaje = {
  id: string;
  role: "user" | "assistant";
  content: string;
  herramientas: Uso[];
  error?: string | null;
  enCurso?: boolean;
};

type Conversacion = { id: string; titulo: string; fecha: string };

const SUGERENCIAS = [
  "¿Qué viajes salen en los próximos 60 días y qué les falta?",
  "¿Quién nos debe plata y cuánto?",
  "¿Qué fue lo último que nos escribió Pilgrim y quedó algo pendiente?",
  "¿Qué cotizaciones se enviaron este mes y cuáles siguen sin respuesta?",
  "Resúmeme el contrato firmado y los pagos de la última cotización aceptada",
];

/** Etiqueta corta de cada herramienta para la línea "Usé: …". */
const ETIQUETA: Record<string, { texto: string; icono: typeof Database }> = {
  consultar: { texto: "consulta a la base", icono: Database },
  documentos: { texto: "lista de documentos", icono: FileText },
  leer_documento: { texto: "documento", icono: FileText },
  buscar_correos_reservas: { texto: "búsqueda en reservas@", icono: Mail },
  leer_correo_reservas: { texto: "correo de reservas@", icono: Mail },
  leer_adjunto_reservas: { texto: "adjunto de reservas@", icono: FileText },
  buscar_gmail_ecn: { texto: "búsqueda en Gmail ECN", icono: Mail },
  leer_gmail_ecn: { texto: "correo de Gmail ECN", icono: Mail },
  leer_adjunto_gmail_ecn: { texto: "adjunto de Gmail ECN", icono: FileText },
};

/**
 * El chat del asistente. Lee la respuesta en vivo de `/api/asistente` (NDJSON) y la va
 * pintando. El scroll es el de la página, no uno interno: en el iPhone, con el teclado
 * abierto, un contenedor con scroll propio se queda trabado detrás del teclado.
 */
export function Chat({
  conversacionId,
  mensajesIniciales,
  conversaciones,
  aviso,
  correos,
}: {
  conversacionId: string | null;
  mensajesIniciales: Mensaje[];
  conversaciones: Conversacion[];
  aviso: string | null;
  correos: { reservas: boolean; gmailEcn: boolean };
}) {
  const router = useRouter();
  const [mensajes, setMensajes] = React.useState<Mensaje[]>(mensajesIniciales);
  const [texto, setTexto] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  const [verHistorial, setVerHistorial] = React.useState(false);
  const conv = React.useRef<string | null>(conversacionId);
  const final = React.useRef<HTMLDivElement>(null);
  const campo = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (mensajes.length) final.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensajes]);

  // El campo crece con el texto, hasta ~6 renglones.
  React.useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  async function enviar(pregunta: string) {
    pregunta = pregunta.trim();
    if (!pregunta || ocupado) return;
    setTexto("");
    setOcupado(true);
    const idRespuesta = `r-${Date.now()}`;
    setMensajes((m) => [
      ...m,
      { id: `p-${Date.now()}`, role: "user", content: pregunta, herramientas: [] },
      { id: idRespuesta, role: "assistant", content: "", herramientas: [], enCurso: true },
    ]);
    const actualizar = (f: (m: Mensaje) => Mensaje) => setMensajes((ms) => ms.map((m) => (m.id === idRespuesta ? f(m) : m)));

    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacionId: conv.current, pregunta }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `Error ${res.status}`);

      const lector = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lineas = buffer.split("\n");
        buffer = lineas.pop() ?? "";
        for (const linea of lineas) {
          if (!linea.trim()) continue;
          const ev = JSON.parse(linea);
          if (ev.t === "conversacion" && !conv.current) {
            conv.current = ev.id;
            // La URL queda con la conversación, sin recargar la página.
            window.history.replaceState(null, "", `/asistente?c=${ev.id}`);
          } else if (ev.t === "texto") actualizar((m) => ({ ...m, content: m.content + ev.d }));
          else if (ev.t === "herramienta") actualizar((m) => ({ ...m, herramientas: [...m.herramientas, { nombre: ev.nombre, detalle: ev.detalle }] }));
          else if (ev.t === "error") actualizar((m) => ({ ...m, error: ev.mensaje }));
        }
      }
    } catch (e) {
      actualizar((m) => ({ ...m, error: e instanceof Error ? e.message : "No pude conectar con el asistente." }));
    } finally {
      actualizar((m) => ({ ...m, enCurso: false }));
      setOcupado(false);
      router.refresh(); // el historial de conversaciones
    }
  }

  function nueva() {
    conv.current = null;
    setMensajes([]);
    setVerHistorial(false);
    router.push("/asistente");
  }

  const fuentes = [
    "la plataforma",
    "los PDF guardados",
    correos.reservas && "reservas@caminosacro.com",
    correos.gmailEcn && "el Gmail de El Camino con Naty",
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-3xl flex flex-col min-h-[calc(100dvh-12rem)] md:min-h-[calc(100dvh-10rem)]">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-5 w-5 text-dorado-oscuro shrink-0" />
          <h1 className="font-display text-2xl text-bosque truncate">Asistente</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setVerHistorial((v) => !v)}
            className="h-10 px-3 rounded-md hover:bg-taupe/40 flex items-center gap-1.5 text-sm text-bosque"
            aria-expanded={verHistorial}
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Conversaciones</span>
          </button>
          <button onClick={nueva} className="h-10 px-3 rounded-md hover:bg-taupe/40 flex items-center gap-1.5 text-sm text-bosque">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nueva</span>
          </button>
        </div>
      </div>

      {verHistorial && (
        <div className="mb-4 rounded-lg border border-border bg-bg-card">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="text-sm font-medium">Tus conversaciones</span>
            <button onClick={() => setVerHistorial(false)} className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-taupe/40" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          {conversaciones.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Todavía no hay ninguna.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-border">
              {conversaciones.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/asistente?c=${c.id}`}
                    onClick={() => setVerHistorial(false)}
                    className={cn("block px-4 py-3 text-sm hover:bg-taupe/30", c.id === conv.current && "bg-taupe/40")}
                  >
                    <div className="truncate">{c.titulo}</div>
                    <div className="text-xs text-muted">{new Date(c.fecha).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aviso && <div className="mb-4 rounded-lg border border-dorado bg-dorado/15 px-4 py-3 text-sm text-tinta">{aviso}</div>}

      <div className="flex-1 space-y-5 pb-4">
        {mensajes.length === 0 ? (
          <div className="pt-4">
            <p className="text-muted mb-4">
              Pregúntame lo que necesites de Camino Sacro. Leo en vivo {fuentes.slice(0, -1).join(", ")} y {fuentes.at(-1)}, incluidos los
              PDF adjuntos. Solo leo: no envío ni cambio nada.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  disabled={ocupado || !!aviso}
                  className="text-left text-sm rounded-xl border border-border bg-bg-card px-4 py-3 hover:bg-taupe/30 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          mensajes.map((m) => <Burbuja key={m.id} m={m} />)
        )}
        <div ref={final} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:bottom-4 z-20 mt-2"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-bg-card p-2 shadow-sm">
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía en computador; en el celular el Enter es salto de línea.
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                enviar(texto);
              }
            }}
            rows={1}
            placeholder="Escribe tu pregunta…"
            className="flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted"
            disabled={!!aviso}
          />
          <button
            type="submit"
            disabled={ocupado || !texto.trim() || !!aviso}
            className="h-10 w-10 shrink-0 rounded-full bg-bosque text-white flex items-center justify-center disabled:opacity-40"
            aria-label="Enviar"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Burbuja({ m }: { m: Mensaje }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-bosque text-white px-4 py-2.5 whitespace-pre-wrap text-[15px]">{m.content}</div>
      </div>
    );
  }
  const ultima = m.herramientas.at(-1);
  return (
    <div className="space-y-2">
      {m.herramientas.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer inline-flex items-center gap-1.5 select-none">
            <Database className="h-3.5 w-3.5" />
            {m.enCurso && !m.content && ultima
              ? `Revisando ${ETIQUETA[ultima.nombre]?.texto ?? ultima.nombre}…`
              : `Revisé ${m.herramientas.length} fuente${m.herramientas.length === 1 ? "" : "s"}`}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {m.herramientas.map((h, i) => {
              const e = ETIQUETA[h.nombre];
              const Icono = e?.icono ?? Database;
              return (
                <li key={i} className="flex gap-1.5">
                  <Icono className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium">{e?.texto ?? h.nombre}</span>
                    {h.nombre === "consultar" ? (
                      <pre className="mt-1 overflow-x-auto rounded-md bg-taupe/40 p-2 text-[11px] leading-snug">{h.detalle}</pre>
                    ) : (
                      <span className="break-all"> · {h.detalle}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {m.content ? (
        <div className="prose-asistente text-[15px] leading-relaxed text-tinta">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) =>
                href?.startsWith("/") ? (
                  <Link href={href} className="text-bosque-medio underline underline-offset-2">{children}</Link>
                ) : (
                  <a href={href} target="_blank" rel="noreferrer" className="text-bosque-medio underline underline-offset-2">{children}</a>
                ),
              table: ({ children }) => (
                <div className="my-3 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">{children}</table>
                </div>
              ),
            }}
          >
            {m.content}
          </ReactMarkdown>
        </div>
      ) : m.enCurso && m.herramientas.length === 0 ? (
        <div className="flex gap-1 py-2" aria-label="Pensando">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-taupe animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      ) : null}
      {m.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{m.error}</div>}
    </div>
  );
}
