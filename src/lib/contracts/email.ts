import "server-only";

// Correos del flujo de contrato, por el mismo webhook n8n → Brevo que usa el
// cotizador público (ver enviarCorreo en src/app/cotizar/actions.ts).
// El workflow envía al cliente (con el PDF de pdf_url adjunto) y avisa a reservas@.

export type CorreoContratoPayload = {
  code: string;
  nombre: string;
  email: string;
  telefono: string | null;
  ruta: string | null;
  fecha_inicio: string | null;
  personas: number;
  alojamiento: string | null;
  total_eur: number | null;
  pdf_url: string | null;
  subject: string;
  body: string;
  // Nombre del archivo adjunto (para que diga "Contrato-..." y no "Cotizacion-...").
  attachment_name?: string;
  // Asunto/cuerpo del aviso interno a reservas@ (si no se envían, el workflow usa
  // su aviso de lead por defecto).
  aviso_subject?: string;
  aviso_body?: string;
};

export async function enviarCorreoContrato(payload: CorreoContratoPayload): Promise<boolean> {
  const url = process.env.QUOTE_EMAIL_WEBHOOK_URL;
  if (!url) {
    console.warn("[contrato] QUOTE_EMAIL_WEBHOOK_URL sin configurar: no se envió el correo.");
    return false;
  }
  if (!payload.email) {
    console.warn("[contrato] el contrato no tiene correo del viajero: no se envió.");
    return false;
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.QUOTE_EMAIL_WEBHOOK_SECRET
          ? { "x-webhook-secret": process.env.QUOTE_EMAIL_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch (e) {
    console.error("[contrato] no se pudo enviar el correo:", e);
    return false;
  }
}
