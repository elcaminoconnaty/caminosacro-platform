import "server-only";

import type { ComercialClient } from "@/lib/quotes/pdf";

// Registro de correos: un renglón por cada intento de envío (migración 0028).
//
// Existe porque "enviado" en el CRM no significaba nada verificable. El webhook de
// n8n responde antes de llamar a Brevo, así que las dos marcas de tiempo que había
// (`quotes.email_sent_at` y `quotes.pilgrim_email_sent_at`) se escribían igual
// aunque el correo no hubiera salido — sin destinatario, sin identificador y sin
// estado. Y las ejecuciones de n8n se purgan a los pocos días.
//
// NUNCA lanza. Un fallo del registro no puede tumbar un envío ni la operación que
// lo disparó: si la tabla todavía no existe (migración sin aplicar), esto es un
// warning en el log del servidor y nada más.

export type EnvioRegistrado = {
  quoteId?: string | null;
  code?: string | null;
  tipo: "cliente" | "pilgrim" | "contrato" | "lead" | "documentacion";
  destinatario: string;
  asunto?: string | null;
  adjuntos?: number;
  messageId?: string | null;
  error?: string | null;
  prueba?: boolean;
  /** Token de la versión web (/correo/[token]), si el correo iba maquetado. */
  token?: string | null;
  /** El HTML EXACTO que se envió. No se vuelve a armar al abrir la versión web: si se
   *  regenerara, un cambio de plantilla haría que la página dijera algo distinto de lo
   *  que el cliente tiene en su bandeja. */
  html?: string | null;
};

export async function registrarEnvio(
  supabase: ComercialClient,
  envio: EnvioRegistrado,
): Promise<void> {
  // El estado dice exactamente lo que se sabe, ni más ni menos: 'confirmado' solo
  // cuando Brevo devolvió un messageId.
  const estado = envio.error ? "error" : envio.messageId ? "confirmado" : "aceptado";
  try {
    await supabase.from("email_log").insert({
      quote_id: envio.quoteId ?? null,
      code: envio.code ?? null,
      tipo: envio.tipo,
      destinatario: envio.destinatario,
      asunto: envio.asunto ?? null,
      adjuntos: envio.adjuntos ?? 0,
      message_id: envio.messageId ?? null,
      estado,
      error: envio.error ?? null,
      prueba: envio.prueba ?? false,
      token: envio.token ?? null,
      html: envio.html ?? null,
    });
  } catch (e) {
    console.warn("[correo] no pude registrar el envío en email_log:", e);
  }
}

// Extensiones que Brevo acepta como adjunto. Las que faltan importan: la firma del
// contrato admite pasaportes en heic, heif y webp (fotos de iPhone y de Android),
// y Brevo los rechaza con un 400 que se lleva el correo ENTERO por delante, no
// solo el adjunto. Con el webhook respondiendo antes de enviar, eso se veía en el
// CRM como "✓ Enviado".
const EXTENSIONES_BREVO = new Set([
  "jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "eps",
  "pdf", "doc", "docx", "docm", "odt", "rtf", "txt", "csv",
  "xls", "xlsx", "xlsm", "ods", "ppt", "pptx", "zip", "tar",
  "html", "htm", "xml", "ics", "msg",
]);

/** Devuelve los nombres de archivo que Brevo NO va a aceptar. */
export function adjuntosNoSoportados(nombres: string[]): string[] {
  return nombres.filter((n) => {
    const ext = n.split(".").pop()?.toLowerCase() ?? "";
    return !EXTENSIONES_BREVO.has(ext);
  });
}
