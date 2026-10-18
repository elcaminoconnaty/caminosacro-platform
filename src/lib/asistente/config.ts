/** Configuración del asistente, separada de `agente.ts` para que las páginas puedan
 *  preguntar si está listo sin cargar el SDK. */

/** Igual que el asistente de BDO: Opus 5.5 con esfuerzo medio. Se cambia sin desplegar código
 *  con ASISTENTE_MODELO (p. ej. "claude-sonnet-5-5" si el cupo de Naty aprieta). */
export const MODELO = process.env.ASISTENTE_MODELO || "claude-opus-5-5";

/** Solo en desarrollo: `ASISTENTE_LOGIN_LOCAL=1 npm run dev` usa el login de Claude Code del
 *  computador en vez del token de Naty, para probar sin tenerlo. En producción no existe. */
export const LOGIN_LOCAL = process.env.NODE_ENV !== "production" && process.env.ASISTENTE_LOGIN_LOCAL === "1";

export function problemaDeConfiguracion(): string | null {
  if (process.env.ASISTENTE_HABILITADO === "0") return "El asistente está apagado (ASISTENTE_HABILITADO=0).";
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !LOGIN_LOCAL) {
    return "Falta conectar la suscripción de Claude de Naty (CLAUDE_CODE_OAUTH_TOKEN). Es el mismo token que ya usa el asistente de la plataforma de El Camino con Naty; se copia en las variables de Railway de esta plataforma.";
  }
  return null;
}

/** Qué fuentes de correo están conectadas (para avisarle al modelo y a la pantalla). */
export function correosConectados() {
  return {
    reservas: !!process.env.OUTLOOK_WEBHOOK_URL && !!process.env.OUTLOOK_WEBHOOK_SECRET,
    gmailEcn: !!process.env.GMAIL_ECN_LECTURA_URL && !!process.env.GMAIL_ECN_LECTURA_SECRET,
  };
}
