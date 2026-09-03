/**
 * Los dos controles opcionales de "Pídelo tú": cuántos posts y de qué tipo.
 *
 * Ambos arrancan en "que lo decida el pedido" a propósito. Lo natural es escribir "hazme 3
 * posts de una sola imagen sobre el Año Jacobeo" y que la plataforma lo entienda; los
 * selects están para cuando el texto no lo dice o Claude lo entendió al revés. Si se tocan,
 * MANDAN sobre el texto — no es un empate que resuelva el modelo.
 *
 * ⚠️ POR QUÉ ESTO VIVE AQUÍ Y NO EN `pedidoActions.ts` NI EN `pedido.ts`: un archivo con
 * `"use server"` solo puede exportar funciones async, y `pedido.ts` lleva `import
 * "server-only"` (la caja es un componente de cliente y necesita las etiquetas). Es la
 * misma regla que está escrita en `arranques.ts` y que ya tumbó dos pantallas de este repo.
 */

import type { FormatoId } from "./formatos";

export type TipoPedido = {
  etiqueta: string;
  ayuda: string;
  /** Formatos en los que puede salir. `null` = que lo decida el pedido. */
  formatos: FormatoId[] | null;
  /** Cuántos slides tiene cada post: [mínimo, máximo]. `null` = que lo decida el pedido. */
  slides: [number, number] | null;
};

export const TIPOS_PEDIDO = {
  auto: {
    etiqueta: "Como diga el pedido",
    ayuda: "Se deduce de lo que escribas. Si no lo dices, sale un carrusel.",
    formatos: null,
    slides: null,
  },
  carrusel: {
    etiqueta: "Carrusel",
    ayuda: "Varios slides que se deslizan: portada, cuerpo y cierre.",
    formatos: ["4x5", "1x1"],
    slides: [4, 6],
  },
  unica: {
    etiqueta: "Una sola imagen",
    ayuda: "Un post de una sola pieza, sin deslizar.",
    formatos: ["4x5", "1x1"],
    slides: [1, 1],
  },
  historia: {
    etiqueta: "Historia",
    ayuda: "Vertical 9:16, para subir a historias.",
    formatos: ["9x16"],
    slides: [1, 3],
  },
  reel: {
    etiqueta: "Portada de reel",
    ayuda: "La portada 9:16 que sobrevive el recorte de la grilla.",
    formatos: ["reel"],
    slides: [1, 1],
  },
} as const satisfies Record<string, TipoPedido>;

export type TipoPedidoId = keyof typeof TIPOS_PEDIDO;

export function esTipoPedido(v: string): v is TipoPedidoId {
  return v in TIPOS_PEDIDO;
}

/** Cuántos posts se pueden pedir de una vez. */
export const CANTIDADES = ["auto", "1", "2", "3", "4"] as const;
export type CantidadPedido = (typeof CANTIDADES)[number];

/**
 * Tope duro de posts por pedido.
 *
 * No es capricho: cada post es un carrusel entero redactado, y el worker resuelve los
 * encargos de uno en uno con la suscripción. Un "hazme 20 posts" dejaría el puente
 * ocupado varios minutos y devolvería una bandeja imposible de revisar.
 */
export const MAX_POSTS = 4;

/** Largo máximo del pedido escrito. Suficiente para un brief; corta un pegote accidental. */
export const MAX_LARGO_PEDIDO = 800;

export function esCantidad(v: string): v is CantidadPedido {
  return (CANTIDADES as readonly string[]).includes(v);
}
