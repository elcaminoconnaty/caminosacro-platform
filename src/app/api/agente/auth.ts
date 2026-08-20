import "server-only";

import { autorizado as autorizadoCon, noAutorizado } from "../wp/auth";

/**
 * Auth de /api/agente/*: el secreto de BayMax (AGENTE_API_SECRET en Railway,
 * CS_AGENTE_SECRET en el .env del agente). Deliberadamente distinto al del
 * WordPress: éste sí puede escribir en el CRM.
 */
export function autorizadoAgente(request: Request): boolean {
  return autorizadoCon(request, "AGENTE_API_SECRET");
}

export { noAutorizado };
