"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Campo "comprobante" de los formularios de pago (cliente y Pilgrim). Manda el archivo en
 * `comprobante` y, si se pide quitar el que había, `quitar_comprobante=1`; lo resuelve
 * `comprobanteDe` en ./actions.ts.
 *
 * Pegar un pantallazo con ⌘V en cualquier parte del formulario lo adjunta: es lo normal
 * después de pagar en la web del banco o de recibir la captura por WhatsApp.
 */
export default function ComprobanteField({ tiene }: { tiene: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [quitar, setQuitar] = useState(false);

  useEffect(() => {
    const form = fileRef.current?.form;
    if (!form) return;
    function onPaste(e: ClipboardEvent) {
      const img = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!img || !fileRef.current) return;
      e.preventDefault();
      const ext = img.type.split("/")[1] || "png";
      const nombrado = new File([img], `comprobante-${new Date().toISOString().slice(0, 10)}.${ext}`, { type: img.type });
      const dt = new DataTransfer();
      dt.items.add(nombrado);
      fileRef.current.files = dt.files;
      setArchivo(nombrado.name);
      setQuitar(false);
    }
    form.addEventListener("paste", onPaste);
    return () => form.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div className="col-span-2">
      <span className="text-xs text-muted">Comprobante de pago (pantallazo o PDF)</span>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <label className="px-3 py-1.5 rounded-md border border-border bg-white text-xs cursor-pointer hover:bg-taupe/40">
          {tiene ? "Reemplazar archivo…" : "Elegir archivo…"}
          <input
            ref={fileRef}
            name="comprobante"
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => { setArchivo(e.target.files?.[0]?.name ?? null); setQuitar(false); }}
          />
        </label>
        <span className="text-xs text-muted">
          {archivo ? `📎 ${archivo}` : tiene && !quitar ? "Ya tiene comprobante" : "o pega el pantallazo aquí con ⌘V"}
        </span>
        {tiene && !archivo && (
          <button type="button" onClick={() => setQuitar((q) => !q)} className="text-[10px] text-muted hover:text-red-700">
            {quitar ? "no quitar" : "quitar comprobante"}
          </button>
        )}
      </div>
      {quitar && <input type="hidden" name="quitar_comprobante" value="1" />}
    </div>
  );
}
