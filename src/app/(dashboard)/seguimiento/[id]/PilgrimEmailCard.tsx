"use client";

// Card "Correo a Pilgrim": el detalle de la reserva a SUS precios, con los pasaportes
// de los viajeros adjuntos, pidiendo el link de pago. Mismo patrón que la tarjeta del
// correo al cliente: asunto y cuerpo editables antes de enviar.

import { useState, useTransition } from "react";
import { enviarCorreoPilgrim } from "./actions";
import { savePilgrimRef } from "./travelDocActions";
import { aplicarReferenciaPilgrim } from "@/lib/quotes/pilgrimRef";

function fechaEnvio(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

export default function PilgrimEmailCard({
  quoteId,
  to,
  sentAt,
  subject: subjectInicial,
  body: bodyInicial,
  adjuntos,
  pendientes,
  pilgrimRef = null,
}: {
  /** Referencia de reserva de Pilgrim (quotes.pilgrim_ref): la misma de la documentación de viaje. */
  pilgrimRef?: string | null;
  quoteId: string;
  to: string;
  sentAt?: string | null;
  subject: string;
  body: string;
  adjuntos: { nombre: string; viajero: string }[];
  pendientes: string[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [subject, setSubject] = useState(subjectInicial);
  const [body, setBody] = useState(bodyInicial);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, startEnvio] = useTransition();
  const [referencia, setReferencia] = useState(pilgrimRef ?? "");
  const [refGuardada, setRefGuardada] = useState(pilgrimRef ?? "");
  const [guardandoRef, startRef] = useTransition();
  const [avisoRef, setAvisoRef] = useState<{ ok: boolean; texto: string } | null>(null);

  /**
   * Guarda la referencia (es el mismo dato que sale en la documentación de viaje) y la
   * pone en el asunto y en los datos del correo, respetando lo que ya se haya editado.
   */
  function guardarReferencia() {
    setAvisoRef(null);
    const ref = referencia.trim();
    startRef(async () => {
      const r = await savePilgrimRef(quoteId, ref || null);
      if (r.error) {
        setAvisoRef({ ok: false, texto: r.error });
        return;
      }
      const nuevo = aplicarReferenciaPilgrim(subject, body, ref);
      setSubject(nuevo.subject);
      setBody(nuevo.body);
      setRefGuardada(ref);
      setAvisoRef({
        ok: true,
        texto: ref ? "✓ Guardada: ya va en el asunto y en los datos del viaje." : "✓ Referencia quitada del correo.",
      });
    });
  }

  // Modo prueba: el correo va a la dirección indicada en vez de a Pilgrim, y no
  // marca la cotización como ya enviada. Permite ensayar con 1, 2, 3 o 20 viajeros.
  const [modoPrueba, setModoPrueba] = useState(false);
  const [emailPrueba, setEmailPrueba] = useState("");

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {
      alert("No pude copiar al portapapeles: " + (e as Error).message);
    }
  }

  function enviar() {
    setResultado(null);
    const prueba = modoPrueba ? emailPrueba.trim() : "";
    if (modoPrueba && !prueba) {
      setResultado({ ok: false, texto: "Escribe el correo de prueba." });
      return;
    }
    startEnvio(async () => {
      const r = await enviarCorreoPilgrim(quoteId, { subject, body, pruebaEmail: prueba || null });
      // "Enviado" solo si el proveedor devolvió el id del mensaje. Sin eso, lo
      // único cierto es que la petición se encoló: decir "✓ Enviado" ahí fue como
      // se dieron por buenas tres solicitudes a Pilgrim que nunca llegaron.
      const detalle = `${r.email}${modoPrueba ? " (prueba)" : ""} con ${r.adjuntos ?? 0} pasaporte(s) adjunto(s)`;
      setResultado(
        r.ok
          ? {
              ok: true,
              texto: r.confirmado
                ? `✓ Enviado a ${detalle}`
                : `⏳ En cola para ${detalle} — el proveedor todavía no confirmó el envío. Revisa el panel de Brevo si es urgente.`,
            }
          : { ok: false, texto: r.error ?? "No se pudo enviar el correo." },
      );
    });
  }

  const destinoVisible = modoPrueba ? emailPrueba.trim() || "—" : to;
  const puedeEnviar = modoPrueba ? !!emailPrueba.trim() : !!to;

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">Correo a Pilgrim</h2>
          <p className="text-xs text-muted mt-0.5">
            La reserva a precios de ellos, con los pasaportes adjuntos, pidiendo el link de pago.
            {sentAt ? ` Último envío: ${fechaEnvio(sentAt)}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => copy("cuerpo", body)} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
            {copied === "cuerpo" ? "✓ Copiado" : "Copiar cuerpo"}
          </button>
          <button
            onClick={enviar}
            disabled={!puedeEnviar || enviando}
            title={puedeEnviar ? undefined : "Configura el correo de Pilgrim en Configuración"}
            className="text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enviando ? "Enviando…" : modoPrueba ? "Enviar prueba" : "Enviar a Pilgrim"}
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs bg-taupe/30 border border-border rounded-lg px-3 py-2">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={modoPrueba}
              onChange={(e) => setModoPrueba(e.target.checked)}
              className="rounded border-border"
            />
            <span>Enviar como prueba a…</span>
          </label>
          <input
            value={emailPrueba}
            onChange={(e) => setEmailPrueba(e.target.value)}
            disabled={!modoPrueba}
            placeholder="tucorreo@gmail.com"
            type="email"
            className="border border-border rounded-md px-2 py-1 bg-white disabled:opacity-40 min-w-[14rem]"
          />
          {modoPrueba && (
            <span className="text-muted">Mismo contenido y adjuntos; no marca la cotización como enviada.</span>
          )}
        </div>

        <div>
          <div className="text-xs text-muted mb-0.5">Para</div>
          <div className="font-mono text-xs">
            {destinoVisible || <span className="text-amber-700 font-sans italic">Sin correo de Pilgrim — configúralo en Configuración</span>}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted mb-0.5 block" htmlFor="pilgrim-ref">
            Referencia de reserva de Pilgrim
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="pilgrim-ref"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="ej. 47397"
              className="w-40 font-mono bg-crema border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-bosque"
            />
            <button
              type="button"
              onClick={guardarReferencia}
              disabled={guardandoRef || referencia.trim() === refGuardada.trim()}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
            >
              {guardandoRef ? "Guardando…" : "Guardar referencia"}
            </button>
            {avisoRef && (
              <span className={`text-xs ${avisoRef.ok ? "text-bosque" : "text-red-600"}`}>{avisoRef.texto}</span>
            )}
          </div>
          <p className="text-xs text-muted mt-1">
            El número con el que Pilgrim identifica la reserva. Es el mismo de la documentación de viaje: cambiarlo aquí
            lo cambia allá.
          </p>
        </div>

        <div>
          <label className="text-xs text-muted mb-0.5 block" htmlFor="pilgrim-asunto">Asunto</label>
          <input
            id="pilgrim-asunto"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full font-medium bg-crema border border-border rounded-md px-3 py-2 focus:outline-none focus:border-bosque"
          />
        </div>

        <div>
          <label className="text-xs text-muted mb-0.5 block" htmlFor="pilgrim-cuerpo">Cuerpo</label>
          <textarea
            id="pilgrim-cuerpo"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={22}
            className="w-full font-mono bg-crema border border-border rounded-md p-3 text-xs leading-relaxed focus:outline-none focus:border-bosque resize-y"
          />
          <p className="text-xs text-muted mt-1">
            Lo que quede aquí es exactamente lo que recibe Pilgrim. El TOTAL A PAGAR es el mismo número del
            KPI «Costo Pilgrim» de arriba.
          </p>
        </div>

        <div>
          <div className="text-xs text-muted mb-1">Adjuntos ({adjuntos.length})</div>
          {adjuntos.length === 0 ? (
            <p className="text-xs text-muted italic">
              Ningún viajero ha firmado todavía, así que no hay pasaportes que adjuntar.
            </p>
          ) : (
            <ul className="text-xs space-y-0.5">
              {adjuntos.map((a) => (
                <li key={a.nombre} className="font-mono text-muted">
                  {a.nombre} <span className="font-sans">— {a.viajero}</span>
                </li>
              ))}
            </ul>
          )}
          {pendientes.length > 0 && (
            <p className="text-xs text-amber-700 mt-1.5">
              Sin pasaporte todavía: {pendientes.join(", ")}. Puedes enviar igual, pero tendrás que
              mandárselos después.
            </p>
          )}
        </div>

        {resultado && (
          <p className={`text-sm ${resultado.ok ? "text-bosque" : "text-red-600"}`}>{resultado.texto}</p>
        )}
      </div>
    </section>
  );
}
