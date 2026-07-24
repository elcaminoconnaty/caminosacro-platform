"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOrgSignature, clearOrgSignature } from "./actions";

export default function OrgSignatureForm({ current }: { current: string | null }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const c = canvasRef.current!;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a2a3a";
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) setDataUrl(canvasRef.current!.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
    setDataUrl(null);
  }

  function guardar() {
    if (!dataUrl) {
      setError("Dibuja tu firma primero.");
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await saveOrgSignature(dataUrl);
      if (r.error) setError(r.error);
      else {
        setInfo("Firma guardada. Se usará en todos los contratos que firmen tus peregrinos.");
        clear();
        router.refresh();
      }
    });
  }

  function borrar() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await clearOrgSignature();
      if (r.error) setError(r.error);
      else {
        setInfo("Firma eliminada. Los próximos contratos usarán la firma mecánica hasta que guardes una nueva.");
        router.refresh();
      }
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden max-w-xl">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="font-display text-lg text-bosque">Mi firma (EL ORGANIZADOR)</h2>
        <p className="text-xs text-muted mt-0.5">
          Dibújala una sola vez —idealmente desde el celular— y se estampará automáticamente en cada contrato que
          firmen tus peregrinos. Válida bajo la Ley 527 de 1999.
        </p>
      </div>

      {current && (
        <div className="px-5 py-3 border-b border-border flex items-center gap-4">
          <span className="text-xs text-muted">Firma actual:</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current} alt="Firma guardada" className="h-12 object-contain" />
        </div>
      )}

      <div className="px-5 py-4 space-y-3">
        <canvas
          ref={canvasRef}
          width={560}
          height={170}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="w-full h-40 border border-dashed border-border rounded-lg bg-crema/50 touch-none cursor-crosshair"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={guardar}
            disabled={pending}
            className="text-xs px-3.5 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50 font-medium"
          >
            {pending ? "Guardando…" : current ? "Reemplazar firma" : "Guardar firma"}
          </button>
          <button
            onClick={clear}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
          >
            Borrar trazo
          </button>
          {current && (
            <button
              onClick={borrar}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50 transition disabled:opacity-50 ml-auto"
            >
              Eliminar firma guardada
            </button>
          )}
        </div>
        {info && <div className="text-sm text-bosque bg-taupe/30 rounded-md px-3 py-2">{info}</div>}
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      </div>
    </section>
  );
}
