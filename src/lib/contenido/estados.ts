/**
 * Los estados por los que pasa una pieza, en el orden en que ocurren de verdad.
 *
 * Vive aparte de las acciones porque lo usan la bandeja y el editor, y un archivo con
 * `"use server"` solo puede exportar funciones async — exportar una constante desde ahí ya
 * tumbó esta pantalla una vez (ver `src/lib/contenido/arranques.ts`).
 */
export const ESTADOS_PIEZA = ["borrador", "listo", "programado", "publicando", "publicado", "archivado"] as const;
export type EstadoPiezaId = (typeof ESTADOS_PIEZA)[number];

/**
 * Los que una persona puede poner a mano desde la bandeja o el editor. `programado` y
 * `publicando` los ponen las acciones de programar y el cron: marcar "programado" a
 * dedo dejaría una pieza sin fecha que el cron nunca tomaría.
 */
export const ESTADOS_MANUALES: readonly EstadoPiezaId[] = ["borrador", "listo", "publicado", "archivado"];

/**
 * Los botones del editor. "Publicado" no está: al lado de «Aprobar y programar» se
 * confundía con aprobar, y una pieza marcada así a mano luego decía "ya se publicó".
 * Marcar publicado a mano (subida por fuera) sigue en el desplegable de la bandeja.
 */
export const ESTADOS_EDITOR: readonly EstadoPiezaId[] = ["borrador", "listo", "archivado"];

export const ESTADO: Record<EstadoPiezaId, { etiqueta: string; ayuda: string; clase: string }> = {
  borrador: {
    etiqueta: "Borrador",
    ayuda: "Se está armando. No sale en ningún lado.",
    clase: "bg-taupe text-muted",
  },
  listo: {
    etiqueta: "Listo para publicar",
    ayuda: "Terminado y revisado, esperando su turno.",
    clase: "bg-dorado text-bosque",
  },
  programado: {
    etiqueta: "Programado",
    ayuda: "Tiene fecha y hora. El cron la publica sola cuando llegue.",
    clase: "bg-bosque-medio text-white",
  },
  publicando: {
    etiqueta: "Publicando…",
    ayuda: "Hablando con Instagram en este momento.",
    clase: "bg-dorado-oscuro text-bosque",
  },
  publicado: {
    etiqueta: "Publicado",
    ayuda: "Ya salió en Instagram.",
    clase: "bg-bosque text-white",
  },
  archivado: {
    etiqueta: "Archivado",
    ayuda: "Se guarda pero desaparece de la bandeja.",
    clase: "bg-taupe/50 text-muted",
  },
};

export function esEstadoPieza(v: string): v is EstadoPiezaId {
  return (ESTADOS_PIEZA as readonly string[]).includes(v);
}
