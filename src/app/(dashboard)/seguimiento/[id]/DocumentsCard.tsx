"use client";

import { useState, useTransition, useRef } from "react";
import { generateQuotePdf, getSignedUrl, uploadQuotePdf } from "./actions";

export default function DocumentsCard({
  quoteId,
  storagePath,
  filename,
}: {
  quoteId: string;
  storagePath: string | null;
  filename: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function open() {
    if (!storagePath) return;
    setError(null);
    startTransition(async () => {
      const r = await getSignedUrl(storagePath);
      if (r.url) window.open(r.url, "_blank");
      else if (r.error) setError(r.error);
    });
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await uploadQuotePdf(quoteId, fd);
      if (r?.error) setError(r.error);
      else {
        setUploadOpen(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  async function onGenerate() {
    setError(null);
    startTransition(async () => {
      const r = await generateQuotePdf(quoteId);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg text-bosque">PDF de la cotización</h2>
          <p className="text-xs text-muted mt-0.5">
            {storagePath ? "Archivo en Supabase Storage. Vínculo con expiración de 10 min." : "Aún no hay PDF asociado."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {storagePath && (
            <button
              onClick={open}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
            >
              Ver / Descargar
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
          >
            {pending ? "Generando…" : storagePath ? "Regenerar PDF" : "Generar PDF"}
          </button>
          <button
            onClick={() => setUploadOpen((o) => !o)}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
          >
            {uploadOpen ? "Cancelar" : "Subir manual"}
          </button>
        </div>
      </div>

      {filename && !uploadOpen && (
        <div className="px-5 py-3 border-b border-border text-xs font-mono text-muted truncate">
          {filename}
        </div>
      )}

      {uploadOpen && (
        <form onSubmit={onUpload} className="px-5 py-4 bg-taupe/20 flex items-center gap-3 text-sm">
          <input
            ref={fileRef}
            name="file"
            type="file"
            accept="application/pdf"
            required
            className="text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-bosque file:text-white file:cursor-pointer file:hover:bg-bosque-medio"
          />
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1.5 rounded-md bg-bosque text-white text-xs font-medium hover:bg-bosque-medio disabled:opacity-50"
          >
            {pending ? "Subiendo…" : "Subir"}
          </button>
        </form>
      )}

      {error && (
        <div role="alert" className="px-5 py-2 text-sm text-red-700 bg-red-50 border-t border-red-200">{error}</div>
      )}
    </section>
  );
}
