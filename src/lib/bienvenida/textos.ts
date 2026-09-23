/**
 * Los textos de la carta de bienvenida.
 *
 * Viven en `comercial.settings` (clave `carta_bienvenida`) y se editan en Configuración.
 * Lo de este archivo son los textos DE FÁBRICA: los que traían las cartas hechas a mano
 * (Francés desde Sarria y Portugués desde Tui, palabra por palabra) más un párrafo con el
 * mismo tono para cada familia de ruta. Si la clave no está guardada, o le falta algo, se
 * usa lo de acá: una carta con el texto de siempre es mejor que una que no se genera.
 *
 * Los párrafos de la ruta son plantillas: `{km}` → "112 km" y `{etapas}` → "6 etapas",
 * contados sobre el itinerario de la cotización para que el párrafo no contradiga la
 * tabla de abajo. Vive fuera de "server-only" porque el formulario de Configuración
 * también lo usa.
 */

export type DatosRuta = {
  /** `routes.family`: Francés, Portugués, Costero, Norte, Primitivo, Inglés, Fisterra. */
  familia: string | null;
  /** `routes.name` o, si la ruta no está en el catálogo, `quotes.route_name`. */
  nombre: string | null;
  /** Pueblo donde empieza a caminar: la primera etapa del itinerario, o el catálogo. */
  origen: string | null;
  enBici: boolean;
  km: number;
  etapas: number;
};

/** Qué párrafo de ruta le toca a cada cotización, en el orden en que se muestran. */
export const INTROS = [
  { id: "frances_sarria", etiqueta: "Francés desde Sarria" },
  { id: "frances", etiqueta: "Francés (desde cualquier otro pueblo)" },
  { id: "portugues_tui", etiqueta: "Portugués desde Tui" },
  { id: "portugues", etiqueta: "Portugués (desde cualquier otro pueblo)" },
  { id: "costero", etiqueta: "Portugués por la Costa" },
  { id: "norte", etiqueta: "Camino del Norte" },
  { id: "primitivo", etiqueta: "Camino Primitivo" },
  { id: "ingles", etiqueta: "Camino Inglés" },
  { id: "fisterra", etiqueta: "Camino a Fisterra" },
  { id: "otra", etiqueta: "Cualquier otra ruta" },
] as const;
export type IntroId = (typeof INTROS)[number]["id"];

export type TextosCarta = {
  /** El párrafo blanco de la portada. */
  portada: string;
  intros: Record<IntroId, string>;
  pasos: Array<{ titulo: string; texto: string }>;
  tips: Array<{ titulo: string; items: string[] }>;
  contacto: { texto: string; whatsapp: string; web: string };
  firma: { nombres: string; sub: string };
};

export const TEXTOS_CARTA_DEFAULT: TextosCarta = {
  portada:
    "Estamos muy contentos de que hayas decidido dar este paso. A partir de ahora, nosotros nos encargamos de todo para que tú solo tengas que caminar.",
  intros: {
    frances_sarria:
      "Vas a recorrer los últimos {km} del Camino más famoso del mundo. En {etapas} atravesarás los paisajes más emblemáticos de Galicia — bosques de eucaliptos, aldeas de piedra, viñedos y caminos empedrados — hasta llegar a la Plaza del Obradoiro y ver las torres de la Catedral de Santiago por primera vez.",
    frances:
      "Vas a recorrer {km} del Camino más famoso del mundo. En {etapas} cruzarás pueblos con siglos de historia, aldeas de piedra y caminos que han pisado millones de peregrinos antes que tú, hasta llegar a la Plaza del Obradoiro y ver las torres de la Catedral de Santiago por primera vez.",
    portugues_tui:
      "Vas a recorrer {km} desde la frontera con Portugal hasta Santiago de Compostela. Un camino más tranquilo e íntimo que el Francés, cruzando la Galicia interior por pueblos con encanto, puentes medievales y paisajes verdes que te acompañarán en cada etapa.",
    portugues:
      "Vas a recorrer {km} del Camino Portugués hasta Santiago de Compostela. Un camino más tranquilo e íntimo que el Francés, por pueblos con encanto, puentes medievales y paisajes verdes que te acompañarán en cada etapa.",
    costero:
      "Vas a recorrer {km} del Camino Portugués por la Costa hasta Santiago de Compostela. En {etapas} caminarás junto al Atlántico, entre playas, pueblos de pescadores y paseos marítimos, antes de adentrarte en la Galicia verde que te llevará hasta la Plaza del Obradoiro.",
    norte:
      "Vas a recorrer {km} del Camino del Norte hasta Santiago de Compostela. Un camino sereno y menos transitado que en {etapas} atraviesa la Galicia rural de prados, bosques y aldeas, hasta llegar a la Plaza del Obradoiro y ver las torres de la Catedral por primera vez.",
    primitivo:
      "Vas a recorrer {km} del Camino Primitivo, el más antiguo de todos: la ruta que siguió el rey Alfonso II en el siglo IX. Entre montañas, bosques y aldeas de piedra, en {etapas} llegarás a la Plaza del Obradoiro y verás las torres de la Catedral de Santiago por primera vez.",
    ingles:
      "Vas a recorrer {km} del Camino Inglés, la ruta de los peregrinos que llegaban por mar a los puertos de Ferrol y A Coruña. En {etapas} cruzarás rías, bosques y pueblos gallegos hasta llegar a la Plaza del Obradoiro y ver las torres de la Catedral de Santiago.",
    fisterra:
      "Vas a recorrer {km} desde Santiago de Compostela hasta Fisterra, el lugar que durante siglos se creyó el fin del mundo. En {etapas} cruzarás la Galicia más auténtica hasta llegar al faro y ver el sol ponerse sobre el Atlántico.",
    otra:
      "Vas a recorrer {km} en {etapas} hasta Santiago de Compostela, por caminos, pueblos y paisajes que te acompañarán en cada paso hasta llegar a la Plaza del Obradoiro.",
  },
  pasos: [
    {
      titulo: "1. Completar el pago",
      texto:
        "Para garantizar tu reserva, el saldo pendiente debe estar abonado máximo 45 días antes de la fecha de inicio de tu viaje. Te enviaremos un recordatorio con las instrucciones de pago.",
    },
    {
      titulo: "2. Documentación de viaje",
      texto:
        "30 días antes de tu fecha de salida te enviaremos por email tu documentación completa: póliza de seguro, datos de cada alojamiento con dirección y teléfono, hoja de ruta detallada con etapas y puntos de interés, y tu credencial del peregrino.",
    },
    {
      titulo: "3. Envío de datos personales",
      texto:
        "Necesitamos que nos envíes de cada integrante del viaje: foto o copia del pasaporte, nombre completo, número de identidad y número de teléfono de contacto.",
    },
  ],
  tips: [
    {
      titulo: "Documentación",
      items: [
        "Pasaporte vigente con mínimo 6 meses antes del vencimiento.",
        "Verifica los requisitos de entrada a España según tu nacionalidad. Cada país tiene condiciones distintas — es tu responsabilidad confirmar si necesitas visa o algún trámite adicional.",
        "Tarjeta de asistencia médica internacional. Tu seguro de viaje con nosotros cubre emergencias, pero una tarjeta adicional no está de más.",
        "Copia digital de tu pasaporte guardada en el celular o en la nube.",
        "Tarjeta de crédito o débito internacional habilitada para uso en Europa.",
      ],
    },
    {
      titulo: "Equipaje",
      items: [
        "Maleta o mochila grande (máx. 15 kg) — nosotros la trasladamos entre etapas, tú no la cargas.",
        "Mochila de día pequeña (5-7 litros) — solo para agua, snacks, protector solar y lo esencial de la jornada.",
        "Empaca liviano: 2-3 mudas de ropa técnica de secado rápido son suficientes. Hay lavanderías en casi todas las paradas.",
      ],
    },
    {
      titulo: "Calzado",
      items: [
        "Botas o zapatos de trekking ya usados y amoldados a tu pie — nunca estrenes calzado en el Camino.",
        "Un par de sandalias o zapatos cómodos para las noches.",
        "Calcetines técnicos sin costuras (lleva al menos 3 pares) — tus pies te lo agradecerán.",
        "Vaselina o crema anti-ampollas para aplicar cada mañana antes de salir.",
      ],
    },
    {
      titulo: "Otros esenciales",
      items: [
        "Chubasquero o poncho impermeable — en Galicia puede llover cualquier día del año.",
        "Protector solar y gorra — incluso en días nublados.",
        "Bastones de trekking (opcionales pero muy recomendados, especialmente en bajadas).",
        "Botella de agua reutilizable — hay fuentes a lo largo del camino.",
        "Cargador portátil para el celular.",
      ],
    },
  ],
  contacto: {
    texto: "Escríbele a Nico directamente:",
    whatsapp: "+57 300 491 0929",
    web: "www.caminosacro.com",
  },
  firma: { nombres: "Naty y Nico", sub: "Camino Sacro · Agencia del Camino de Santiago" },
};

const txt = (v: unknown, def: string) => (typeof v === "string" && v.trim() ? v : def);

/**
 * Lo guardado en settings → textos completos. Campo vacío o ausente = el de fábrica; las
 * listas (pasos, tips) se toman enteras si traen algo, porque borrar un tip es una
 * decisión y no hay que "rellenarlo" con el de fábrica.
 */
export function mezclarTextosCarta(guardado: unknown): TextosCarta {
  const g = (guardado && typeof guardado === "object" ? guardado : {}) as Partial<Record<keyof TextosCarta, unknown>>;
  const d = TEXTOS_CARTA_DEFAULT;
  const intros = (g.intros ?? {}) as Partial<Record<IntroId, unknown>>;
  const contacto = (g.contacto ?? {}) as Partial<Record<keyof TextosCarta["contacto"], unknown>>;
  const firma = (g.firma ?? {}) as Partial<Record<keyof TextosCarta["firma"], unknown>>;

  const pasos = Array.isArray(g.pasos)
    ? (g.pasos as Array<{ titulo?: unknown; texto?: unknown }>)
        .map((p) => ({ titulo: txt(p?.titulo, ""), texto: txt(p?.texto, "") }))
        .filter((p) => p.titulo || p.texto)
    : [];
  const tips = Array.isArray(g.tips)
    ? (g.tips as Array<{ titulo?: unknown; items?: unknown }>)
        .map((t) => ({
          titulo: txt(t?.titulo, ""),
          items: Array.isArray(t?.items) ? (t.items as unknown[]).map((i) => txt(i, "")).filter(Boolean) : [],
        }))
        .filter((t) => t.titulo || t.items.length > 0)
    : [];

  return {
    portada: txt(g.portada, d.portada),
    intros: Object.fromEntries(INTROS.map(({ id }) => [id, txt(intros[id], d.intros[id])])) as Record<IntroId, string>,
    pasos: pasos.length > 0 ? pasos : d.pasos,
    tips: tips.length > 0 ? tips : d.tips,
    contacto: {
      texto: txt(contacto.texto, d.contacto.texto),
      whatsapp: txt(contacto.whatsapp, d.contacto.whatsapp),
      web: txt(contacto.web, d.contacto.web),
    },
    firma: { nombres: txt(firma.nombres, d.firma.nombres), sub: txt(firma.sub, d.firma.sub) },
  };
}

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** "Camino Francés desde Sarria", "Camino Primitivo en bici desde Oviedo"… */
export function tituloRuta(r: DatosRuta): string {
  const f = norm(r.familia);
  const bici = r.enBici ? " en bici" : "";
  const desde = r.origen ? ` desde ${r.origen}` : "";

  if (f === "fisterra") return "Camino a Fisterra";
  const camino =
    f === "frances" ? "Camino Francés"
    : f === "portugues" ? (norm(r.nombre).includes("espiritual") ? "Camino Portugués · Variante Espiritual" : "Camino Portugués")
    : f === "costero" ? "Camino Portugués por la Costa"
    : f === "norte" ? "Camino del Norte"
    : f === "primitivo" ? "Camino Primitivo"
    : f === "ingles" ? "Camino Inglés"
    : null;

  if (camino) return `${camino}${bici}${desde}`;
  // Familia desconocida: el nombre de la ruta tal cual, sin inventar.
  return r.nombre?.trim() || "Camino de Santiago";
}

/** Qué plantilla de párrafo le corresponde a esta ruta. */
export function introDeRuta(r: DatosRuta): IntroId {
  const f = norm(r.familia);
  const o = norm(r.origen);
  if (f === "frances") return o === "sarria" ? "frances_sarria" : "frances";
  if (f === "portugues") return o === "tui" ? "portugues_tui" : "portugues";
  if (f === "costero" || f === "norte" || f === "primitivo" || f === "ingles" || f === "fisterra") return f;
  return "otra";
}

/** El párrafo de "TU RUTA", con los km y las etapas de este itinerario. */
export function introRuta(r: DatosRuta, textos: TextosCarta = TEXTOS_CARTA_DEFAULT): string {
  return textos.intros[introDeRuta(r)]
    .replaceAll("{km}", `${Math.round(r.km)} km`)
    .replaceAll("{etapas}", `${r.etapas} ${r.etapas === 1 ? "etapa" : "etapas"}`);
}
