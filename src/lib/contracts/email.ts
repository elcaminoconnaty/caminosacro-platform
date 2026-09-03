import "server-only";

import { enviarCorreoWebhook, type CorreoPayload } from "@/lib/email/webhook";
import { registrarEnvio } from "@/lib/email/log";
import type { ComercialClient } from "@/lib/quotes/pdf";

// Correos del flujo de contrato, por el mismo webhook n8n → Brevo que usan el
// cotizador público y el envío de cotizaciones del CRM (ver src/lib/email/webhook.ts).
// El workflow envía al cliente (con el PDF de pdf_url adjunto) y avisa a reservas@.
//
// Los tres flujos que pasan por acá —enviar el contrato para firma, la copia al
// firmante y los recordatorios del cron— son el correo que más pesa en el negocio y,
// hasta esta revisión, el único que no dejaba fila en `email_log`: si un envío se
// perdía no quedaba ni el destinatario ni el motivo. Por eso el registro no es
// opcional: `registro` es obligatorio y la función devuelve el resultado COMPLETO del
// emisor (`ok`, `error`, `messageId`) en vez del booleano de antes, que borraba tanto
// el motivo del fallo como la única prueba real de envío.

export type CorreoContratoPayload = CorreoPayload;

export type RegistroCorreoContrato = {
  supabase: ComercialClient;
  /** Cotización a la que cuelga el contrato, para poder ver el correo desde el expediente. */
  quoteId?: string | null;
  /** Envío de prueba desde el CRM: se registra igual, pero marcado. */
  prueba?: boolean;
};

export type ResultadoCorreoContrato = {
  ok: boolean;
  error?: string;
  messageId?: string;
};

export async function enviarCorreoContrato(
  payload: CorreoContratoPayload,
  registro: RegistroCorreoContrato,
): Promise<ResultadoCorreoContrato> {
  const envio = await enviarCorreoWebhook(payload);
  // El registro nunca lanza (ver lib/email/log.ts): un fallo de la tabla no puede
  // convertir un correo enviado en un correo fallido.
  await registrarEnvio(registro.supabase, {
    quoteId: registro.quoteId ?? null,
    code: payload.code,
    tipo: "contrato",
    destinatario: payload.email,
    asunto: payload.subject,
    adjuntos: payload.attachments?.length ?? (payload.pdf_url ? 1 : 0),
    messageId: envio.messageId ?? null,
    error: envio.ok ? null : (envio.error ?? "No se pudo enviar el correo."),
    prueba: registro.prueba ?? false,
    // Los correos del contrato van en texto plano; si algún día se maquetan, acá se
    // guarda el HTML exacto igual que en el correo de documentación.
    html: payload.html ?? null,
  });
  return envio;
}
