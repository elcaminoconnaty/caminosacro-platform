import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Auth de los endpoints /api/wp/*: secreto compartido con el WordPress de
 * caminosacro.com (header x-cs-api-key vs WP_QUOTER_SECRET en Railway).
 * Server-to-server: el navegador del visitante nunca ve esta clave.
 */
export function autorizado(request: Request): boolean {
  const secreto = process.env.WP_QUOTER_SECRET;
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
