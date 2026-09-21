"use client";

import { useState, useTransition } from "react";
import { MessageCircle, ChevronDown, ChevronRight, Copy, RotateCcw, FileDown, ExternalLink } from "lucide-react";
import { enlaceWhatsApp, telefonoWhatsApp } from "@/lib/whatsapp";
import { getSignedUrl } from "./actions";
import EstadoEnvio, { type EnvioResumen } from "./EstadoEnvio";

/**
 * El mensaje de WhatsApp con el que se le presenta la cotización al peregrino.
 *
 * Nace PLEGADA, y eso es a propósito: el expediente ya tiene nueve tarjetas y esta solo
 * hace falta en un momento muy concreto —cuando hay que escribirle a alguien que cotizó
 * en la web, se quedó sin precio y ahora ya lo tiene—. Abierta a todas horas sería una
 * pantalla más larga para todos y un texto útil para uno.
 *
 * El texto se arma en el servidor con los datos de ESTA cotización y acá se puede editar
 * antes de mandarlo: es una conversación, no un envío masivo, y cada peregrino llega con
 * la suya. "Restablecer" devuelve el estándar cuando la edición se fue por otro lado.
 *
 * Lo que esta tarjeta NO hace: mandar el mensaje. WhatsApp se abre con el texto ya escrito
 * y el envío lo da una persona, que además tiene que arrastrar el PDF al chat. Enviar
 * solo se automatiza con la API de negocio de Meta, y eso es otra conversación (y otra
 * factura).
 */
export default function WhatsAppCard({
  telefonoInicial,
  mensajeInicial,
  enlaceCotizacion,
  pdfPath,
  pdfNombre,
  envio,
}: {
  /** `quotes.client_phone`, tal como está escrito en el expediente. */
  telefonoInicial: string;
  mensajeInicial: string;
  /** El enlace a la cotización que va DENTRO del mensaje (/correo/[token]), si ya existe. */
  enlaceCotizacion: string | null;
  /** Ruta del PDF en Storage, para bajarlo y adjuntarlo al chat. */
  pdfPath: string | null;
  pdfNombre: string;
  /** Para avisar si el mensaje dice "te envié la cotización" y el correo todavía no salió. */
  envio: EnvioResumen;
}) {
  const [abierto, setAbierto] = useState(false);
  const [telefono, setTelefono] = useState(telefonoInicial);
  const [mensaje, setMensaje] = useState(mensajeInicial);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const numero = telefonoWhatsApp(telefono);
  const editado = mensaje !== mensajeInicial;

  /**
   * Abre el chat con el mensaje puesto Y lo deja en el portapapeles.
   *
   * Las dos cosas porque una sola no basta: WhatsApp escribe el texto solo en la caja del
   * chat, pero si la sesión de WhatsApp Web se cayó, o el mensaje es largo, o el navegador
   * corta la URL, lo que aparece es media cotización. Con el texto copiado, pegarlo es
   * ⌘V y no volver acá.
   *
   * El orden importa: la copia se dispara ANTES de abrir la pestaña. Al abrirse, esta
   * página pierde el foco y el navegador rechaza escribir en el portapapeles de un
   * documento que no lo tiene.
   */
  function enviar() {
    if (!numero) return;
    setError(null);
    const copia = navigator.clipboard?.writeText(mensaje);
    window.open(enlaceWhatsApp(telefono, mensaje), "_blank", "noopener,noreferrer");
    copia
      ?.then(() => setAviso("✓ Se abrió WhatsApp con el mensaje escrito. También quedó copiado: si la caja sale vacía, pégalo con ⌘V."))
      .catch(() => setAviso("Se abrió WhatsApp con el mensaje escrito, pero no pude copiarlo al portapapeles."));
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch (e) {
      setError("No pude copiar al portapapeles: " + (e as Error).message);
    }
  }

  function descargarPdf() {
    if (!pdfPath) return;
    setError(null);
    startTransition(async () => {
      // Con `download`: el PDF cae en Descargas con su nombre y de ahí se arrastra al
      // chat. Abierto en una pestaña habría que guardarlo a mano y sale con el nombre
      // del archivo en Storage.
      const r = await getSignedUrl(pdfPath, { download: pdfNombre });
      if (r.url) window.open(r.url, "_blank");
      else setError(r.error ?? "No pude preparar el PDF.");
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* La cabecera ES el interruptor: el clic en cualquier parte abre y cierra. */}
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-taupe/20 transition"
      >
        {abierto ? <ChevronDown size={16} className="text-muted shrink-0" /> : <ChevronRight size={16} className="text-muted shrink-0" />}
        <MessageCircle size={16} className="text-bosque shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg text-bosque">Mensaje de WhatsApp</h2>
          <p className="text-xs text-muted mt-0.5">
            Saludo, los datos de la cotización y el aviso de que va por correo y adjunta en el
            chat. Se edita antes de mandarlo.
          </p>
        </div>
        {editado && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-dorado-oscuro/15 text-dorado-oscuro font-semibold shrink-0">
            editado
          </span>
        )}
      </button>

      {abierto && (
        <div className="px-5 py-4 border-t border-border space-y-3 text-sm">
          {/* El mensaje dice "te envié la cotización al correo". Si el correo todavía no
              ha salido, eso es mentira y el peregrino va a buscar en su bandeja algo que
              no está: se avisa acá, junto al texto que lo afirma. */}
          <EstadoEnvio resumen={envio} que="la cotización" />

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted mb-0.5 block" htmlFor="wa-telefono">
                WhatsApp del peregrino
              </label>
              <input
                id="wa-telefono"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+57 310 538 5516"
                className="bg-crema border border-border rounded-md px-3 py-2 text-sm font-mono w-[200px] focus:outline-none focus:border-bosque"
              />
            </div>
            <p className="text-[11px] text-muted pb-2">
              {numero
                ? `Se abre el chat con +${numero}`
                : "Sin número no hay chat: escríbelo con indicativo si no es de Colombia."}
            </p>
          </div>

          <div>
            <label className="text-xs text-muted mb-0.5 block" htmlFor="wa-mensaje">
              Mensaje
            </label>
            <textarea
              id="wa-mensaje"
              value={mensaje}
              onChange={(e) => { setMensaje(e.target.value); setAviso(null); }}
              rows={20}
              className="w-full font-sans bg-crema border border-border rounded-md p-3 text-sm leading-relaxed focus:outline-none focus:border-bosque resize-y"
            />
            <p className="text-xs text-muted mt-1">
              En WhatsApp, lo que va entre asteriscos sale en <strong>negrita</strong>.{" "}
              {enlaceCotizacion ? (
                <>
                  El mensaje lleva el enlace corto a la cotización (
                  <span className="font-mono">{enlaceCotizacion.replace(/^https?:\/\//, "")}</span>
                  ), así que no hace falta adjuntar el PDF: se abre con un toque desde el
                  celular y siempre muestra la versión vigente.
                </>
              ) : (
                <>
                  No se pudo crear el enlace corto, así que el texto dice que la cotización va
                  adjunta: descarga el PDF y arrástralo al chat.
                </>
              )}
            </p>
          </div>

          {aviso && <p role="status" className="text-xs text-bosque">{aviso}</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setMensaje(mensajeInicial)}
              disabled={!editado}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 disabled:opacity-40 transition"
            >
              <RotateCcw size={13} /> Restablecer
            </button>
            {pdfPath && (
              <button
                type="button"
                onClick={descargarPdf}
                disabled={pendiente}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 disabled:opacity-40 transition"
              >
                <FileDown size={13} /> {pendiente ? "Preparando…" : "Descargar PDF"}
              </button>
            )}
            <button
              type="button"
              onClick={copiar}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
            >
              <Copy size={13} /> {copiado ? "✓ Copiado" : "Copiar mensaje"}
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={!numero}
              title={numero ? undefined : "Falta el WhatsApp del peregrino"}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ExternalLink size={13} /> Enviar por WhatsApp
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
