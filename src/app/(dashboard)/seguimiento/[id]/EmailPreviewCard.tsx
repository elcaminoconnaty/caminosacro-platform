"use client";

import { useState } from "react";

export default function EmailPreviewCard({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {
      alert("No pude copiar al portapapeles: " + (e as Error).message);
    }
  }

  const all = `Para: ${to}\nAsunto: ${subject}\n\n${body}`;
  const gmailHref = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">Correo para el cliente</h2>
          <p className="text-xs text-muted mt-0.5">Plantilla cotizacion_enviada con TRM y total del día. Editable en Configuración.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => copy("asunto", subject)} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
            {copied === "asunto" ? "✓ Copiado" : "Copiar asunto"}
          </button>
          <button onClick={() => copy("cuerpo", body)} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
            {copied === "cuerpo" ? "✓ Copiado" : "Copiar cuerpo"}
          </button>
          <button onClick={() => copy("todo", all)} className="text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition">
            {copied === "todo" ? "✓ Copiado" : "Copiar todo"}
          </button>
          {to && (
            <a
              href={gmailHref}
              target="_blank"
              rel="noopener"
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
            >
              Abrir en Gmail
            </a>
          )}
        </div>
      </div>
      <div className="px-5 py-4 space-y-3 text-sm">
        <div>
          <div className="text-xs text-muted mb-0.5">Para</div>
          <div className="font-mono text-xs">{to || <span className="text-muted italic">Sin email del cliente</span>}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-0.5">Asunto</div>
          <div className="font-medium">{subject}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-0.5">Cuerpo</div>
          <pre className="font-sans whitespace-pre-wrap bg-crema border border-border rounded-md p-3 text-sm leading-relaxed">{body}</pre>
        </div>
      </div>
    </section>
  );
}
