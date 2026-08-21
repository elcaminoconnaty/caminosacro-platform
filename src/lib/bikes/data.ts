/**
 * Flota de bicicletas de alquiler — datos extraídos del dossier de Pilgrim
 * "Condiciones alquiler bicicletas actualizada" (junio 2026, 18 páginas) y de la
 * cotización C677157 (21-08-2026, Ponferrada → Santiago, 5 días).
 *
 * Este archivo es la FUENTE del seed (`scripts/seed_bicis.ts`), no la fuente de verdad en
 * runtime: una vez sembrado, manda `comercial.bikes` + `comercial.bike_prices`, que es
 * lo que la plataforma lee y lo que Nico edita desde /catalogo.
 *
 * Correspondencia gama Pilgrim ↔ modelo de la flota (el nombre del servicio en la
 * cotización de Pilgrim es lo que hay que pedirles al reservar):
 *
 *   Alquiler de Bicicletas MTB                            → Ridley Ignite A
 *   Alquiler de Bicicletas MTB de Carbono                 → Berria Bravo Sport
 *   Alquiler de Bicicletas MTB doble suspensión           → Lapierre Zesty TR 3.9
 *   Alquiler de Bicicletas MTB de Carbono y doble susp.   → Ridley Raft XC
 *   Alquiler de Bicicletas Gravel                         → Lapierre Crosshill 30
 *   Alquiler de Bicicletas EBike                          → Lapierre Overvolt HT 7.6
 *   Alquiler de Bicicletas EBike doble suspensión         → Haibike AllTrail 9 29
 *
 * OJO con el modelo: Pilgrim no garantiza el modelo concreto. Sus condiciones generales
 * dicen que enviarán una bicicleta de gama equivalente según la talla disponible. Por eso
 * lo que se cotiza y se le vende al peregrino es la GAMA (`category_label`), y el modelo
 * va como referencia. El catálogo comercial lo dice explícitamente.
 */

export type BikeSpec = { label: string; value: string };

export type BikeSeed = {
  slug: string;
  position: number;
  /** Modelo concreto de la flota. */
  name: string;
  /** Gama: es lo que Pilgrim factura y lo que de verdad se contrata. */
  category_label: string;
  /** Nombre literal del servicio en la cotización de Pilgrim. */
  pilgrim_service: string;
  /** Frase corta para la tarjeta y el resumen. */
  tagline: string;
  /** Párrafo comercial (reescrito con voz Camino Sacro, sin marca Pilgrim). */
  description: string;
  /** Para quién es. Una línea. */
  ideal_para: string;
  sizes: string[];
  sizes_note: string | null;
  wheels: string[];
  /** Capacidad de alforjas admitida. */
  luggage: string;
  specs: BikeSpec[];
  /** Solo eléctricas. */
  motor: { motor: string; pantalla: string; bateria: string } | null;
  /** Archivo dentro de src/lib/bikes/. */
  photo: string;
  /** true = lleva cargador de batería en el equipamiento. */
  electric: boolean;
};

/** Equipamiento que va SIEMPRE con cualquier bicicleta (dossier, pág. 11). */
export const EQUIPAMIENTO_INCLUIDO = [
  "Portabultos especial",
  "Alforjas traseras impermeables",
  "Kit de herramientas y desmontables",
  "Bomba de aire",
  "Kit de parches",
  "Cámara de repuesto",
  "Bidón de agua",
  "Candado de seguridad",
] as const;

/** Equipamiento opcional siempre en stock (dossier, pág. 11). */
export const EQUIPAMIENTO_OPCIONAL = [
  "Bolso delantero (no disponible en todos los modelos)",
  "Pedales automáticos o SPD en lugar de los de plataforma",
  "Retirar las alforjas si no las querés",
] as const;

/** Equipamiento bajo petición, sujeto a disponibilidad (dossier, pág. 11). */
export const EQUIPAMIENTO_BAJO_PETICION = [
  "Portabebés",
  "Soporte de teléfono para manillar",
  "Puños ergonómicos",
  "Sillín de gel o funda de gel para sillín",
  "Luces delantera y trasera",
] as const;

/** Tabla de tallas por estatura (dossier, pág. 14). */
export const TALLAS = [
  { altura: "150 – 160 cm", talla: "XS", cuadro: '14"' },
  { altura: "160 – 170 cm", talla: "S", cuadro: '15,5"' },
  { altura: "170 – 178 cm", talla: "M", cuadro: '17,5"' },
  { altura: "178 – 188 cm", talla: "L", cuadro: '19"' },
  { altura: "188 – 196 cm", talla: "XL", cuadro: '21"' },
] as const;

export const BIKES: BikeSeed[] = [
  {
    slug: "mtb",
    position: 1,
    name: "Ridley Ignite A",
    category_label: "MTB · Bicicleta de montaña",
    pilgrim_service: "Alquiler de Bicicletas MTB",
    tagline: "Robusta, polivalente y lista para cualquier terreno",
    description:
      "Si te gusta pedalear por tus propios medios y disfrutar del Camino con calma, esta es tu mejor elección. Tiene una postura más deportiva, pensada para caminos de tierra y tramos off-road. Admite alforjas de 20 litros por cada lado y lleva ruedas tubelizadas, casi imposibles de pinchar.",
    ideal_para: "Ideal si buscás una experiencia auténtica y sin motores.",
    sizes: ["S", "M", "L", "XL"],
    sizes_note: "Talla XL sujeta a disponibilidad",
    wheels: ['Ruedas 29" en S · M · L · XL'],
    luggage: "Alforjas de 20 L por lado",
    specs: [
      { label: "Cuadro", value: "Ignite A9 7E6" },
      { label: "Horquilla", value: "RockShox Judy Silver TK R 29er 100 mm" },
      { label: "Freno", value: "SRAM Level T" },
      { label: "Cambio", value: "SRAM NX Eagle 175 mm, 32T" },
      { label: "Palanca de cambio", value: "SRAM 12V NX" },
      { label: "Piñón", value: "SRAM PG-1230 Eagle, 12s, 11-50T" },
      { label: "Manillar", value: "Forza Stratos, Flat Bar, 720 mm" },
      { label: "Potencia", value: "Forza Stratos, 80 mm" },
      { label: "Tubo de dirección", value: '1-1/8" semi integrado' },
      { label: "Sillín", value: "Selle Italia Model X, Black" },
    ],
    motor: null,
    photo: "ridley-ignite-a.jpg",
    electric: false,
  },
  {
    slug: "gravel",
    position: 2,
    name: "Lapierre Crosshill 30",
    category_label: "Gravel",
    pilgrim_service: "Alquiler de Bicicletas Gravel",
    tagline: "Versátil, ligera y divertida",
    description:
      "Si lo tuyo es improvisar, esta bici es tu compañera de viaje perfecta. Sirve igual para asfalto que para tierra, con una postura cómoda y ruedas rápidas. Admite alforjas de 15 litros y lleva ruedas tubelizadas.",
    ideal_para: "Ideal para quienes buscan libertad y aventura.",
    sizes: ["S", "M", "L"],
    sizes_note: null,
    wheels: ['Ruedas 28" en S · M · L'],
    luggage: "Alforjas de 15 L",
    specs: [
      { label: "Cuadro", value: "Crosshill Gravel Supreme 5 Alloy, Internal Routing" },
      { label: "Horquilla", value: "Lapierre Carbon Blades, Alloy Steerer, 12 mm Thru Axle" },
      { label: "Frenos (manetas)", value: "Shimano Tiagra Hydraulic Flatmount" },
      { label: "Frenos (discos)", value: "Shimano SM-RT30M 160 mm Centerlock" },
      { label: "Cambio", value: "Shimano Tiagra RD-R4700GS, 10s" },
      { label: "Palanca de cambio", value: "Shimano Tiagra ST-4720 2×10s" },
      { label: "Piñón", value: "Sunrace CSMS0 10s 11-34T" },
      { label: "Manillar", value: "Lapierre alloy gravel bar, 420 mm (XS/S) · 440 mm (M)" },
      { label: "Potencia", value: "Lapierre alloy, 31.8 mm, L: 50 mm" },
      { label: "Tubo de dirección", value: "FSA Orbit NO.57B semi integrado" },
    ],
    motor: null,
    photo: "lapierre-crosshill-30.jpg",
    electric: false,
  },
  {
    slug: "mtb_doble_suspension",
    position: 3,
    name: "Lapierre Zesty TR 3.9",
    category_label: "MTB doble suspensión",
    pilgrim_service: "Alquiler de Bicicletas MTB doble suspensión",
    tagline: "Espíritu deportivo para terrenos exigentes",
    description:
      "Perfecta para quienes disfrutan bajando por pistas o caminos más técnicos. La suspensión delantera y trasera hace que vayas más cómodo, aunque se recomienda equipaje ligero (15 litros). También lleva ruedas tubelizadas, así que evitás los pinchazos.",
    ideal_para: "Ideal para quien quiere divertirse rodando por terrenos exigentes.",
    sizes: ["S", "M", "L"],
    sizes_note: null,
    wheels: ['Ruedas 29" en S · M · L'],
    luggage: "Alforjas de 15 L (equipaje ligero)",
    specs: [
      { label: "Cuadro", value: "Zesty TR Supreme 5 Alloy, 120 mm travel (29\"), Pressfit, Boost" },
      { label: "Horquilla", value: "Suntour Raidon32 RLR Boost 120 mm" },
      { label: "Amortiguador", value: "Lapierre AF2 Air Trunnion Metric, Rebound & Lockout (165×45)" },
      { label: "Frenos (manetas)", value: "Shimano MT401" },
      { label: "Frenos (discos)", value: "Shimano SM-RT30 180/180 mm" },
      { label: "Cambio", value: "Shimano New Deore 11s (M5100)" },
      { label: "Palanca de cambio", value: "Shimano Deore M4100 10s" },
      { label: "Piñón", value: "Shimano Deore CS-M5100, 11s, 11-51T" },
      { label: "Manillar", value: "Lapierre Alloy 6061 DB, 740 mm, rise 15 mm, 31.8 mm" },
      { label: "Tija", value: "Telescópica" },
    ],
    motor: null,
    photo: "lapierre-zesty-tr-39.jpg",
    electric: false,
  },
  {
    slug: "mtb_carbono",
    position: 4,
    name: "Berria Bravo Sport",
    category_label: "MTB de carbono",
    pilgrim_service: "Alquiler de Bicicletas MTB de Carbono",
    tagline: "La más rápida y eficiente de la flota",
    description:
      "Para quienes buscan ligereza y velocidad. Cuadro ultraligero de carbono y una respuesta muy ágil, para hacer el Camino a buen ritmo. Admite alforjas pequeñas (15 litros) y lleva ruedas tubelizadas.",
    ideal_para: "No es la más cómoda de la flota, pero sí la más rápida. Para ciclistas con experiencia.",
    sizes: ["S", "M", "L"],
    sizes_note: null,
    wheels: ['Ruedas 29" en S · M · L'],
    luggage: "Alforjas de 15 L",
    specs: [
      { label: "Cuadro", value: "Bravo 5 EVO, XCO Racing Geometry BGC, full carbon HMR2X, triple monocasco" },
      { label: "Horquilla", value: "RockShox Judy, Remote Lockout" },
      { label: "Freno", value: "Disco hidráulico Shimano MT500" },
      { label: "Cambio", value: "SRAM SX Eagle Aluminum cage, 12 velocidades" },
      { label: "Palanca de cambio", value: "UDH Universal Derailleur Hanger" },
      { label: "Piñón", value: "SRAM GX Eagle 12s 10-52T" },
      { label: "Manillar", value: "Avanforce AF3, Aluminum 6061, 31.8 mm, 740 mm, 330 g" },
      { label: "Tubo de dirección", value: '1-1/8" semi integrado' },
    ],
    motor: null,
    photo: "berria-bravo-sport.jpg",
    electric: false,
  },
  {
    slug: "mtb_carbono_doble_suspension",
    position: 5,
    name: "Ridley Raft XC",
    category_label: "MTB de carbono y doble suspensión",
    pilgrim_service: "Alquiler de Bicicletas MTB de Carbono y doble suspensión",
    tagline: "Ligereza, potencia y absorción: lo mejor de la flota",
    description:
      "Pensada para los más exigentes o para quienes buscan disfrutar de cada tramo, por duro que sea. Admite alforjas pequeñas (15 litros) y lleva ruedas tubelizadas.",
    ideal_para: "Ideal para quien busca control total y que ningún camino se le resista.",
    sizes: ["S", "M", "L"],
    sizes_note: null,
    wheels: ['Ruedas 29" en S · M · L'],
    luggage: "Alforjas de 15 L",
    specs: [
      { label: "Cuadro", value: "RAFT Full Suspension CARBON" },
      { label: "Horquilla", value: "RockShox SID SL Rush, 100 mm" },
      { label: "Amortiguador", value: "RockShox SIDLUXE SEL+ RO 190×40" },
      { label: "Freno", value: "SRAM Level T" },
      { label: "Cambio", value: "SRAM SX Eagle 175 mm, 32T" },
      { label: "Palanca de cambio", value: "SRAM 12V GX" },
      { label: "Piñón", value: "SRAM PG-1230 Eagle, 12s, 11-50T" },
      { label: "Manillar", value: "Forza Stratos Flat Bar, 720 mm" },
      { label: "Potencia", value: "Forza Stratos, 80 mm" },
      { label: "Sillín", value: "Selle Italia Model X, Black" },
    ],
    motor: null,
    photo: "ridley-raft-xc.jpg",
    electric: false,
  },
  {
    slug: "ebike",
    position: 6,
    name: "Lapierre Overvolt HT 7.6",
    category_label: "Eléctrica · E-Bike",
    pilgrim_service: "Alquiler de Bicicletas EBike",
    tagline: "La más elegida por los peregrinos",
    description:
      "Ideal para quienes quieren disfrutar del Camino con ayuda en las cuestas y más autonomía cada día. Admite alforjas de 20 litros, lleva ruedas tubelizadas y ofrece una gran comodidad de marcha.",
    ideal_para: "Perfecta si querés disfrutar sin preocuparte por el esfuerzo.",
    sizes: ["S", "M", "L", "XL"],
    sizes_note: "Talla XL sujeta a disponibilidad",
    wheels: [
      'Ruedas 29" en S · M · L · XL',
      'Ruedas 27,5" en S',
      'Ruedas 27,5" en S con barra baja',
    ],
    luggage: "Alforjas de 20 L",
    specs: [
      { label: "Cuadro", value: "Overvolt Yamaha Supreme 5 Alloy" },
      { label: "Frenos (manetas)", value: "Shimano MT400 hidráulicos" },
      { label: "Frenos (discos)", value: "Shimano ASMRT30 203/203 mm Centerlock" },
      { label: "Cambio", value: "Shimano Deore M4100 10s" },
      { label: "Palanca de cambio", value: "Shimano Deore M4100 10s" },
      { label: "Piñón", value: "Sunrace CSMS2 10s 11-46T Black" },
      { label: "Manillar", value: "Lapierre Alloy 6061 DB, 740 mm, rise 15 mm, 31.8 mm" },
      { label: "Potencia", value: "Lapierre alloy, 31.8 mm, L: 50 mm" },
      { label: "Tubo de dirección", value: "FSA Orbit 1.5ZS NO.57SC" },
      { label: "Tija de sillín", value: "Telescópica NO incluida" },
    ],
    motor: {
      motor: "Yamaha PW-ST, asistencia hasta 25 km/h",
      pantalla: "Display A",
      bateria: "Integrada en el cuadro, 630 Wh",
    },
    photo: "lapierre-overvolt-ht-76.jpg",
    electric: true,
  },
  {
    slug: "ebike_doble_suspension",
    position: 7,
    name: "Haibike AllTrail 9 29",
    category_label: "Eléctrica doble suspensión · E-Bike",
    pilgrim_service: "Alquiler de Bicicletas EBike doble suspensión",
    tagline: "Potente, segura y con conducción suave",
    description:
      "Pensada para los más aventureros. Su suspensión total ofrece comodidad y control incluso en caminos rotos o con piedras. Se recomienda con alforjas pequeñas (15 litros) y lleva ruedas tubelizadas.",
    ideal_para: "Ideal para quienes buscan la bici más actual de la flota.",
    sizes: ["S", "M", "L"],
    sizes_note: null,
    wheels: ['Ruedas 29" en M · L', 'Ruedas 27,5" en S'],
    luggage: "Alforjas de 15 L (equipaje ligero)",
    specs: [
      { label: "Cuadro", value: "Haibike AllTrail 29 PW-X3, Aluminum 140" },
      { label: "Horquilla", value: "RockShox 35 Gold RL, Air 140 mm travel" },
      { label: "Frenos (manetas)", value: "Shimano MT420, disco de 4 pistones" },
      { label: "Frenos (discos)", value: "Shimano RT EM300L, 203 mm" },
      { label: "Cambio", value: "SRAM NX Eagle" },
      { label: "Palanca de cambio", value: "SRAM NX Eagle, Trigger switch" },
      { label: "Piñón", value: "SRAM Eagle PG1210, 11-50T" },
      { label: "Manillar", value: "Haibike Components TheBar +++, 780 mm" },
      { label: "Potencia", value: "Haibike Components TheStem ++, A-head, 31.8 mm, 7°" },
      { label: "Tija de sillín", value: "Telescópica" },
    ],
    motor: {
      motor: "Yamaha PW-X3, 85 Nm, asistencia hasta 25 km/h",
      pantalla: "LCD 1.7\" con 7 funciones",
      bateria: "Integrada en el cuadro, 720 Wh",
    },
    photo: "haibike-alltrail-9-29.jpg",
    electric: true,
  },
];

/**
 * Tarifas Pilgrim 2026 de la cotización C677157 (Ponferrada → Santiago, 5 días de alquiler).
 * Precio Camino Sacro = Pilgrim ÷ 0,85, redondeado al euro (comisión de agencia del 15 %).
 *
 * Solo existen para esta ruta: Portugués Oporto y Primitivo Oviedo duran más días y sus
 * tarifas hay que pedírselas a Pilgrim. Se siembran vacías a propósito, para que el CRM
 * avise en ámbar en vez de colar un precio inventado.
 */
export const TARIFAS_2026_PONFERRADA: Record<string, number> = {
  mtb: 265,
  gravel: 335,
  mtb_doble_suspension: 335,
  mtb_carbono: 350,
  mtb_carbono_doble_suspension: 375,
  ebike: 375,
  ebike_doble_suspension: 480,
};

/** Margen de agencia sobre la tarifa Pilgrim: 15 % de comisión ⇒ dividir por 0,85. */
export const MARGEN_BICI = 0.85;

export function precioCS(pilgrim: number): number {
  return Math.round(pilgrim / MARGEN_BICI);
}

/** Fianza obligatoria por bicicleta, reembolsable. No entra en el total de la cotización. */
export const FIANZA_POR_BICI_EUR = 200;

/** Condiciones del alquiler que hay que decirle al peregrino (dossier, págs. 15–17). */
export const CONDICIONES_ALQUILER = {
  fianza:
    "El alquiler exige una fianza de 200 € por bicicleta, que no forma parte del precio del viaje y se devuelve en un máximo de 20 días tras la entrega, una vez revisado el estado de la bici. Debe estar abonada al menos 30 días antes de la salida.",
  casco:
    "Por higiene, el casco no va incluido. Se puede comprar uno nuevo a estrenar (tallas S/M/L) y viaja con la bicicleta. Su uso es obligatorio en vías interurbanas.",
  modelo:
    "El modelo concreto está sujeto a disponibilidad. Se garantiza la gama contratada y una bicicleta de prestaciones equivalentes en la talla disponible para tus fechas.",
  talla:
    "Necesitamos tu estatura para asignar la talla. Si no la mandás a tiempo no podemos gestionar el alquiler.",
  pedales:
    "Por defecto llevan pedales de plataforma. Si preferís calas (tipo Shimano/SPD) hay que avisarlo al contratar.",
  entrega:
    "Enviamos la bicicleta al primer alojamiento de tu Camino, con unas 48 horas de antelación. Llega montada; solo hay que ajustar manillar y sillín.",
  devolucion:
    "La devolución es en Santiago de Compostela, en el punto que se indica en la documentación de viaje. Terminar en otra población tiene suplemento por entrega fuera de plaza.",
  antelacion:
    "Los alquileres se confirman con un mínimo de 5 días laborables de antelación (10 si el Camino empieza en Francia).",
  cancelacion:
    "El alquiler tiene su propia política de cancelación, no cubierta por el seguro de anulación: hasta 30 días antes se devuelve el 100 %, entre 29 y 15 días el 50 %, y desde 14 días antes no hay devolución. La fianza sí se devuelve entera.",
  seguro:
    "Todas las bicicletas llevan un seguro básico (responsabilidad civil hasta 100.000 €, gastos médicos de urgencia hasta 1.500 € y asistencia para retornar la bici en caso de accidente). El seguro a todo riesgo es opcional y amplía la cobertura a daños por caída, robo con la bici inmovilizada, responsabilidad civil hasta 200.000 € y defensa jurídica hasta 1.500 €.",
  equipamiento_extraviado:
    "Si dejás parte del equipamiento en un punto distinto al de devolución, se descuentan 25 € de la fianza por gastos de recogida.",
} as const;
