/**
 * La solicitud de precio a Pilgrim para un lead de la web que se quedó sin tarifa.
 *
 * Provisional, y por un motivo concreto: mientras 2027 no esté cargado en el catálogo,
 * cada lead de publicidad que pide 2027 llega sin cifra. En vez de esperar, se le pide a
 * Pilgrim el precio de ESA salida. Cuando las tarifas estén, el cotizador vuelve a
 * responder solo y esto deja de usarse.
 *
 * REGLA QUE MANDA SOBRE TODO LO DEMÁS: en este correo **no van el correo ni el teléfono
 * del peregrino**. Pilgrim es el proveedor del terreno, no el dueño de la relación
 * comercial: necesita saber a quién aloja y qué reservar, no cómo escribirle. El nombre
 * sí va —Pilgrim reserva a nombre de alguien—, el contacto no. Por eso el cuerpo se arma
 * acá, a partir de una lista cerrada de campos, y no volcando la fila de `web_leads`.
 *
 * Sin `server-only`: el panel arma el borrador editable y no hay nada que esconder acá.
 */

import { fechaCortaISO } from "@/lib/format";

/** Lo único del lead que sale hacia Pilgrim. Lo que no está en este tipo, no viaja. */
export type LeadParaPilgrim = {
  code: string | null;
  route_slug: string;
  route_name: string | null;
  tipo: string;
  start_date: string;
  people: number;
  full_name: string;
};

/**
 * Lo que se sabe de la ruta en el catálogo. Solo el tramo, y opcional: hay rutas sin
 * ficha completa.
 *
 * Ni días ni noches: la duración la pone Pilgrim, que es quien arma el itinerario. Un
 * "7 días · 6 noches" salido de NUESTRO catálogo en una petición de precio es decirle al
 * proveedor lo que tiene que ofrecer, y si su programa de ese año no coincide, el precio
 * vuelve cotizado sobre una duración que no era.
 */
export type RutaParaPilgrim = {
  origin?: string | null;
  destination?: string | null;
};

export type SolicitudPrecio = { subject: string; body: string };

const TIPO_LARGO: Record<string, string> = {
  pension: "Pensión / hostal",
  hotel: "Hotel",
};

/** "3 de mayo de 2027", sin pasar por Date (una `date` no tiene hora ni zona). */
function fechaLargaISO(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const [, y, mes, d] = m;
  return `${Number(d)} de ${meses[Number(mes) - 1] ?? mes} de ${y}`;
}

/**
 * El reparto de habitaciones: parejas en doble y el impar en individual.
 *
 * Es EXACTAMENTE la regla de `tarifarRuta` con `todosIndividuales: false`, que es como
 * cotiza el sitio. Tiene que coincidir: si a Pilgrim se le pide el precio de un reparto y
 * la web luego cotiza otro, el margen sale mal.
 */
export function repartoHabitaciones(personas: number): { dobles: number; individuales: number } {
  const dobles = Math.floor(personas / 2);
  return { dobles, individuales: personas - dobles * 2 };
}

export function textoHabitaciones(personas: number): string {
  const { dobles, individuales } = repartoHabitaciones(personas);
  const partes: string[] = [];
  // "habitaciones", sin tilde: el plural la pierde.
  if (dobles) partes.push(dobles === 1 ? "1 habitación doble" : `${dobles} habitaciones dobles`);
  if (individuales) partes.push(`${individuales} habitación individual`);
  return partes.join(" + ") || "—";
}

/**
 * Arma el correo. `firmante` es quien lo manda (va en la despedida); el resto sale del
 * lead y de la ficha de la ruta.
 */
export function armarSolicitudPrecio(
  lead: LeadParaPilgrim,
  ruta: RutaParaPilgrim | null,
  opciones?: { contacto?: string | null; firmante?: string | null },
): SolicitudPrecio {
  const rutaNombre = lead.route_name || lead.route_slug;
  const personas = Math.max(1, Number(lead.people) || 1);
  const alojamiento = TIPO_LARGO[lead.tipo] ?? lead.tipo;
  const anio = lead.start_date.slice(0, 4);

  const tramo = ruta?.origin
    ? `${ruta.origin} → ${ruta.destination || "Santiago de Compostela"}`
    : "";

  const datos = [
    ...(lead.code ? [`Referencia Camino Sacro:  ${lead.code}`] : []),
    `Peregrino:                ${lead.full_name}`,
    `Ruta:                     ${rutaNombre}${tramo ? ` (${tramo})` : ""}`,
    `Fecha de inicio:          ${fechaLargaISO(lead.start_date)}`,
    `Número de peregrinos:     ${personas}`,
    `Alojamiento:              ${alojamiento}`,
    `Habitaciones:             ${textoHabitaciones(personas)}`,
  ];

  const subject =
    `Solicitud de precio ${anio} — ${rutaNombre} — salida ${fechaCortaISO(lead.start_date)} — ` +
    `${personas} peregrino${personas === 1 ? "" : "s"}`;

  const saludo = opciones?.contacto?.trim() ? `Hola ${opciones.contacto.trim()},` : `Hola Pilgrim,`;

  const body = [
    saludo,
    ``,
    `Tenemos una solicitud para ${anio} y todavía no tenemos vuestras tarifas de ese año,`,
    `así que os pedimos el precio de esta salida en concreto.`,
    ``,
    `DATOS DEL VIAJE`,
    ...datos,
    ``,
    `Cuando lo tengamos le pasamos la cotización al peregrino. Si hay que cerrar plazas`,
    `antes, decídnoslo y lo gestionamos.`,
    ``,
    `Gracias,`,
    opciones?.firmante?.trim() || `Nicolás Villa Posada`,
    `Camino Sacro — reservas@caminosacro.com`,
  ].join("\n");

  return { subject, body };
}

/**
 * Red de seguridad: ningún dato de contacto del peregrino puede acabar en el correo.
 *
 * El cuerpo es editable antes de enviarlo, así que la regla no puede vivir solo en el
 * armador de arriba: un copiar-pegar apresurado dentro del textarea la saltaría. Esto
 * corre en el servidor, justo antes del envío, sobre el texto que de verdad se manda.
 */
export function fugaDeContacto(texto: string, lead: { email: string; phone: string }): string | null {
  const plano = texto.toLowerCase();
  if (lead.email && plano.includes(lead.email.trim().toLowerCase())) {
    return "el correo del peregrino";
  }
  // El teléfono se compara por dígitos: en el texto puede ir con espacios, guiones o +57,
  // así que se buscan los dígitos del texto seguidos, sin separadores.
  //
  // El mínimo de 9 no es capricho: pegando todos los dígitos del cuerpo se juntan cosas
  // que no iban juntas (un "2027" con un "0009" de la referencia), y con secuencias
  // cortas eso dispara falsos positivos que bloquearían un envío legítimo. Un móvil real
  // tiene 10, así que a 9 el choque por casualidad deja de ser una preocupación.
  const digitos = lead.phone.replace(/\D/g, "");
  if (digitos.length >= 9) {
    const digitosTexto = texto.replace(/\D/g, "");
    // Sin indicativo también cuenta: 573105385516 y 3105385516 son el mismo teléfono.
    const sinIndicativo = digitos.length > 10 ? digitos.slice(-10) : digitos;
    if (digitosTexto.includes(digitos) || digitosTexto.includes(sinIndicativo)) {
      return "el teléfono del peregrino";
    }
  }
  return null;
}
