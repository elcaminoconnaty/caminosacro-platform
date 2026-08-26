/**
 * Los estados por los que pasa una pieza, en el orden en que ocurren de verdad.
 *
 * Vive aparte de las acciones porque lo usan la bandeja y el editor, y un archivo con
 * `"use server"` solo puede exportar funciones async — exportar una constante desde ahí ya
 * tumbó esta pantalla una vez (ver `src/lib/contenido/arranques.ts`).
 */
export const ESTADOS_PIEZA = ["borrador", "listo", "publicado", "archivado"] as const;
export type EstadoPiezaId = (typeof ESTADOS_PIEZA)[number];

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
