"use client";

// Formulario de firma: identidad declarada, firma dibujada en canvas,
// foto del pasaporte y aceptación expresa. Envía todo a firmarContrato().

import { useRef, useState, useTransition } from "react";
import { firmarContrato, type ResultadoFirma } from "./actions";

// Las fotos de pasaporte que llegan del celular pesan 3-8 MB y hacían que el envío
// superara el límite de la Server Action (por ahí se cayó la primera firma real).
// Reducirlas aquí, antes de enviarlas, deja el pasaporte en cientos de KB sin perder
// legibilidad y hace la subida viable en datos móviles.
const PASAPORTE_LADO_MAX = 1600;
const PASAPORTE_CALIDAD = 0.82;

async function comprimeImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo; // los PDF viajan enteros
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, PASAPORTE_LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return archivo;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      lienzo.toBlob(resolve, "image/jpeg", PASAPORTE_CALIDAD),
    );
    // Si comprimir no ayudó (imagen ya pequeña), nos quedamos con el original.
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], "Pasaporte.jpg", { type: "image/jpeg" });
  } catch {
    // Formato que el navegador no sabe decodificar (p. ej. HEIC en algún Android):
    // seguimos con el original — comprimir nunca debe impedir firmar.
    return archivo;
  }
}

function SignatureCanvas({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

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
    ctx.lineWidth = 2.2;
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
    if (hasInk.current) onChange(canvasRef.current!.toDataURL("image/png"));
  }

  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={560}
        height={160}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full h-36 border border-dashed border-border rounded-lg bg-crema/50 touch-none cursor-crosshair"
      />
      <div className="flex justify-between items-center mt-1">
        <p className="text-[11px] text-muted">Dibuja tu firma con el dedo o el mouse.</p>
        <button type="button" onClick={clear} className="text-[11px] text-muted underline hover:text-fg">
          Borrar y volver a firmar
        </button>
      </div>
    </div>
  );
}

export default function SignForm({
  token,
  defaultName,
  defaultDocument,
  docType,
  financiado,
}: {
  token: string;
  defaultName: string;
  defaultDocument: string;
  docType: string;
  financiado: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [preparando, setPreparando] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [done, setDone] = useState<ResultadoFirma | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enviando = pending || preparando;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!signature) {
      setError("Falta tu firma: dibújala en el recuadro.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set("signature", signature);

    const pasaporte = fd.get("passport");
    if (pasaporte instanceof File && pasaporte.size > 0) {
      setPreparando(true);
      try {
        fd.set("passport", await comprimeImagen(pasaporte));
      } finally {
        setPreparando(false);
      }
    }

    startTransition(async () => {
      try {
        const r = await firmarContrato(token, fd);
        if (r.ok) setDone(r);
        else setError(r.error);
      } catch (e) {
        // Sin este catch, un fallo de red o del servidor reventaba el error boundary y
        // el peregrino perdía todo lo que había llenado.
        console.error("[firma] la acción falló:", e);
        setError(
          "No pudimos enviar tu firma. Revisa tu conexión e inténtalo de nuevo; si sigue fallando, escríbenos a reservas@caminosacro.com.",
        );
      }
    });
  }

  if (done?.ok) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-dorado-oscuro">¡Listo!</p>
        <p className="font-display text-3xl text-bosque mt-2">Contrato firmado</p>
        <p className="text-sm text-muted mt-3 max-w-md mx-auto">
          {done.emailEnviado
            ? "Te enviamos la copia firmada a tu correo. "
            : "La copia firmada quedó registrada; te la haremos llegar por correo. "}
          Nuestro equipo continúa ahora con la gestión de tus reservas. ¡Buen Camino, peregrino! 🥾
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="px-6 py-6 space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-dorado-oscuro">Último paso</p>
        <h2 className="font-display text-xl text-bosque mt-1">Firma del contrato</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-xs">
          <span className="text-muted">Nombre completo (como firmante)</span>
          <input
            name="signer_name"
            defaultValue={defaultName}
            required
            minLength={5}
            className="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted">Número de pasaporte</span>
          <input
            name="signer_document"
            defaultValue={docType === "Pasaporte" ? defaultDocument : ""}
            required
            minLength={4}
            placeholder="Como aparece en tu pasaporte"
            className="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
          />
          <span className="block text-[11px] text-muted mt-1">Este número quedará dentro de tu contrato firmado.</span>
        </label>
      </div>

      <label className="text-xs block">
        <span className="text-muted">
          Foto o escaneo de tu pasaporte (página de datos) — debe coincidir con el número de arriba
        </span>
        <input
          name="passport"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
          required
          className="mt-1.5 block w-full text-xs file:mr-3 file:px-3 file:py-2 file:rounded-md file:border-0 file:bg-bosque file:text-white file:cursor-pointer hover:file:bg-bosque-medio"
        />
      </label>

      <div>
        <p className="text-xs text-muted mb-1.5">Tu firma</p>
        <SignatureCanvas onChange={setSignature} />
      </div>

      <label className="flex items-start gap-2.5 text-xs text-fg">
        <input type="checkbox" name="accept" required className="mt-0.5" />
        <span>
          Declaro que leí y comprendí íntegramente el contrato{financiado ? ", incluido el pagaré en blanco con su carta de instrucciones (Anexo No. 2)," : ""}{" "}
          y sus anexos; que los datos que suministro son veraces; que autorizo el tratamiento de mis datos personales
          — incluida la imagen de mi pasaporte y su transmisión al operador del viaje en España — conforme a la Ley
          1581 de 2012; y que firmo electrónicamente con plena validez legal (Ley 527 de 1999).
        </span>
      </label>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <button
        type="submit"
        disabled={enviando}
        className="w-full py-3.5 rounded-full bg-bosque text-white font-medium hover:bg-bosque-medio transition disabled:opacity-50"
      >
        {preparando ? "Preparando tu pasaporte…" : pending ? "Firmando…" : "Firmar contrato y enviar"}
      </button>
    </form>
  );
}
