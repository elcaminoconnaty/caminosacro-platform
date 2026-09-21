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
import { renderTemplate } from "@/lib/emailTemplate";
import { textosDe, type MensajesGuardados } from "@/lib/mensajes/plantillas";
// `nombrePila` vive en @/lib/nombres y se reexporta acá porque la página del expediente
// la usa para el nombre del asesor; el mismo arreglo sirve a los dos.
import { nombrePila } from "@/lib/nombres";

export { nombrePila };

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
  /** A qué correo salió la cotización. Se nombra para que el peregrino la busque. */
  emailCliente: string | null;
  /** Versión web del correo que se le envió (/correo/[token]), si ya salió. */
  enlaceCotizacion: string | null;
  /** Quién escribe: nombre de pila del firmante de Camino Sacro. */
  asesor: string;
  /** La página, tal como se dice en voz alta: "www.caminosacro.com". */
  web: string;
  /** Lo que se haya cambiado del texto en Configuración. Sin esto, los textos de fábrica. */
  textos?: MensajesGuardados | null;
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

/** Sin tildes y en minúscula, para comparar nombres escritos de dos maneras. */
function plano(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Cómo se nombra la ruta delante del peregrino: "Camino Francés desde Sarria".
 *
 * Dos cosas que el catálogo no da hechas:
 *
 *   1. Los nombres están guardados SIN la palabra "Camino" ("Francés desde Sarria"), que
 *      en el CRM se entiende y en un WhatsApp a un desconocido no: "estuviste cotizando el
 *      Francés" no dice nada. Se antepone, quitándola antes por si alguna ruta ya la trae.
 *   2. La mitad de los nombres YA llevan el origen. Pegarle el `origin` del catálogo a
 *      todos producía "el Francés desde Sarria desde Sarria", que es lo que salió en la
 *      primera prueba con una cotización real (CS-2026-121).
 */
export function nombreRutaLargo(ruta: string | null, origen: string | null): string {
  const base = String(ruta ?? "").trim().replace(/^camino\s+/i, "");
  if (!base) return "";
  const org = String(origen ?? "").trim();
  const yaLoDice = org && plano(base).includes(plano(org));
  return `Camino ${base}${org && !yaLoDice ? ` desde ${org}` : ""}`;
}

export function mensajeWhatsAppCotizacion(d: DatosMensajeWhatsApp): string {
  // Las frases salen de Configuración (clave `mensajes`), con los textos de fábrica de
  // @/lib/mensajes/plantillas como respaldo. Lo que este armador decide es QUÉ datos van
  // y en qué orden; las palabras las pone Nico.
  const t = textosDe("whatsapp_cotizacion", d.textos);
  const nombre = nombrePila(d.cliente);
  const asesor = d.asesor || "Nicolás";
  const web = d.web || "www.caminosacro.com";

  const ruta = nombreRutaLargo(d.ruta, d.origen);

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

  // Sin nombre no hay a quién saludar: se manda el saludo sin el hueco del nombre en vez
  // de un "¡Hola ! 👋" con un espacio de más.
  const saludo = nombre
    ? renderTemplate(t.saludo, { nombre })
    : renderTemplate(t.saludo, { nombre: "" }).replace(/\s+([!¡,])/g, "$1").replace(/\s{2,}/g, " ").trim();

  // El correo se nombra con su dirección para que la persona sepa DÓNDE buscarlo: la
  // queja de siempre es "no me llegó nada", y casi siempre está en promociones o en un
  // correo que no es el que usa a diario.
  const correo = d.emailCliente
    ? renderTemplate(t.correo, { email: d.emailCliente })
    : t.correo_sin_direccion;

  // Cómo se ve la cotización desde el chat.
  //
  // Con enlace: se manda el enlace y no el PDF. Es el mismo correo que ya se le envió,
  // servido en /correo/[token]; se abre en el celular de un toque, no pesa nada y así
  // nadie tiene que bajar el archivo del CRM para arrastrarlo a WhatsApp.
  //
  // Sin enlace (el correo todavía no ha salido) queda la otra forma —adjuntar el PDF a
  // mano—, y eso es lo que dice el texto. Prometer un enlace que no existe sería mandar a
  // la persona a buscar algo que no le va a llegar.
  const verla = d.enlaceCotizacion
    ? renderTemplate(t.enlace, { enlace: d.enlaceCotizacion })
    : t.adjunto;

  const bloques = [
    saludo,
    renderTemplate(t.presentacion, { asesor, web, ruta: ruta ? `el ${ruta}` : "el Camino" }),
    viaje.length ? `${t.titulo_viaje}\n${viaje.join("\n")}` : "",
    precio.length ? `${t.titulo_precios}\n${precio.join("\n")}` : "",
    `${correo}\n${verla}`,
    t.cierre,
    renderTemplate(t.firma, { asesor, web }),
  ];

  return bloques.filter(Boolean).join("\n\n");
}

/** Azúcar para la página: lee el reparto a medida de `rooms_json` sin repetir el import. */
export function habitacionesDeCotizacion(roomsJson: unknown): RoomRow[] {
  return leerFilasHabitacion(roomsJson);
}
