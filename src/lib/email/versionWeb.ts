import "server-only";

import { randomBytes } from "node:crypto";

/**
 * La versión web de un correo: /correo/[token].
 *
 * Existe porque maquetar correo es apostar contra treinta clientes distintos. Con tablas
 * y estilos en línea la apuesta se gana casi siempre, pero "casi" no sirve cuando el
 * correo es la oferta comercial que el cliente tiene que entender para comprar. La barra
 * de arriba del correo es el plan B.
 *
 * El token se genera ANTES de armar el HTML, porque el enlace va dentro de ese mismo HTML
 * y luego se guarda tal cual: la página tiene que servir exactamente lo que se envió.
 */
export function nuevoTokenCorreo(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Base pública de la app. APP_BASE_URL manda, igual que en el enlace de firma del
 * contrato y por la misma razón: en local, sin ella, el correo mandaría al cliente a un
 * `localhost` que no existe fuera de esta máquina.
 */
export function baseUrlApp(): string {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  return "https://caminosacro-platform-production.up.railway.app";
}

export function urlVersionWeb(token: string): string {
  return `${baseUrlApp()}/correo/${token}`;
}
