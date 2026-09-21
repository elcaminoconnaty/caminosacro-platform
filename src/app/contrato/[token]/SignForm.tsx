"use client";

// Formulario de firma en tres pasos: (1) identidad declarada, pasaporte, firma dibujada y
// aceptación expresa; (2) código de un solo uso al correo del contrato; (3) el código y
// la firma. Envía todo a firmarContrato(), que es quien valida de verdad.
//
// La ubicación aproximada se pide al firmar, con permiso del navegador: si el viajero la
// niega o el celular no la tiene, se firma igual. Es el mismo dato que trae ZapSign.

import { useRef, useState, useTransition } from "react";
import { firmarContrato, pedirCodigo, type ResultadoFirma } from "./actions";
import { comprimeImagen } from "@/lib/comprimeImagen";
import { textoConsentimiento } from "@/lib/contracts/consentimiento";

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

/** Copia suelta de lo validado en el paso 1: al firmar se le cambia el pasaporte por el
 *  comprimido, y el original queda intacto por si hay que volver a intentarlo. */
function copiaDatos(fd: FormData): FormData {
  const copia = new FormData();
  fd.forEach((valor, clave) => copia.append(clave, valor));
  return copia;
}

/**
 * La ubicación aproximada, si el firmante la concede. Nunca bloquea la firma: si el
 * navegador no la tiene, la niega o tarda más de seis segundos, se firma sin ella.
 */
function ubicacionAproximada(): Promise<string | null> {
  return new Promise((resolver) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolver(null);
    let resuelto = false;
    const listo = (v: string | null) => {
      if (resuelto) return;
      resuelto = true;
      resolver(v);
    };
    const reloj = setTimeout(() => listo(null), 6500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(reloj);
        listo(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
      },
      () => {
        clearTimeout(reloj);
        listo(null);
      },
      { timeout: 6000, maximumAge: 600_000, enableHighAccuracy: false },
    );
  });
}

function SignatureCanvas({ onChange, invalido, disabled }: { onChange: (dataUrl: string | null) => void; invalido?: boolean; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
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
        className={`w-full h-36 border border-dashed rounded-lg touch-none ${disabled ? "cursor-not-allowed opacity-70" : "cursor-crosshair"} ${
          invalido ? "border-red-400 bg-red-50/40" : "border-border bg-crema/50"
        }`}
      />
      <div className="flex justify-between items-center mt-1">
        <p className="text-[11px] text-muted">Dibuja tu firma con el dedo o el mouse.</p>
        {!disabled && (
          <button type="button" onClick={clear} className="text-[11px] text-muted underline hover:text-fg">
            Borrar y volver a firmar
          </button>
        )}
      </div>
    </div>
  );
}

export default function SignForm({
  token,
  defaultName,
  defaultDocument,
  docType,
  financiado, // = el paquete incluye el pagaré (ver `llevaPagare`), no solo que el plan sea a cuotas
  empresa = false,
  razonSocial = null,
  correoContrato = "",
}: {
  token: string;
  defaultName: string;
  defaultDocument: string;
  docType: string;
  financiado: boolean;
  /** Contrato de empresa: firma el representante legal y NO se sube pasaporte acá. */
  empresa?: boolean;
  razonSocial?: string | null;
  /** Correo de notificaciones del contrato: ahí llega el código. */
  correoContrato?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [preparando, setPreparando] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [done, setDone] = useState<ResultadoFirma | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // El código se pide después de completar el paso 1: a partir de ahí los datos quedan
  // fijos (el código va atado a este contrato y a lo que se va a firmar).
  const [codigoPedido, setCodigoPedido] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  // Campos señalados en rojo. La validación es nuestra (el form va con noValidate) para
  // que el viajero SIEMPRE vea en español qué le falta: el aviso del navegador es seco,
  // sale en un globito fácil de perder en el celular y no dice todo lo que falta de una.
  const [faltantes, setFaltantes] = useState<Record<string, boolean>>({});
  const enviando = pending || preparando;
  const formRef = useRef<HTMLFormElement>(null);
  // Lo que se validó en el paso 1, guardado tal cual. Apenas se pide el código los campos
  // quedan dentro de un <fieldset disabled>, y un control deshabilitado NO entra en
  // `new FormData(form)`: si al firmar volviéramos a leer el formulario, el nombre, el
  // documento y la aceptación llegarían vacíos y el firmante vería "te falta…" con todo
  // lleno en pantalla. Se firma esta copia, que es además lo que el código confirma.
  const datosPasoUno = useRef<FormData | null>(null);

  const claseCampo = (campo: string) =>
    `mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white ${
      faltantes[campo] ? "border-red-400 ring-1 ring-red-200" : "border-border"
    }`;

  const consentimiento = textoConsentimiento({ empresa, financiado, razonSocial });

  /** Revisa el paso 1 completo y señala lo que falta. Devuelve el FormData listo, o null. */
  function validarPasoUno(): FormData | null {
    const form = formRef.current!;
    const fd = new FormData(form);
    const nombre = String(fd.get("signer_name") || "").trim();
    const documento = String(fd.get("signer_document") || "").trim();
    const pasaporte = fd.get("passport");
    const archivo = pasaporte instanceof File && pasaporte.size > 0 ? pasaporte : null;

    // En el orden en que se ven en pantalla, para poder llevarlo al primero que falta.
    const faltas: { campo: string; texto: string }[] = [];
    if (nombre.length < 5) faltas.push({ campo: "signer_name", texto: "tu nombre completo" });
    if (documento.length < 4) {
      faltas.push({ campo: "signer_document", texto: empresa ? "el número de documento del representante legal" : "tu número de pasaporte" });
    }
    // En el contrato de empresa nadie sube pasaporte acá: los de los viajeros los carga el
    // equipo desde el CRM (la empresa los manda por correo).
    if (!empresa && !archivo) faltas.push({ campo: "passport", texto: "la foto de tu pasaporte" });
    if (!signature) faltas.push({ campo: "signature", texto: "tu firma (dibújala en el recuadro)" });
    if (!fd.get("accept")) faltas.push({ campo: "accept", texto: "aceptar la declaración" });

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
      return null;
    }
    setFaltantes({});
    return fd;
  }

  function pedir() {
    setError(null);
    setAviso(null);
    // Reenviar el código ("no me llegó") no revalida: los campos ya están bloqueados y
    // lo que se firma quedó guardado al pedir el primero.
    if (!codigoPedido) {
      const fd = validarPasoUno();
      if (!fd) return;
      datosPasoUno.current = fd;
    }
    startTransition(async () => {
      try {
        const r = await pedirCodigo(token);
        if (r.ok) {
          setCodigoPedido(r.correo);
          setAviso(`Te enviamos un código de seis dígitos a ${r.correo}. Puede tardar un minuto en llegar; revisa también el correo no deseado.`);
        } else {
          setError(r.error);
        }
      } catch (e) {
        console.error("[firma] pedir código falló:", e);
        setError("No pudimos enviar el código. Revisa tu conexión e inténtalo de nuevo.");
      }
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!codigoPedido) return pedir();

    const fd = datosPasoUno.current ? copiaDatos(datosPasoUno.current) : validarPasoUno();
    if (!fd) return;
    if (codigo.replace(/\D/g, "").length !== 6) {
      setFaltantes({ codigo: true });
      setError("Escribe el código de seis dígitos que te llegó al correo.");
      return;
    }
    fd.set("signature", signature!);
    fd.set("codigo", codigo.replace(/\D/g, ""));

    const pasaporte = fd.get("passport");
    const archivo = pasaporte instanceof File && pasaporte.size > 0 ? pasaporte : null;
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
        // Se pide justo antes de enviar, cuando el viajero ya decidió firmar.
        const geo = await ubicacionAproximada();
        if (geo) fd.set("geo", geo);
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
          Al final del documento encontrarás el Informe de Firmas con todos los datos de la firma.
          Nuestro equipo continúa ahora con la gestión de tus reservas. ¡Buen Camino, peregrino! 🥾
        </p>
        <div className="mt-6 max-w-md mx-auto text-left bg-crema border border-border rounded-md px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-dorado-oscuro">Huella SHA-256 del documento</p>
          <code className="block mt-1 text-[11px] break-all text-fg">{done.huella}</code>
          <a href={done.urlVerificacion} target="_blank" rel="noreferrer" className="block mt-2 text-xs underline text-bosque">
            Comprobar la autenticidad del documento
          </a>
        </div>
      </div>
    );
  }

  const bloqueado = enviando || !!codigoPedido;

  return (
    <form
      ref={formRef}
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
        <h2 className="font-display text-xl text-bosque mt-1">
          {empresa ? "Firma del representante legal" : "Firma del contrato"}
        </h2>
      </div>

      <fieldset disabled={bloqueado} className="space-y-5 disabled:opacity-80">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-xs">
            <span className="text-muted">
              {empresa ? "Nombre del representante legal" : "Nombre completo (como firmante)"}
            </span>
            <input name="signer_name" defaultValue={defaultName} className={claseCampo("signer_name")} />
          </label>
          <label className="text-xs">
            <span className="text-muted">
              {empresa ? docType || "Documento del representante legal" : "Número de pasaporte"}
              {!empresa && docType !== "Pasaporte" && (
                <span className="text-dorado-oscuro"> · nos falta este dato</span>
              )}
            </span>
            <input
              name="signer_document"
              defaultValue={empresa || docType === "Pasaporte" ? defaultDocument : ""}
              placeholder={empresa ? "Ej: 79.123.456" : "Ej: AS748091"}
              className={claseCampo("signer_document")}
            />
            <span className="block text-[11px] text-muted mt-1">
              {empresa
                ? "Este número queda dentro del contrato firmado, junto a tu nombre y al NIT de la empresa."
                : docType === "Pasaporte"
                  ? "Verifica que coincida con tu pasaporte: este número queda dentro del contrato firmado."
                  : `Tu cotización quedó con tu ${docType.toLowerCase()}, pero el contrato necesita el pasaporte con el que vas a viajar. Cópialo tal como aparece, sin espacios.`}
            </span>
          </label>
        </div>

        {empresa ? (
          <p className="text-[11px] text-muted bg-crema border border-border rounded-md px-3 py-2">
            Los pasaportes de los viajeros no se suben aquí: envíalos a reservas@caminosacro.com y nosotros los
            cargamos. Los necesitamos para gestionar las reservas, pero no hacen falta para firmar.
          </p>
        ) : (
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
        )}

        <div>
          <p className="text-xs text-muted mb-1.5">Tu firma</p>
          <SignatureCanvas
            disabled={bloqueado}
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
          <span>{consentimiento}</span>
        </label>
      </fieldset>

      {/* Paso 2/3: el código al correo. Es lo que confirma que quien firma controla el
          correo del contrato — el "nivel de seguridad" del Informe de Firmas. */}
      <div className="bg-crema border border-border rounded-md px-4 py-4 space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-dorado-oscuro">Confirmación por correo</p>
        {!codigoPedido ? (
          <p className="text-sm text-fg">
            Para firmar te enviaremos un código de seis dígitos a{" "}
            <strong>{correoContrato || "tu correo"}</strong>. Es lo que confirma que eres tú quien firma.
          </p>
        ) : (
          <>
            <p className="text-sm text-fg">
              Escribe el código que te llegó a <strong>{codigoPedido}</strong>:
            </p>
            <input
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              placeholder="______"
              className={`block w-56 text-center text-2xl tracking-[0.5em] border rounded-md px-3 py-2 bg-white ${
                faltantes.codigo ? "border-red-400 ring-1 ring-red-200" : "border-border"
              }`}
            />
            <button type="button" onClick={pedir} disabled={enviando} className="text-[11px] text-muted underline hover:text-fg">
              No me llegó: enviar otro código
            </button>
          </>
        )}
      </div>

      {aviso && (
        <div role="status" className="text-sm text-bosque bg-crema border border-border rounded-md px-3 py-2.5">
          {aviso}
        </div>
      )}
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
        {preparando
          ? "Preparando tu pasaporte…"
          : pending
            ? codigoPedido ? "Firmando…" : "Enviando el código…"
            : codigoPedido ? "Firmar contrato y enviar" : "Enviarme el código para firmar"}
      </button>
      <p className="text-[11px] text-muted text-center">
        Al firmar, el navegador puede pedirte permiso para compartir tu ubicación aproximada. Es opcional: si
        dices que no, la firma es igual de válida.
      </p>
    </form>
  );
}
