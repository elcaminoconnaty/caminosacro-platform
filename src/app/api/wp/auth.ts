import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Auth de los endpoints server-to-server: secreto compartido en el header
 * x-cs-api-key. Por defecto el del WordPress de caminosacro.com
 * (WP_QUOTER_SECRET en Railway); /api/agente/* pasa el suyo, para que filtrar
 * uno no abra la puerta del otro.
 * El navegador del visitante nunca ve ninguna de las dos claves.
 */
export function autorizado(request: Request, envVar = "WP_QUOTER_SECRET"): boolean {
  const secreto = process.env[envVar];
  if (!secreto) return false;
  const recibido = request.headers.get("x-cs-api-key") ?? "";
  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Función y no constante: un Response solo puede consumirse una vez.
export function noAutorizado(): Response {
  return Response.json({ ok: false, error: "no_autorizado" }, { status: 401 });
}
