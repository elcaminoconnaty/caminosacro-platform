import "server-only";

import { autorizado as autorizadoCon } from "../../wp/auth";

/**
 * Auth de /api/agente/isabel/*: SOLO el secreto de Isabel (ISABEL_API_SECRET). Es el
 * único sitio donde esa llave puede escribir en el CRM, y lo único que puede escribir es
 * lo que haría un visitante del cotizador web: una cotización nueva con su correo.
 */
export function autorizadoIsabel(request: Request): boolean {
  return autorizadoCon(request, "ISABEL_API_SECRET");
}
