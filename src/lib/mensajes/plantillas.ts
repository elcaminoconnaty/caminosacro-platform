/**
 * Los textos de los mensajes que salen de la plataforma, en un solo sitio y editables
 * desde Configuración.
 *
 * El problema que resuelve: cada mensaje —el WhatsApp al peregrino, los dos correos a
 * Pilgrim— tenía sus frases escritas dentro del armador correspondiente. Cambiar "quedo
 * atento a cualquier duda" era abrir el código, compilar y desplegar. Ahora el armador
 * sigue decidiendo QUÉ datos van y en qué orden, pero las FRASES salen de acá, y lo que
 * se guarde en `comercial.settings.mensajes` manda sobre lo escrito en el código.
 *
 * Lo que NO se puede editar, a propósito: los bloques de datos (el listado del viaje, los
 * viajeros con su pasaporte, la tabla de tarifas). Los arma el código a partir del
 * expediente, y dejarlos sueltos en un textarea sería poder mandarle a Pilgrim una
 * reserva que dice otra cosa que la base de datos.
 *
 * Cómo funciona: cada mensaje es una lista de PIEZAS de texto con variables `{{asi}}`.
 * Configuración guarda solo las piezas que se hayan cambiado; el resto cae en el valor de
 * este archivo. Borrar una pieza en Configuración la devuelve a su texto original.
 *
 * Sin "server-only": lo leen el formulario de Configuración (cliente) y los armadores.
 */

export type Pieza = {
  id: string;
  /** Cómo se llama en pantalla. */
  etiqueta: string;
  /** Qué es y cuándo sale. Aparece bajo el campo. */
  ayuda?: string;
  /** Variables que puede usar esta pieza (sin llaves). */
  variables?: string[];
  /** Cuántas líneas pinta el campo. 1 = una sola línea. */
  filas?: number;
  /** El texto de fábrica. */
  valor: string;
};

export type PlantillaMensaje = {
  id: string;
  nombre: string;
  /** Dónde se usa, en palabras de quien lo manda. */
  donde: string;
  descripcion: string;
  piezas: Pieza[];
};

/** Overrides guardados en `settings.mensajes`: { [plantilla]: { [pieza]: texto } }. */
export type MensajesGuardados = Record<string, Record<string, string>>;

export const PLANTILLAS: PlantillaMensaje[] = [
  {
    id: "whatsapp_cotizacion",
    nombre: "WhatsApp — cotización al peregrino",
    donde: "Expediente → tarjeta «Mensaje de WhatsApp»",
    descripcion:
      "El mensaje con el que se le presenta la cotización a quien cotizó en la web y se quedó sin precio. Los bloques TU CAMINO y PRECIOS se arman solos con los datos del expediente.",
    piezas: [
      {
        id: "saludo",
        etiqueta: "Saludo",
        ayuda: "Si la cotización no tiene nombre del cliente, se usa «¡Hola!» a secas.",
        variables: ["nombre"],
        filas: 1,
        valor: "¡Hola {{nombre}}! 👋",
      },
      {
        id: "presentacion",
        etiqueta: "Presentación",
        ayuda: "El primer párrafo: quién escribe y por qué.",
        variables: ["asesor", "web", "ruta"],
        filas: 4,
        valor:
          "Soy {{asesor}}, de Camino Sacro ({{web}}). Vi que estuviste cotizando {{ruta}} en nuestra página y que no alcanzaste a ver los precios. Ya los tengo listos, así que acá te dejo todo 👇",
      },
      {
        id: "titulo_viaje",
        etiqueta: "Título del bloque del viaje",
        variables: [],
        filas: 1,
        valor: "*TU CAMINO*",
      },
      {
        id: "titulo_precios",
        etiqueta: "Título del bloque de precios",
        variables: [],
        filas: 1,
        valor: "*PRECIOS*",
      },
      {
        id: "correo",
        etiqueta: "Aviso del correo",
        ayuda: "Cuando la cotización tiene correo del cliente, se nombra la dirección.",
        variables: ["email"],
        filas: 2,
        valor:
          "Te mandé la cotización completa al correo ({{email}}) 📩 Ahí va el itinerario día a día, lo que incluye y las condiciones.",
      },
      {
        id: "correo_sin_direccion",
        etiqueta: "Aviso del correo (sin dirección)",
        ayuda: "El mismo aviso cuando el expediente no tiene el correo del cliente.",
        filas: 2,
        valor:
          "Te mandé la cotización completa por correo 📩 Ahí va el itinerario día a día, lo que incluye y las condiciones.",
      },
      {
        id: "enlace",
        etiqueta: "Invitación a abrir la cotización",
        ayuda:
          "El enlace corto de la cotización (caminosacro…/c/xxxxxxxxxx). Abre el PDF vigente y no caduca; si la cotización se corrige, el mismo enlace muestra la versión buena.",
        variables: ["enlace"],
        filas: 2,
        valor: "Para ver la cotización por aquí solo dale clic acá 👉 {{enlace}}",
      },
      {
        id: "adjunto",
        etiqueta: "Línea alternativa (sin enlace)",
        ayuda: "Respaldo: solo sale si el enlace no se pudo crear, y entonces toca adjuntar el PDF a mano.",
        filas: 2,
        valor: "Te la dejo también acá en el chat 📎",
      },
      {
        id: "cierre",
        etiqueta: "Cierre",
        filas: 3,
        valor:
          "Quedo atento a cualquier duda 😊 Si quieres la acomodamos a tu gusto: fechas, días de camino, tipo de alojamiento o extras (traslados, maletas, noches adicionales).",
      },
      {
        id: "firma",
        etiqueta: "Despedida",
        variables: ["asesor", "web"],
        filas: 3,
        valor: "¡Buen Camino! 🐚\n{{asesor}} — Camino Sacro\n{{web}}",
      },
    ],
  },
  {
    id: "pilgrim_precio",
    nombre: "Pilgrim — solicitud de precio",
    donde: "Seguimiento → panel «Leads sin precio» → Pedir precio a Pilgrim",
    descripcion:
      "Se les pide el precio de una salida cuyas tarifas todavía no están cargadas. El bloque DATOS DEL VIAJE lo arma el código, y nunca lleva el correo ni el teléfono del peregrino.",
    piezas: [
      {
        id: "asunto",
        etiqueta: "Asunto",
        ayuda: "Con referencia del lead. Sin ella se usa el asunto de abajo.",
        variables: ["ruta", "peregrino", "codigo"],
        filas: 1,
        valor: "{{ruta}} — {{peregrino}} | {{codigo}}",
      },
      {
        id: "asunto_sin_codigo",
        etiqueta: "Asunto (sin referencia)",
        variables: ["ruta", "peregrino"],
        filas: 1,
        valor: "{{ruta}} — {{peregrino}}",
      },
      {
        id: "saludo",
        etiqueta: "Saludo",
        ayuda: "Si hay persona de contacto en «Proveedor Pilgrim», se usa este.",
        variables: ["contacto"],
        filas: 1,
        valor: "Hola {{contacto}},",
      },
      {
        id: "saludo_sin_contacto",
        etiqueta: "Saludo (sin persona de contacto)",
        variables: ["proveedor"],
        filas: 1,
        valor: "Hola {{proveedor}},",
      },
      {
        id: "intro",
        etiqueta: "Por qué se les escribe",
        variables: ["anio"],
        filas: 3,
        valor:
          "Tenemos una solicitud para {{anio}} y todavía no tenemos vuestras tarifas de ese año,\nasí que os pedimos el precio de esta salida en concreto.",
      },
      {
        id: "cierre",
        etiqueta: "Cierre",
        filas: 3,
        valor:
          "Cuando lo tengamos le pasamos la cotización al peregrino. Si hay que cerrar plazas\nantes, decídnoslo y lo gestionamos.",
      },
      {
        id: "firma",
        etiqueta: "Despedida",
        variables: ["firmante"],
        filas: 3,
        valor: "Gracias,\n{{firmante}}\nCamino Sacro — reservas@caminosacro.com",
      },
    ],
  },
  {
    id: "pilgrim_reserva",
    nombre: "Pilgrim — reserva y link de pago",
    donde: "Expediente → tarjeta «Correo a Pilgrim»",
    descripcion:
      "Confirma la reserva a precios de Pilgrim y pide el link de pago. Los bloques DATOS DEL VIAJE, VIAJEROS y SERVICIOS Y TARIFAS los arma el código con el expediente: el TOTAL A PAGAR es el mismo número que el KPI «Costo Pilgrim».",
    piezas: [
      {
        id: "asunto",
        etiqueta: "Asunto",
        ayuda: "Si la cotización ya tiene referencia de Pilgrim, se agrega sola al final (« · Ref. Pilgrim 47397»), salvo que la uses aquí con {{referencia_pilgrim}}.",
        variables: ["codigo", "ruta", "fecha", "personas", "peregrinos", "referencia_pilgrim"],
        filas: 1,
        valor: "Reserva {{codigo}} — {{ruta}} — salida {{fecha}} — {{personas}} {{peregrinos}}",
      },
      {
        id: "saludo",
        etiqueta: "Saludo",
        ayuda: "Si hay persona de contacto en «Proveedor Pilgrim», se usa su nombre.",
        variables: ["contacto"],
        filas: 1,
        valor: "Hola {{contacto}},",
      },
      {
        id: "saludo_sin_contacto",
        etiqueta: "Saludo (sin persona de contacto)",
        variables: ["proveedor"],
        filas: 1,
        valor: "Hola {{proveedor}},",
      },
      {
        id: "intro",
        etiqueta: "Primera línea",
        filas: 2,
        valor: "Confirmamos la siguiente reserva y quedamos atentos al link de pago.",
      },
      {
        id: "titulo_datos",
        etiqueta: "Título — datos del viaje",
        filas: 1,
        valor: "DATOS DEL VIAJE",
      },
      {
        id: "titulo_viajeros",
        etiqueta: "Título — viajeros",
        filas: 1,
        valor: "VIAJEROS",
      },
      {
        id: "titulo_tarifas",
        etiqueta: "Título — tarifas",
        filas: 1,
        valor: "SERVICIOS Y TARIFAS (precios Pilgrim)",
      },
      {
        id: "adjuntos_uno",
        etiqueta: "Aviso de pasaportes (uno)",
        filas: 2,
        valor: "Adjuntamos el pasaporte del viajero.",
      },
      {
        id: "adjuntos_varios",
        etiqueta: "Aviso de pasaportes (varios)",
        variables: ["cuantos"],
        filas: 2,
        valor: "Adjuntamos los {{cuantos}} pasaportes de los viajeros.",
      },
      {
        id: "adjuntos_ninguno",
        etiqueta: "Aviso de pasaportes (ninguno)",
        filas: 2,
        valor: "Los pasaportes se los enviamos en cuanto los tengamos.",
      },
      {
        id: "pendientes",
        etiqueta: "Pasaportes que faltan",
        ayuda: "Solo sale si algún viajero todavía no tiene pasaporte cargado.",
        variables: ["lista"],
        filas: 2,
        valor: "Pendientes de pasaporte: {{lista}}.",
      },
      {
        id: "cierre",
        etiqueta: "Petición del link de pago",
        filas: 2,
        valor: "Por favor envíennos el link de pago para realizar la transferencia.",
      },
      {
        id: "firma",
        etiqueta: "Despedida",
        variables: ["firmante"],
        filas: 3,
        valor: "Gracias,\n{{firmante}}\nCamino Sacro — reservas@caminosacro.com",
      },
    ],
  },
];

export function plantilla(id: string): PlantillaMensaje | undefined {
  return PLANTILLAS.find((p) => p.id === id);
}

/**
 * Los textos vigentes de un mensaje: lo guardado en Configuración, y para cada pieza que
 * nadie haya tocado (o que se haya dejado vacía), el texto de fábrica.
 *
 * Una pieza en blanco cae en el valor original a propósito: vaciar el campo es lo que
 * hace cualquiera para "quitar esto", y lo que quitaría de verdad es media frase de un
 * correo a un proveedor. Para que una pieza no salga, el armador tiene su propia regla
 * (un enlace que no existe, un pasaporte que falta); no la deja en manos de un espacio.
 */
export function textosDe(id: string, guardados?: MensajesGuardados | null): Record<string, string> {
  const def = plantilla(id);
  const overrides = guardados?.[id] ?? {};
  const out: Record<string, string> = {};
  for (const pieza of def?.piezas ?? []) {
    const propio = String(overrides[pieza.id] ?? "").trim();
    out[pieza.id] = propio || pieza.valor;
  }
  return out;
}

/** Los textos de fábrica de un mensaje, sin mirar lo guardado. */
export function textosDeFabrica(id: string): Record<string, string> {
  return textosDe(id, null);
}
