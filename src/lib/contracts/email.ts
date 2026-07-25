import "server-only";

import { enviarCorreoWebhook, type CorreoPayload } from "@/lib/email/webhook";

// Correos del flujo de contrato, por el mismo webhook n8n → Brevo que usan el
// cotizador público y el envío de cotizaciones del CRM (ver src/lib/email/webhook.ts).
// El workflow envía al cliente (con el PDF de pdf_url adjunto) y avisa a reservas@.

export type CorreoContratoPayload = CorreoPayload;

export async function enviarCorreoContrato(payload: CorreoContratoPayload): Promise<boolean> {
  const { ok } = await enviarCorreoWebhook(payload);
  return ok;
}
