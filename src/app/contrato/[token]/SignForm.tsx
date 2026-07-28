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

// Tipos de archivo que acepta el servidor (ver PASSPORT_TYPES en actions.ts). Se validan
// también acá para poder decirle al viajero qué pasa sin esperar el viaje al servidor.
const PASAPORTE_TIPOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
const PASAPORTE_MAX_BYTES = 12 * 1024 * 1024;

/** Arma un mensaje legible con todo lo que falta, en el orden en que aparece en pantalla. */
function mensajeFaltantes(faltas: { campo: string; texto: string }[]): string {
  const textos = faltas.map((f) => f.texto);
  if (textos.length === 1) return `Falta ${textos[0]}.`;
  const ultimo = textos[textos.length - 1];
  return `Antes de firmar te falta ${textos.slice(0, -1).join(", ")} y ${ultimo}.`;
}

function SignatureCanvas({ onChange, invalido }: { onChange: (dataUrl: string | null) => void; invalido?: boolean }) {
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
        className={`w-full h-36 border border-dashed rounded-lg touch-none cursor-crosshair ${
          invalido ? "border-red-400 bg-red-50/40" : "border-border bg-crema/50"
        }`}
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
  // Campos señalados en rojo. La validación es nuestra (el form va con noValidate) para
  // que el viajero SIEMPRE vea en español qué le falta: el aviso del navegador es seco,
  // sale en un globito fácil de perder en el celular y no dice todo lo que falta de una.
  const [faltantes, setFaltantes] = useState<Record<string, boolean>>({});
  const enviando = pending || preparando;

  const claseCampo = (campo: string) =>
    `mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white ${
      faltantes[campo] ? "border-red-400 ring-1 ring-red-200" : "border-border"
    }`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);

    const fd = new FormData(form);
    const nombre = String(fd.get("signer_name") || "").trim();
    const documento = String(fd.get("signer_document") || "").trim();
    const pasaporte = fd.get("passport");
    const archivo = pasaporte instanceof File && pasaporte.size > 0 ? pasaporte : null;

    // En el orden en que se ven en pantalla, para poder llevarlo al primero que falta.
    const faltas: { campo: string; texto: string }[] = [];
    if (nombre.length < 5) faltas.push({ campo: "signer_name", texto: "tu nombre completo" });
    if (documento.length < 4) faltas.push({ campo: "signer_document", texto: "tu número de pasaporte" });
    if (!archivo) faltas.push({ campo: "passport", texto: "la foto de tu pasaporte" });
    if (!signature) faltas.push({ campo: "signature", texto: "tu firma (dibújala en el recuadro)" });
    if (!fd.get("accept")) faltas.push({ campo: "accept", texto: "aceptar la declaración del final" });

    // Problemas del archivo: mensaje propio en vez de un rechazo del servidor.
    if (archivo && !PASAPORTE_TIPOS.includes(archivo.type)) {
      faltas.push({
        campo: "passport",
        texto: "que el pasaporte sea una foto (JPG, PNG, HEIC) o un PDF — ese archivo no nos sirve",
      });
    }
    if (archivo && archivo.type === "application/pdf" && archivo.size > PASAPORTE_MAX_BYTES) {
      faltas.push({ campo: "passport", texto: "un PDF de menos de 12 MB (el tuyo pesa más)" });
    }

    if (faltas.length > 0) {
      setFaltantes(Object.fromEntries(faltas.map((f) => [f.campo, true])));
      setError(mensajeFaltantes(faltas));
      // Llevarlo al primero que falta: en el celular el mensaje puede quedar fuera de vista.
      const primero = faltas[0].campo;
      const destino =
        primero === "signature"
          ? form.querySelector("canvas")
          : (form.elements.namedItem(primero) as HTMLElement | null);
      destino?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (destino instanceof HTMLInputElement && destino.type !== "file") destino.focus({ preventScroll: true });
      return;
    }

    setFaltantes({});
    fd.set("signature", signature!);

    if (archivo) {
      setPreparando(true);
      let listo: File;
      try {
        listo = await comprimeImagen(archivo);
      } finally {
        setPreparando(false);
      }
      if (listo.size > PASAPORTE_MAX_BYTES) {
        setFaltantes({ passport: true });
        setError(
          "La foto de tu pasaporte quedó demasiado pesada incluso después de reducirla. Tómala de nuevo con menos resolución o mándanosla a reservas@caminosacro.com.",
        );
        return;
      }
      fd.set("passport", listo);
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
          "No pudimos enviar tu firma. Suele ser la conexión o el peso del archivo del pasaporte: revisa que tengas buena señal e inténtalo de nuevo. Lo que llenaste sigue acá. Si vuelve a fallar, escríbenos a reservas@caminosacro.com y lo resolvemos contigo.",
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
    <form
      onSubmit={onSubmit}
      noValidate
      // En cuanto corrige algo, se quitan los rojos y el aviso: si sigue faltando algo,
      // el mensaje vuelve a salir al intentar firmar, ya actualizado.
      onChange={() => {
        if (error) setError(null);
        setFaltantes({});
      }}
      className="px-6 py-6 space-y-5"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-dorado-oscuro">Último paso</p>
        <h2 className="font-display text-xl text-bosque mt-1">Firma del contrato</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-xs">
          <span className="text-muted">Nombre completo (como firmante)</span>
          <input name="signer_name" defaultValue={defaultName} className={claseCampo("signer_name")} />
        </label>
        <label className="text-xs">
          <span className="text-muted">
            Número de pasaporte
            {docType !== "Pasaporte" && <span className="text-dorado-oscuro"> · nos falta este dato</span>}
          </span>
          <input
            name="signer_document"
            defaultValue={docType === "Pasaporte" ? defaultDocument : ""}
            placeholder="Ej: AS748091"
            className={claseCampo("signer_document")}
          />
          <span className="block text-[11px] text-muted mt-1">
            {docType === "Pasaporte"
              ? "Verifica que coincida con tu pasaporte: este número queda dentro del contrato firmado."
              : `Tu cotización quedó con tu ${docType.toLowerCase()}, pero el contrato necesita el pasaporte con el que vas a viajar. Cópialo tal como aparece, sin espacios.`}
          </span>
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
          className={`mt-1.5 block w-full text-xs rounded-md file:mr-3 file:px-3 file:py-2 file:rounded-md file:border-0 file:bg-bosque file:text-white file:cursor-pointer hover:file:bg-bosque-medio ${
            faltantes.passport ? "ring-1 ring-red-300 p-1" : ""
          }`}
        />
        <span className="block text-[11px] text-muted mt-1">
          Tómala con el celular; la reducimos sola antes de enviarla, así que no importa que la foto sea grande.
        </span>
      </label>

      <div>
        <p className="text-xs text-muted mb-1.5">Tu firma</p>
        <SignatureCanvas
          onChange={(dataUrl) => {
            setSignature(dataUrl);
            // El canvas no dispara onChange del form: hay que limpiar su rojo aparte.
            if (dataUrl) setFaltantes((f) => ({ ...f, signature: false }));
          }}
          invalido={!!faltantes.signature}
        />
      </div>

      <label
        className={`flex items-start gap-2.5 text-xs text-fg rounded-md ${
          faltantes.accept ? "bg-red-50 ring-1 ring-red-300 p-2 -m-2" : ""
        }`}
      >
        <input type="checkbox" name="accept" className="mt-0.5" />
        <span>
          Declaro que leí y comprendí íntegramente el contrato{financiado ? ", incluido el pagaré en blanco con su carta de instrucciones (Anexo No. 2)," : ""}{" "}
          y sus anexos; que los datos que suministro son veraces; que autorizo el tratamiento de mis datos personales
          — incluida la imagen de mi pasaporte y su transmisión al operador del viaje en España — conforme a la Ley
          1581 de 2012; y que firmo electrónicamente con plena validez legal (Ley 527 de 1999).
        </span>
      </label>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="text-sm text-red-800 bg-red-50 border border-red-300 rounded-md px-3 py-2.5"
        >
          {error}
        </div>
      )}

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
