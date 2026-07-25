"use client";

import { useState, useTransition } from "react";
import { enviarCorreoCotizacion } from "./actions";

// Fecha del último envío, siempre en hora de Bogotá para que servidor y cliente
// rendericen lo mismo.
function fechaEnvio(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

export default function EmailPreviewCard({
  quoteId,
  to,
  subject: subjectInicial,
  body: bodyInicial,
  emailSentAt,
}: {
  quoteId: string;
  to: string;
  subject: string;
  body: string;
  emailSentAt?: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [subject, setSubject] = useState(subjectInicial);
  const [body, setBody] = useState(bodyInicial);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, startEnvio] = useTransition();

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
    startEnvio(async () => {
      const r = await enviarCorreoCotizacion(quoteId, { subject, body });
      setResultado(
        r.ok
          ? { ok: true, texto: `✓ Enviado a ${r.email}` }
          : { ok: false, texto: r.error ?? "No se pudo enviar el correo." },
      );
    });
  }

  const all = `Para: ${to}\nAsunto: ${subject}\n\n${body}`;

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">Correo para el cliente</h2>
          <p className="text-xs text-muted mt-0.5">
            Sale desde reservas@caminosacro.com con la cotización adjunta.
            {emailSentAt ? ` Último envío: ${fechaEnvio(emailSentAt)}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => copy("asunto", subject)} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
            {copied === "asunto" ? "✓ Copiado" : "Copiar asunto"}
          </button>
          <button onClick={() => copy("cuerpo", body)} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
            {copied === "cuerpo" ? "✓ Copiado" : "Copiar cuerpo"}
          </button>
          <button onClick={() => copy("todo", all)} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
            {copied === "todo" ? "✓ Copiado" : "Copiar todo"}
          </button>
          <button
            onClick={enviar}
            disabled={!to || enviando}
            title={to ? undefined : "La cotización no tiene correo del cliente"}
            className="text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enviando ? "Enviando…" : "Enviar correo"}
          </button>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3 text-sm">
        <div>
          <div className="text-xs text-muted mb-0.5">Para</div>
          <div className="font-mono text-xs">{to || <span className="text-muted italic">Sin email del cliente</span>}</div>
        </div>
        <div>
          <label className="text-xs text-muted mb-0.5 block" htmlFor="correo-asunto">Asunto</label>
          <input
            id="correo-asunto"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full font-medium bg-crema border border-border rounded-md px-3 py-2 focus:outline-none focus:border-bosque"
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-0.5 block" htmlFor="correo-cuerpo">Cuerpo</label>
          <textarea
            id="correo-cuerpo"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className="w-full font-sans bg-crema border border-border rounded-md p-3 text-sm leading-relaxed focus:outline-none focus:border-bosque resize-y"
          />
          <p className="text-xs text-muted mt-1">
            Lo que quede aquí es exactamente lo que recibe el cliente. Se envía con
            <span className="font-mono"> Cotizacion-{"{código}"}.pdf</span> adjunto.
          </p>
        </div>
        {resultado && (
          <p className={`text-sm ${resultado.ok ? "text-bosque" : "text-red-600"}`}>{resultado.texto}</p>
        )}
      </div>
    </section>
  );
}
