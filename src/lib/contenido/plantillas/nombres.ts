// Nombre legible de una plantilla, sin arrastrar el registry entero.
//
// El registry importa componentes TSX; esto se usa en sitios donde solo hace falta el
// nombre (el prompt del copy, un log), y cargar los componentes ahí sería traer todo el
// árbol de render sin necesidad.

import { PLANTILLAS } from "./registry";

export function plantillaNombre(id: string): string {
  return PLANTILLAS[id]?.definicion.nombre ?? id;
}
