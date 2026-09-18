/**
 * Los leads del cotizador de la web que se quedaron SIN PRECIO (`comercial.web_leads`,
 * migración 0035): el año de salida no tiene tarifas cargadas, o la ruta se arma a medida.
 *
 * Este módulo es lo compartido entre quien los escribe (`/api/wp/lead`) y quien los
 * muestra (el panel de Seguimiento), para que la idea de "esto es el mismo lead dos veces"
 * sea una sola en los dos lados.
 *
 * Sin `server-only` a propósito: `LeadsPanel` es un componente de cliente y usa las
 * etiquetas y el agrupado. Nada de lo que hay aquí toca la base ni lee secretos.
 */

export type MotivoLead = "sin_tarifas_ano" | "a_medida";

export type WebLead = {
  id: string;
  created_at: string;
  code: string | null;
  motivo: string;
  route_slug: string;
  route_name: string | null;
  tipo: string;
  start_date: string;
  people: number;
  full_name: string;
  email: string;
  phone: string;
  marketing_optin: boolean;
  email_sent: boolean | null;
  atendido_at: string | null;
  atendido_nota: string | null;
};

export const MOTIVO_LABEL: Record<string, string> = {
  sin_tarifas_ano: "Sin tarifas del año",
  a_medida: "Ruta a medida",
};

export const MOTIVO_EXPLICACION: Record<string, string> = {
  sin_tarifas_ano:
    "El año de salida no tiene tarifas cargadas para esa ruta y alojamiento. Cargalas en el catálogo y la web lo cotiza sola.",
  a_medida: "La ruta no tiene tarifa publicada: hay que armarla a mano y registrarla acá.",
};

export const TIPO_LABEL: Record<string, string> = { pension: "Pensión", hotel: "Hotel" };

export function motivoLabel(motivo: string): string {
  return MOTIVO_LABEL[motivo] ?? motivo;
}

export function tipoLabel(tipo: string): string {
  return TIPO_LABEL[tipo] ?? tipo;
}

/**
 * Qué hace que dos filas sean "la misma solicitud": la persona y el viaje que pidió.
 * Ni el código ni la hora entran, que es justo lo que cambia entre un envío y su repetido.
 *
 * El correo se normaliza porque el visitante lo teclea, y el teléfono queda fuera por lo
 * mismo (el 573105385516 y el 3105385516 de la misma persona no pueden partir el grupo).
 */
export function claveLead(l: {
  email: string;
  route_slug: string;
  tipo: string;
  start_date: string;
  people: number;
  motivo: string;
}): string {
  return [
    l.email.trim().toLowerCase(),
    l.route_slug,
    l.tipo,
    l.start_date,
    String(l.people),
    l.motivo,
  ].join("|");
}

/**
 * Ventana en la que un lead idéntico se considera el mismo envío y no uno nuevo.
 *
 * Los tres casos reales de la base son de 3 a 6 segundos (doble clic en el botón del
 * cotizador, o el reintento de WordPress). Diez minutos deja margen de sobra para eso y
 * sigue siendo corta para lo otro: quien vuelve al día siguiente a preguntar por la misma
 * fecha SÍ es un lead nuevo y tiene que volver a aparecer.
 */
export const VENTANA_LEAD_REPETIDO_MS = 10 * 60 * 1000;

export type GrupoLead = {
  /** La fila más reciente del grupo: la que se pinta. */
  lead: WebLead;
  /** Todas las filas del grupo, la más reciente primero. Marcar atendido las cierra todas. */
  ids: string[];
  /** Cuántas veces llegó la misma solicitud. 1 en el caso normal. */
  veces: number;
};

/**
 * Agrupa los envíos repetidos en una sola línea.
 *
 * No borra nada: las filas siguen en la base —son el registro de lo que pasó y la cifra de
 * demanda que la tabla existe para poder contar—, pero la bandeja de Nico no tiene por qué
 * enseñarle a Hugo dos veces porque el botón se pulsó dos veces.
 */
export function agruparLeads(leads: WebLead[]): GrupoLead[] {
  const ordenados = [...leads].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const grupos = new Map<string, GrupoLead>();
  for (const l of ordenados) {
    // Un pendiente y uno ya atendido no se juntan aunque sean la misma solicitud: si
    // alguien vuelve a escribir después de que se cerró el suyo, eso es trabajo nuevo.
    const k = `${l.atendido_at ? "atendido" : "pendiente"}|${claveLead(l)}`;
    const previo = grupos.get(k);
    // El primero que entra es el más reciente (la lista viene ordenada), así que el
    // representante no se cambia nunca: solo se le suman los ids de los repetidos.
    if (previo) {
      previo.ids.push(l.id);
      previo.veces += 1;
    } else {
      grupos.set(k, { lead: l, ids: [l.id], veces: 1 });
    }
  }
  return [...grupos.values()];
}
