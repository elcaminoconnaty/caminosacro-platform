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

/**
 * Endpoints de SOLO LECTURA que también consulta Isabel (la asesora de WhatsApp):
 * aceptan el secreto de BayMax o el de Isabel (ISABEL_API_SECRET). Isabel tiene su
 * propia llave para poder revocarla sin tumbar a BayMax, y esa llave no abre ningún
 * endpoint que escriba en el CRM.
 */
export function autorizadoLectura(request: Request): boolean {
  return autorizadoCon(request, "AGENTE_API_SECRET") || autorizadoCon(request, "ISABEL_API_SECRET");
}

export { noAutorizado };
