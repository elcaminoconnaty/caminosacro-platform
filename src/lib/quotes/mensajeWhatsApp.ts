/**
 * El mensaje de WhatsApp con el que se le presenta la cotización al peregrino.
 *
 * Por qué existe: hay gente que cotiza en caminosacro.com y la web no puede darle una
 * cifra (ruta sin tarifas de ese año, alojamiento que hay que consultar). A esa persona se
 * le pide el precio a Pilgrim, se le llena el expediente y después se le escribe POR
 * WHATSAPP, porque es donde contesta. Hasta ahora ese mensaje se escribía de cero cada
 * vez: media hora de redacción por peregrino y un texto distinto cada día.
 *
 * Tres cosas que el texto tiene que hacer sí o sí, y por eso están acá y no en la cabeza
 * de quien escribe:
 *
 *   1. Presentarse. Al peregrino le llega un número desconocido: si el primer renglón no
 *      dice quién es y de dónde salió el contacto, es un mensaje más de un vendedor.
 *   2. Dar los datos de SU cotización. No un "te paso información": la ruta, la fecha, la
 *      gente y la plata, que es lo que va a mirar.
 *   3. Decir que la cotización completa ya salió por correo y que además va adjunta en el
 *      chat. El PDF se arrastra a mano en WhatsApp; el mensaje solo lo anuncia.
 *
 * Vive fuera de "server-only" a propósito: la tarjeta del expediente lo vuelve a armar en
 * el navegador cuando se cambia un dato, y el texto tiene que ser el mismo en los dos lados.
 *
 * Lo que sale de acá es un BORRADOR. En la tarjeta se edita antes de mandarlo: cada
 * peregrino llega con su propia conversación y no hay plantilla que le sirva a todos.
 */

import { leerFilasHabitacion, personasDeFila, roomRowLabel, type RoomRow } from "@/lib/quotes/rooms";

const MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * "3 de mayo de 2027". Se ancla a medianoche LOCAL, igual que `fechaCorta` de
 * @/lib/format y por la misma razón: `new Date("2027-05-03")` es medianoche UTC y en
 * Bogotá eso es el día anterior. Una salida corrida un día en un mensaje al cliente es
 * una llamada preguntando qué pasó.
 */
function fechaLarga(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getDate()} de ${MES[dt.getMonth()]} de ${dt.getFullYear()}`;
}

/** Los euros como los lee el cliente: "1.040 €", sin céntimos. */
function eur(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

/**
 * El nombre de pila, presentable.
 *
 * Sirve para los dos lados del mensaje: el peregrino ("JUAN CARLOS PÉREZ" → "Juan") y
 * quien firma, que sale de `settings.firmantes` en mayúsculas sostenidas
 * ("NICOLÁS VILLA POSADA" → "Nicolás"). Un "Hola JUAN CARLOS PÉREZ" en WhatsApp se lee
 * como lo que sería: un envío masivo.
 */
export function nombrePila(nombre: string | null | undefined): string {
  const primero = String(nombre ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primero) return "";
  // La inicial siempre en mayúscula —la web recoge nombres tecleados en minúscula— y el
  // resto se baja SOLO si venía todo en mayúsculas, para no romper un "McDonald" ni un
  // "van Dijk" escritos bien.
  const resto = primero === primero.toUpperCase() ? primero.slice(1).toLowerCase() : primero.slice(1);
  return primero.charAt(0).toUpperCase() + resto;
}

export type DatosMensajeWhatsApp = {
  /** Nombre completo del cliente, como está en el expediente. */
  cliente: string | null;
  ruta: string | null;
  /** Desde dónde arranca la ruta en el catálogo ("Sarria"): el peregrino la reconoce así. */
  origen: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  dias: number | null;
  noches: number | null;
  personas: number;
  /** `quotes.modality`: "Pensión, habitación doble", "Hotel · 2 dobles + 1 triple"… */
  alojamiento: string | null;
  /** Lo que paga el grupo, todo incluido (`quotes.total_eur`). */
  totalEur: number;
  /** Reparto a medida con su precio por persona, si lo hay (`quotes.rooms_json.filas`). */
  habitaciones: RoomRow[];
  validoHasta: string | null;
  /** A qué correo salió la cotización. Se nombra para que el peregrino la busque. */
  emailCliente: string | null;
  /** Versión web del correo que se le envió (/correo/[token]), si ya salió. */
  enlaceCotizacion: string | null;
  /** Quién escribe: nombre de pila del firmante de Camino Sacro. */
  asesor: string;
  /** La página, tal como se dice en voz alta: "www.caminosacro.com". */
  web: string;
};

/**
 * El precio, en las palabras del cliente.
 *
 * Con reparto a medida se lista habitación por habitación, porque ahí no hay UN precio por
 * persona: quien va en individual paga otra cosa que quien va en doble, y promediarlos
 * sería decirle a los dos una cifra que ninguno paga (la misma regla de la migración 0038:
 * lo que se teclea es por persona, y así se comunica).
 */
function renglonesPrecio(d: DatosMensajeWhatsApp): string[] {
  const out: string[] = [];
  const personas = Math.max(1, Math.round(d.personas) || 1);
  const conPrecio = d.habitaciones.filter((r) => r.precio_cs > 0 && personasDeFila(r) > 0);

  if (conPrecio.length > 0) {
    for (const r of conPrecio) {
      const gente = personasDeFila(r);
      out.push(`• ${roomRowLabel(r)}: ${eur(r.precio_cs)} por persona (${gente} ${gente === 1 ? "persona" : "personas"})`);
    }
  } else if (personas > 1 && d.totalEur > 0) {
    out.push(`• ${eur(d.totalEur / personas)} por persona`);
  }

  if (d.totalEur > 0) {
    out.push(
      personas > 1
        ? `• *Total ${personas} personas: ${eur(d.totalEur)}*`
        : `• *Total: ${eur(d.totalEur)}*`,
    );
  }
  return out;
}

export function mensajeWhatsAppCotizacion(d: DatosMensajeWhatsApp): string {
  const nombre = nombrePila(d.cliente);
  const saludo = nombre ? `Hola ${nombre} 👋` : "¡Hola! 👋";
  const asesor = d.asesor || "Nicolás";
  const web = d.web || "www.caminosacro.com";

  // "el Camino Francés desde Sarria". El origen va pegado al nombre porque es lo que la
  // persona escogió en el cotizador y lo que distingue dos cotizaciones de la misma ruta.
  const ruta = d.ruta
    ? d.origen
      ? `${d.ruta} desde ${d.origen}`
      : d.ruta
    : "";

  const duracion = d.dias
    ? `${d.dias} días${d.noches ? ` · ${d.noches} noches` : ""}`
    : "";

  const viaje = [
    ruta ? `• Ruta: ${ruta}` : "",
    d.fechaInicio ? `• Salida: ${fechaLarga(d.fechaInicio)}` : "",
    d.fechaFin ? `• Regreso: ${fechaLarga(d.fechaFin)}` : "",
    duracion ? `• Duración: ${duracion}` : "",
    d.personas ? `• Viajeros: ${d.personas} ${d.personas === 1 ? "persona" : "personas"}` : "",
    d.alojamiento ? `• Alojamiento: ${d.alojamiento}` : "",
  ].filter(Boolean);

  const precio = renglonesPrecio(d);

  // El correo se nombra con su dirección para que la persona sepa DÓNDE buscarlo: la
  // queja de siempre es "no me llegó nada", y casi siempre está en promociones o en un
  // correo que no es el que usa a diario.
  const correo = d.emailCliente
    ? `Te envié la cotización completa al correo (${d.emailCliente}), con el itinerario día a día, lo que incluye y las condiciones. Te la adjunto también acá en el chat para que la tengas a la mano 📎`
    : `Te envié la cotización completa por correo, con el itinerario día a día, lo que incluye y las condiciones. Te la adjunto también acá en el chat para que la tengas a la mano 📎`;

  const bloques = [
    saludo,
    `Soy ${asesor}, de Camino Sacro (${web}). Vimos que cotizaste${ruta ? ` el ${ruta}` : " el Camino"} en nuestra página y que el cotizador no alcanzó a mostrarte los precios, así que los confirmamos con nuestro operador en España. Acá te dejo toda la información:`,
    viaje.length ? `*TU CAMINO*\n${viaje.join("\n")}` : "",
    precio.length ? `*LA INVERSIÓN*\n${precio.join("\n")}` : "",
    d.validoHasta
      ? `Los precios están garantizados hasta el ${fechaLarga(d.validoHasta)}; después pueden cambiar según la disponibilidad de los alojamientos.`
      : "",
    correo,
    d.enlaceCotizacion ? `Y si prefieres verla en línea, sin descargar nada: ${d.enlaceCotizacion}` : "",
    "Cualquier duda me escribes por acá, con toda confianza. Si quieres la ajustamos a tu medida: fechas, días de camino, tipo de alojamiento o servicios extra (traslados, maletas, noches adicionales).",
    `¡Buen Camino! 🐚\n${asesor} — Camino Sacro\n${web}`,
  ];

  return bloques.filter(Boolean).join("\n\n");
}

/** Azúcar para la página: lee el reparto a medida de `rooms_json` sin repetir el import. */
export function habitacionesDeCotizacion(roomsJson: unknown): RoomRow[] {
  return leerFilasHabitacion(roomsJson);
}
