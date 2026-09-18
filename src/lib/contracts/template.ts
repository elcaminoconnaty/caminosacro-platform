// Plantilla del Acuerdo de Prestación de Servicios Turísticos de Camino Sacro.
// Fuente única de verdad del texto legal: la consumen el PDF (contractPdf.tsx),
// el editor del CRM (ContractCard) y la página pública de firma (/contrato/[token]).
// El texto fue redactado bajo ley colombiana (Ley 1480/2011, Ley 1581/2012,
// Ley 527/1999) — ver `Camino Sacro/Contrato/` para el histórico y el PDF plantilla.
//
// DOS MODALIDADES DE CONTRATANTE, UN SOLO ARTICULADO
// --------------------------------------------------
// `contratante_tipo` decide quién es la otra parte: una persona natural (EL VIAJERO, el
// caso de siempre) o una empresa que manda a sus trabajadores (EL CONTRATANTE, con razón
// social y NIT, firmando su representante legal y con la relación de viajeros como anexo).
//
// Las cláusulas son LAS MISMAS en las dos, con el nombre de la parte parametrizado y unos
// pocos párrafos con rama propia. No hay dos juegos de cláusulas a propósito: la política
// de cancelación (los 150 €) tiene que poder cambiarse en un solo sitio o terminaría
// diciendo una cosa en un contrato y otra en el de al lado.
//
// Regla de redacción: `parteContratante` devuelve SIEMPRE un sujeto singular. Nada de
// «LOS VIAJEROS», que obligaría a conjugar en plural los cuarenta y pico párrafos. Lo que
// le toca a quien camina se redacta como obligación de la empresa *respecto de* sus
// viajeros: «EL CONTRATANTE se obliga a que cada uno de los viajeros… porte su pasaporte».

export type ContractVariables = {
  codigo_cotizacion: string;
  viajero_nombre: string;
  viajero_tipo_documento: string;
  viajero_documento: string;
  viajero_email: string;
  viajero_telefono: string;
  viajero_direccion: string;
  ruta_nombre: string;
  origen: string;
  destino: string;
  fecha_inicio: string; // ISO yyyy-mm-dd
  fecha_fin: string;
  num_personas: string;
  modalidad: string;
  habitaciones: string;
  valor_total_eur: string; // "1.234"
  valor_total_cop: string; // "5.550.000" o "—"
  trm: string;             // "4.500" o "—"
  moneda: "EUR" | "COP";   // moneda en que paga el viajero
  fecha_cotizacion: string;
  validez: string;         // días
  incluye: string;
  no_incluye: string;
  opcionales: string;
  autoriza_imagen: "sí" | "no";

  /**
   * Quién contrata. **Ausente = "persona"**, para que los contratos firmados antes de que
   * existiera la modalidad empresa sigan diciendo exactamente lo mismo que decían al
   * firmarse — mismo criterio que `con_pagare`.
   */
  contratante_tipo?: "persona" | "empresa";
  empresa_razon_social?: string;
  empresa_nit?: string;
  empresa_direccion?: string; // dirección de notificaciones
  empresa_ciudad?: string;
  empresa_email?: string;     // correo de notificaciones
  empresa_telefono?: string;
  rep_nombre?: string;
  rep_tipo_documento?: string;
  rep_documento?: string;

  /**
   * Quién firma por Camino Sacro. Ausentes = Nicolás, que es quien firmó todo lo anterior
   * a que esto existiera; ver `FIRMANTE_POR_DEFECTO`.
   */
  org_nombre?: string;
  org_tipo_documento?: string;
  org_documento?: string;

  /**
   * Lo que se pactó DISTINTO con este cliente. **Ausente = el articulado de siempre**,
   * palabra por palabra, para que los contratos anteriores sigan diciendo exactamente lo
   * que decían — mismo criterio que `contratante_tipo` y `con_pagare`.
   */
  condiciones_particulares?: CondicionesParticulares;
};

/**
 * Condiciones particulares de UN contrato.
 *
 * Existe porque el cliente firma dos papeles: la cotización (que entra como Anexo No. 1,
 * con las políticas del operador) y el articulado. Cuando no dicen lo mismo, el cliente lo
 * nota y no firma: pasó con CS-2026-080 (Colegiatura, sep-2026), que antes de firmar pidió
 * unificar los porcentajes de cancelación, el cargo por modificación y los plazos de pago.
 *
 * Esto NO es la solución de fondo —alinear la cotización y la plantilla de raíz, para que
 * no vuelvan a divergir, es tarea aparte—, sino la forma de cerrar un contrato concreto en
 * los términos realmente pactados sin reescribirle el texto a los demás.
 *
 * Cada campo reemplaza el párrafo equivalente; los parágrafos que no se nombran siguen
 * intactos, para que no se pierda en silencio nada de lo que ya protege a las dos partes
 * (comisiones bancarias, plazo de reembolso, cancelación por parte de EL ORGANIZADOR).
 */
export type CondicionesParticulares = {
  /** Reemplaza la regla general de FORMA DE PAGO (el primer párrafo). */
  pago?: string;
  /**
   * Reemplaza los parágrafos propios de FORMA DE PAGO (el cronograma, la mora, el pagaré).
   * El de comisiones bancarias se mantiene siempre y va de último.
   */
  pago_parags?: string[];
  /** Reemplaza el párrafo único de MODIFICACIONES SOLICITADAS. */
  modificaciones?: string;
  /** Reemplaza la escala de penalidades de CANCELACIÓN Y REEMBOLSOS (el primer párrafo). */
  cancelacion?: string;
  /** Parágrafos que se suman a CANCELACIÓN, antes del de cancelación por EL ORGANIZADOR. */
  cancelacion_parags?: string[];
};

/** Un firmante de Camino Sacro (`settings.firmantes`). */
export type Firmante = {
  slug: string;
  nombre: string;
  documento_tipo: string;
  documento: string;
  data_url?: string | null;
};

/**
 * Con quién sale un contrato que no diga otra cosa. Es Nico porque es quien firmó todos
 * los contratos anteriores a que hubiera dónde elegir: un contrato viejo re-renderizado
 * tiene que seguir diciendo exactamente lo mismo.
 */
export const FIRMANTE_POR_DEFECTO = {
  slug: "nico",
  nombre: "NICOLÁS VILLA POSADA",
  documento_tipo: "Cédula de ciudadanía",
  documento: "1.017.126.076",
} as const;

/** Datos del firmante de Camino Sacro para ESTE contrato. */
export function firmanteOrg(v: ContractVariables): { nombre: string; documento_tipo: string; documento: string } {
  return {
    nombre: v.org_nombre || FIRMANTE_POR_DEFECTO.nombre,
    documento_tipo: v.org_tipo_documento || FIRMANTE_POR_DEFECTO.documento_tipo,
    documento: v.org_documento || FIRMANTE_POR_DEFECTO.documento,
  };
}

/** "identificado con la cédula de ciudadanía número 1.017.126.076" */
function identificacionOrg(v: ContractVariables): string {
  const f = firmanteOrg(v);
  return `identificado(a) con la ${f.documento_tipo.toLowerCase()} número ${f.documento}`;
}

export type Cuota = { n: number; fecha: string; monto_eur: number };
export type PaymentPlan =
  | { type: "contado" }
  | {
      type: "financiado";
      cuotas: Cuota[];
      /**
       * Si el paquete de firma lleva el pagaré en blanco y su carta de instrucciones.
       *
       * Ausente = `true`, para que los contratos firmados antes de que esto existiera
       * sigan diciendo exactamente lo mismo que decían al firmarse.
       *
       * Se puede apagar porque el pagaré es una **garantía de una deuda**, y hay planes
       * financiados que a la hora de firmar ya están pagados: pedirle a alguien que firme
       * un pagaré en blanco por una plata que ya entregó es motivo suficiente para que no
       * firme. Pasó con CS-2026-004 (4-sep-2026): dos cuotas de 485 €, las dos cobradas,
       * y la viajera sin firmar.
       */
      con_pagare?: boolean;
    };

/**
 * ¿Este contrato lleva pagaré? Fuente única: la usan el articulado, los anexos, el PDF,
 * la página pública y la declaración que acepta quien firma. Si alguna se saliera de aquí,
 * el contrato diría una cosa y el papel firmado otra.
 */
export function llevaPagare(plan: PaymentPlan): boolean {
  return plan.type === "financiado" && plan.con_pagare !== false;
}

// ---------- Quién contrata ----------

/** ¿El contratante es una empresa? Ausente = persona natural (ver `contratante_tipo`). */
export function esEmpresa(v: ContractVariables): boolean {
  return v.contratante_tipo === "empresa";
}

/** Nombre de la parte que contrata. **Singular en las dos modalidades** (ver cabecera). */
export function parteContratante(v: ContractVariables): string {
  return esEmpresa(v) ? "EL CONTRATANTE" : "EL VIAJERO";
}

/**
 * Número del anexo del pagaré. En un contrato de empresa el 2 lo ocupa la relación de
 * viajeros, así que el pagaré corre al 3. Fuente única: lo usan la cláusula cuarta, el
 * texto de anexos y el título de la hoja del pagaré, que tienen que coincidir.
 */
export function numeroAnexoPagare(v: ContractVariables): number {
  return esEmpresa(v) ? 3 : 2;
}

/**
 * A quién se le manda ESTE contrato: al viajero, o a la empresa por su correo de
 * notificaciones. Fuente única — la usan el envío desde el CRM, la copia que sale al
 * firmar y el cron de recordatorios. Si alguno se saliera de aquí, un contrato de empresa
 * se quedaría insistiéndole a una dirección vacía.
 */
export function destinatarioContrato(v: ContractVariables): { email: string; nombre: string } {
  return esEmpresa(v)
    ? { email: v.empresa_email || "", nombre: v.empresa_razon_social || "" }
    : { email: v.viajero_email || "", nombre: v.viajero_nombre || "" };
}

/** Nombre de pila para encabezar el correo. En empresa, el del representante legal. */
export function saludoContrato(v: ContractVariables): string {
  const base = esEmpresa(v) ? v.rep_nombre || "" : v.viajero_nombre || "";
  return base.trim().split(/\s+/)[0] || "";
}

/** Una fila de la relación de viajeros beneficiarios (Anexo No. 2 del contrato de empresa). */
export type ViajeroAnexo = {
  position: number;
  nombre: string;
  documento_tipo: string;
  documento: string;
  /** null = el viajero todavía no respondió su ficha; en el anexo sale como "pendiente". */
  autoriza_imagen: boolean | null;
};

export const VIAJEROS_ANEXO_TITULO = "ANEXO No. 2 — RELACIÓN DE VIAJEROS BENEFICIARIOS";

/** Encabezado del anexo de viajeros. El listado en sí lo dibuja cada medio (tabla en el PDF). */
export function viajerosAnexoIntro(v: ContractVariables, total: number): string {
  return (
    `Los siguientes ${total} viajero(s) son los beneficiarios del plan contratado por ` +
    `${v.empresa_razon_social || "EL CONTRATANTE"} bajo el Acuerdo No. ${v.codigo_cotizacion}. ` +
    `La columna "Uso de imagen" recoge la autorización individual de cada uno en los términos ` +
    `del parágrafo segundo de la ${refClausula(true, "datos")}; "pendiente" significa que ese ` +
    `viajero aún no la ha otorgado y, en consecuencia, no se entiende concedida.`
  );
}

export const VARIABLE_LABELS: Record<keyof ContractVariables, string> = {
  codigo_cotizacion: "Código de cotización",
  viajero_nombre: "Nombre completo del viajero",
  viajero_tipo_documento: "Tipo de documento",
  viajero_documento: "Número de documento",
  viajero_email: "Correo del viajero",
  viajero_telefono: "Teléfono del viajero",
  viajero_direccion: "Dirección del viajero",
  ruta_nombre: "Ruta",
  origen: "Origen",
  destino: "Destino",
  fecha_inicio: "Fecha de inicio",
  fecha_fin: "Fecha de fin",
  num_personas: "Número de personas",
  modalidad: "Modalidad",
  habitaciones: "Acomodación",
  valor_total_eur: "Valor total (EUR)",
  valor_total_cop: "Valor en pesos (COP)",
  trm: "TRM EUR/COP de referencia",
  moneda: "Moneda de pago del viajero",
  fecha_cotizacion: "Fecha de la cotización",
  validez: "Validez de la cotización (días)",
  incluye: "Servicios incluidos",
  no_incluye: "Servicios no incluidos",
  opcionales: "Servicios opcionales contratados",
  autoriza_imagen: "Autoriza uso de imagen",
  contratante_tipo: "Tipo de contratante",
  empresa_razon_social: "Razón social",
  empresa_nit: "NIT",
  empresa_direccion: "Dirección de notificaciones",
  empresa_ciudad: "Ciudad",
  empresa_email: "Correo de notificaciones",
  empresa_telefono: "Teléfono de la empresa",
  rep_nombre: "Representante legal",
  rep_tipo_documento: "Tipo de documento del representante",
  rep_documento: "Documento del representante",
  org_nombre: "Firma por Camino Sacro",
  org_tipo_documento: "Tipo de documento de quien firma",
  org_documento: "Documento de quien firma",
  // No es un campo de texto del editor: son párrafos del articulado. Ver `GRUPOS`.
  condiciones_particulares: "Condiciones particulares pactadas",
};

export const DEFAULT_INCLUYE =
  "Noches de alojamiento en acomodación privada con baño privado, desayunos, traslado de equipaje entre etapas (máximo 15 kg por persona), credencial del peregrino, asistencia telefónica 24 horas, seguro de viaje con coberturas médicas y de responsabilidad civil, y guía del Camino en PDF";

export const DEFAULT_NO_INCLUYE =
  "Traslados desde y hasta el país o ciudad de origen, traslado hasta el punto de inicio del Camino, almuerzos y cenas no especificados, tasas turísticas (de pago directo en el alojamiento) y cualquier servicio no señalado expresamente como incluido";

// ---------- Cronograma de cuotas ----------

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Genera cuotas parejas entre hoy y la fecha límite (60 días antes del viaje).
 * La primera cuota vence hoy (confirma la reserva); la última nunca después del límite.
 */
export function buildCronograma(totalEur: number, numCuotas: number, startDate: string | null): Cuota[] {
  const n = Math.max(2, Math.min(12, Math.round(numCuotas)));
  const hoy = new Date().toISOString().slice(0, 10);
  let limite = startDate ? addDays(startDate, -60) : addDays(hoy, 30 * (n - 1));
  if (limite < hoy) limite = hoy;

  const t0 = new Date(hoy + "T00:00:00").getTime();
  const t1 = new Date(limite + "T00:00:00").getTime();
  const paso = n > 1 ? (t1 - t0) / (n - 1) : 0;

  const base = Math.floor((totalEur / n) * 100) / 100;
  const cuotas: Cuota[] = [];
  for (let i = 0; i < n; i++) {
    const fecha = new Date(t0 + paso * i).toISOString().slice(0, 10);
    const monto = i === n - 1 ? Math.round((totalEur - base * (n - 1)) * 100) / 100 : base;
    cuotas.push({ n: i + 1, fecha, monto_eur: monto });
  }
  return cuotas;
}

const fmtFechaLarga = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(iso + (iso.length === 10 ? "T00:00:00" : "")),
    );
  } catch {
    return iso;
  }
};

const fmtEur = (nu: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(nu);

export function cronogramaTexto(plan: PaymentPlan): string {
  if (plan.type !== "financiado" || plan.cuotas.length === 0) return "";
  return plan.cuotas
    .map((c) => `cuota ${c.n}: ${fmtEur(c.monto_eur)} € a más tardar el ${fmtFechaLarga(c.fecha)}`)
    .join("; ");
}

// ---------- Texto del contrato ----------

export type ContractSection = { title: string; paragraphs: string[] };

/**
 * Las cláusulas se identifican por CLAVE, no por su número.
 *
 * El número sale del orden y de la modalidad —el contrato de empresa tiene dos cláusulas
 * que el de persona no—, así que escribirlo a mano en una referencia cruzada («se rige por
 * la cláusula sexta») era una bomba de tiempo: bastaba insertar una cláusula para que el
 * contrato remitiera a otra cosa, en silencio y ya firmado. Ahora se escribe
 * `ref("cancelacion")` y el número se calcula.
 */
type ClaveClausula =
  | "objeto" | "alcance" | "valor" | "pago" | "modificaciones" | "cancelacion"
  | "retracto" | "reversion" | "garantia" | "responsabilidad" | "seguro"
  | "obligaciones_organizador" | "obligaciones_contratante" | "responsabilidad_exclusiva"
  | "fuerza_mayor" | "datos" | "confidencialidad" | "origen_fondos" | "cesion"
  | "vigencia" | "notificaciones" | "controversias" | "firma";

/**
 * Orden de las cláusulas. Confidencialidad y origen de fondos solo entran en empresa.
 * Retracto y reversión del pago solo entran en persona natural: son derechos del consumidor
 * en venta a distancia (arts. 47 y 51 de la Ley 1480), y el abogado pidió sacarlos del
 * contrato de empresa junto con las demás remisiones al Estatuto del Consumidor (sep-2026).
 */
function ordenClausulas(empresa: boolean): ClaveClausula[] {
  return [
    "objeto", "alcance", "valor", "pago", "modificaciones", "cancelacion",
    ...(empresa ? [] : (["retracto", "reversion"] as ClaveClausula[])),
    "garantia", "responsabilidad", "seguro",
    "obligaciones_organizador", "obligaciones_contratante", "responsabilidad_exclusiva",
    "fuerza_mayor", "datos",
    ...(empresa ? (["confidencialidad", "origen_fondos"] as ClaveClausula[]) : []),
    "cesion", "vigencia", "notificaciones", "controversias", "firma",
  ];
}

const ORDINALES_FEM = [
  "PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA", "SEXTA", "SÉPTIMA", "OCTAVA", "NOVENA",
  "DÉCIMA", "DÉCIMA PRIMERA", "DÉCIMA SEGUNDA", "DÉCIMA TERCERA", "DÉCIMA CUARTA", "DÉCIMA QUINTA",
  "DÉCIMA SEXTA", "DÉCIMA SÉPTIMA", "DÉCIMA OCTAVA", "DÉCIMA NOVENA", "VIGÉSIMA",
  "VIGÉSIMA PRIMERA", "VIGÉSIMA SEGUNDA", "VIGÉSIMA TERCERA", "VIGÉSIMA CUARTA", "VIGÉSIMA QUINTA",
];

const ORDINALES_PARRAFO = ["PRIMERO", "SEGUNDO", "TERCERO", "CUARTO", "QUINTO", "SEXTO"];

/** "cláusula décima cuarta" — para las referencias cruzadas dentro del articulado. */
export function refClausula(empresa: boolean, clave: ClaveClausula): string {
  const i = ordenClausulas(empresa).indexOf(clave);
  return i < 0 ? "cláusula correspondiente" : `cláusula ${ORDINALES_FEM[i].toLowerCase()}`;
}

/** Política de tratamiento de datos publicada (Decreto 1377 de 2013). */
export const URL_POLITICA_DATOS = "https://caminosacro.com/terminos-y-condiciones/";

/** Junta dirección y ciudad sin dejar un punto doble cuando la ciudad ya trae el suyo ("Bogotá D.C."). */
function domicilioEmpresa(v: ContractVariables): string {
  return [v.empresa_direccion, v.empresa_ciudad].filter(Boolean).join(", ").replace(/\.+$/, "");
}

/** "COLEGIO X S.A.S., identificada con NIT 900…, representada legalmente por …" */
function identificacionEmpresa(v: ContractVariables): string {
  const domicilio = domicilioEmpresa(v);
  return (
    `${v.empresa_razon_social || "________________"}, sociedad legalmente constituida, ` +
    `identificada con NIT ${v.empresa_nit || "________"}` +
    (domicilio ? `, con domicilio en ${domicilio}` : "") +
    `, representada legalmente por ${v.rep_nombre || "________________"}, mayor de edad, ` +
    `identificado(a) con ${v.rep_tipo_documento || "documento"} número ${v.rep_documento || "________"}`
  );
}

export function contractIntro(v: ContractVariables): string[] {
  const f = firmanteOrg(v);
  const organizador = `(i) ${f.nombre}, mayor de edad, ${identificacionOrg(v)}, obrando en su propio nombre como titular del nombre comercial “CAMINO SACRO” (caminosacro.com), quien en adelante se denominará “EL ORGANIZADOR”, y`;

  const contratante = esEmpresa(v)
    ? `(ii) ${identificacionEmpresa(v)}, quien en adelante se denominará “EL CONTRATANTE”.`
    : `(ii) ${v.viajero_nombre || "________________"}, mayor de edad, identificado(a) con ${v.viajero_tipo_documento || "documento"} número ${v.viajero_documento || "________"}, obrando en su propio nombre, quien en adelante se denominará “EL VIAJERO”.`;

  return [
    organizador,
    contratante,
    `Ambas partes se reconocen mutuamente la capacidad legal necesaria y acuerdan celebrar el presente contrato de prestación de servicios turísticos (en adelante, “el Contrato”), asociado a la cotización No. ${v.codigo_cotizacion}, el cual se regirá por las cláusulas aquí establecidas y, en lo no previsto, por las normas civiles y comerciales de la República de Colombia${esEmpresa(v) ? "" : " y por la Ley 1480 de 2011"}.`,
  ];
}

export function contractConsideraciones(v: ContractVariables): string[] {
  const P = parteContratante(v);
  const empresa = esEmpresa(v);
  return [
    `1. EL ORGANIZADOR presta servicios de agenciamiento de viajes bajo el nombre comercial CAMINO SACRO: organiza, coordina, gestiona y comercializa planes para recorrer las rutas del Camino de Santiago (España), integrando en un solo producto, con un precio global, una combinación de servicios de carácter turístico prestados por terceros: alojamiento, traslado de equipaje entre etapas, asistencia en ruta, seguro de viaje y servicios complementarios.`,
    `2. La ejecución material de los servicios en destino está a cargo de un operador mayorista habilitado como agencia de viajes en España y de su red de proveedores locales (alojamientos, transportistas y aseguradoras), con quienes EL ORGANIZADOR contrata, en calidad de agencia intermediaria, para conformar el plan.`,
    empresa
      ? `3. La experiencia contratada es autoguiada: cada viajero recorre las etapas a su propio ritmo, sin grupo cerrado ni acompañamiento presencial permanente, con el respaldo logístico y la asistencia contratados.`
      : `3. La experiencia contratada es autoguiada: EL VIAJERO recorre las etapas a su propio ritmo, sin grupo cerrado ni acompañamiento presencial permanente, con el respaldo logístico y la asistencia contratados.`,
    `4. ${P} conoció y aceptó previamente la cotización No. ${v.codigo_cotizacion}, de fecha ${fmtFechaLarga(v.fecha_cotizacion)}, de la cual declara haber recibido copia, y cuyo contenido (itinerario, servicios incluidos y no incluidos, opcionales y valores) hace parte integral de este Contrato como Anexo No. 1.`,
    ...(empresa
      ? [
          `5. EL CONTRATANTE adquiere el plan para los viajeros relacionados en el Anexo No. 2, quienes son los beneficiarios de los servicios. EL CONTRATANTE es el único obligado al pago frente a EL ORGANIZADOR, y los viajeros no asumen obligación dineraria alguna bajo este Contrato.`,
        ]
      : []),
  ];
}

export function contractClauses(v: ContractVariables, plan: PaymentPlan): ContractSection[] {
  const P = parteContratante(v);
  const empresa = esEmpresa(v);
  const ref = (clave: ClaveClausula) => refClausula(empresa, clave);
  const financiado = plan.type === "financiado";
  const conPagare = llevaPagare(plan);
  const numCuotas = financiado ? plan.cuotas.length : 0;
  const crono = financiado ? cronogramaTexto(plan) : "";
  const anexoPagare = numeroAnexoPagare(v);
  /** Lo pactado distinto con este cliente. Vacío = el articulado de siempre. */
  const cp = v.condiciones_particulares ?? {};

  /** Numera los parágrafos seguidos: un salto delata que se le quitó algo al contrato. */
  const parags = (textos: string[], primerRotulo = "") =>
    textos.map((t, i) => `PARÁGRAFO ${ORDINALES_PARRAFO[i]}${i === 0 ? primerRotulo : ""}. — ${t}`);

  // Cláusula del valor según la moneda en que paga. Si paga en euros (transferencia a la
  // cuenta de España) no se menciona la tasa ni el COP.
  const valorClause =
    v.moneda === "COP"
      ? `El valor total del plan es de ${v.valor_total_cop} pesos colombianos (COP), equivalente a ${v.valor_total_eur} euros (EUR) según la tasa de referencia EUR/COP de ${v.trm} vigente el ${fmtFechaLarga(v.fecha_cotizacion)}. Cuando ${P} realice pagos parciales o anticipados en pesos, cada pago se liquidará a la tasa de referencia vigente el día del pago; las fluctuaciones de la tasa de cambio son asumidas íntegramente por ${P}. La cotización tiene una validez de ${v.validez} días desde su emisión.`
      : `El valor total del plan es de ${v.valor_total_eur} euros (EUR), pagadero en euros mediante transferencia a la cuenta que EL ORGANIZADOR indique. La cotización tiene una validez de ${v.validez} días desde su emisión.`;

  const formaPago: string[] = [
    cp.pago ??
      `Por regla general, ${P} pagará el cien por ciento (100%) del valor del plan al momento de confirmar la reserva, mediante los medios de pago que EL ORGANIZADOR le informe.`,
  ];
  const comisionesBancarias = `Los costos y comisiones bancarias o de la pasarela de pago dependen del banco desde donde se origina el pago y de la forma de pago elegida, y son asumidos por ${P}. Se tendrá como valor pagado el que efectivamente ingrese a la cuenta de EL ORGANIZADOR; si el monto acreditado es menor al pactado, ${P} deberá realizar el ajuste correspondiente por la diferencia. Los pagos se entienden recibidos cuando EL ORGANIZADOR confirme su acreditación por escrito.`;
  if (financiado) {
    formaPago.push(
      ...parags(
        [
          ...(cp.pago_parags ?? [
            `Las partes pactan un plan de pagos en ${numCuotas} cuotas, conforme al siguiente cronograma, que hace parte de este Contrato: ${crono}. En todo caso, el cien por ciento (100%) del valor del plan deberá estar pagado a más tardar sesenta (60) días calendario antes de la fecha de inicio del viaje. Sin el pago total no habrá lugar a la entrega de la documentación del viaje ni a la prestación de los servicios.`,
            `El plan financiado no causa intereses remuneratorios. En caso de mora en cualquiera de las cuotas, EL ORGANIZADOR podrá cobrar intereses moratorios a la tasa máxima legal permitida, declarar vencido el plazo de las cuotas pendientes y exigir su pago inmediato, y, transcurridos cinco (5) días calendario desde el vencimiento sin pago ni justificación, entender que ${P} ha desistido del viaje, con aplicación de la política de cancelación de la ${ref("cancelacion")} y liberación del cupo.`,
            ...(conPagare
              ? [`Como garantía de las obligaciones dinerarias de este Contrato, ${P} suscribe un pagaré en blanco con carta de instrucciones (Anexo No. ${anexoPagare}), de conformidad con los artículos 621, 622 y 710 del Código de Comercio.`]
              : []),
          ]),
          comisionesBancarias,
        ],
        " (PLAN FINANCIADO)",
      ),
    );
  } else {
    formaPago.push(
      ...parags([
        ...(cp.pago_parags ?? [
          `Si con posterioridad las partes pactan por escrito un plan de pagos en cuotas, el cien por ciento (100%) del valor del plan deberá estar pagado a más tardar sesenta (60) días calendario antes de la fecha de inicio del viaje; sin el pago total no habrá lugar a la entrega de la documentación del viaje ni a la prestación de los servicios.`,
        ]),
        comisionesBancarias,
      ]),
    );
  }

  const beneficiarios = empresa
    ? `para las ${v.num_personas} personas relacionadas en el Anexo No. 2`
    : `para ${v.num_personas} persona(s)`;

  // Parágrafos de la cancelación. El de la cancelación POR EL ORGANIZADOR cierra la
  // asimetría de tener regulada solo la del cliente.
  const cancelacionParags = [
    `La suspensión, interrupción o abandono del viaje por parte de ${empresa ? "un viajero" : "EL VIAJERO"} una vez iniciado, o el cambio de itinerario por razones personales, no dará lugar a reembolso, y los costos y gestiones adicionales que ello implique serán de su exclusiva cuenta.`,
    `Los reembolsos aprobados se realizarán dentro de los treinta (30) días calendario siguientes a la validación de la solicitud, por el mismo medio de pago utilizado, salvo acuerdo distinto. Las tasas, comisiones bancarias o cambiarias que se generen dentro de la transacción de reembolso serán asumidas por ${P} y se descontarán del valor a devolver.`,
    ...(empresa
      ? [
          `La cancelación referida a uno o varios viajeros, sin cancelar el plan completo, se liquidará con los mismos porcentajes y plazos sobre la parte proporcional que corresponda a esos viajeros. El cambio en el número de viajeros puede modificar el reparto de habitaciones y, con él, la tarifa por persona de quienes permanezcan; esa diferencia será asumida por EL CONTRATANTE.`,
        ]
      : []),
    ...(cp.cancelacion_parags ?? []),
    `CANCELACIÓN POR PARTE DE EL ORGANIZADOR. Si EL ORGANIZADOR cancela el viaje por causa no imputable a ${P} y distinta de los eventos de la ${ref("fuerza_mayor")}, reembolsará el cien por ciento (100%) de las sumas pagadas, sin descuento alguno, dentro de los treinta (30) días calendario siguientes, y ofrecerá, cuando sea posible, una alternativa de fecha o de ruta en condiciones equivalentes, que ${P} podrá aceptar o rechazar libremente.`,
  ];

  const cuerpo: Record<ClaveClausula, { titulo: string; parrafos: string[] }> = {
    objeto: {
      titulo: "OBJETO",
      parrafos: [
        `EL ORGANIZADOR se obliga frente a ${P} a prestar los servicios de agenciamiento del plan turístico ${v.ruta_nombre}, organizando, coordinando y gestionando su ejecución, con origen en ${v.origen || "—"} y destino ${v.destino || "Santiago de Compostela"}, entre el ${fmtFechaLarga(v.fecha_inicio)} y el ${fmtFechaLarga(v.fecha_fin)}, ${beneficiarios}, en modalidad ${v.modalidad || "—"} con acomodación ${v.habitaciones || "según cotización"}, conforme al detalle del Anexo No. 1.`,
        `PARÁGRAFO. — El plan está dirigido exclusivamente a personas mayores de edad. EL ORGANIZADOR no acepta viajeros menores de dieciocho (18) años, y ${P} declara que ${empresa ? "todos los viajeros relacionados en el Anexo No. 2 son mayores de edad" : "es mayor de edad"}.`,
      ],
    },
    // Aquí vive el rol de intermediario. El abogado pidió (sep-2026) límites claros del
    // servicio sin cerrar la puerta al cliente: qué hace y qué no hace EL ORGANIZADOR, y un
    // solo interlocutor que gestiona los reclamos. Sin "intermediario puro" ni remitir al
    // cliente a reclamar en España (eso era cláusula abusiva, art. 43 Ley 1480).
    alcance: {
      titulo: "ALCANCE Y NATURALEZA DEL SERVICIO",
      parrafos: [
        `EL ORGANIZADOR actúa como agencia intermediaria: diseña el plan, selecciona y contrata en nombre propio con el operador mayorista habilitado como agencia de viajes en España y con sus proveedores los servicios que lo componen, cobra su precio a ${P} y coordina su ejecución. EL ORGANIZADOR no es propietario, operador ni prestador directo de los alojamientos, los transportes, los seguros ni los demás servicios en destino, que son ejecutados materialmente por dicho operador y sus proveedores bajo sus propias condiciones de prestación. ${P} declara conocer y aceptar esta estructura del servicio.`,
        ...parags([
          `El servicio de EL ORGANIZADOR comprende: (a) el diseño del plan y la cotización que obra como Anexo No. 1; (b) la reserva y contratación, ante el operador y los proveedores, de los servicios señalados como incluidos, en las fechas y condiciones pactadas; (c) la entrega de la documentación del viaje y de la información necesaria para prepararlo; (d) un canal de asistencia a distancia durante el recorrido, en los medios y horarios informados; (e) la gestión, ante el operador y los proveedores, de las incidencias y reclamaciones que ${P} le reporte, y la información escrita de su resultado; y (f) la información veraz, suficiente y oportuna sobre el plan y sus condiciones.`,
          `El plan comprende los servicios expresamente señalados como incluidos en el Anexo No. 1: ${v.incluye}. No comprende, entre otros, los señalados como no incluidos: ${v.no_incluye}. Los servicios opcionales (${v.opcionales || "ninguno"}) solo harán parte del plan si fueron contratados y pagados expresamente.`,
          empresa
            ? `No hacen parte del servicio de EL ORGANIZADOR y, por tanto, no son de su cargo: (a) el transporte aéreo y cualquier trayecto desde o hacia el país de origen de los viajeros, así como el desplazamiento hasta el punto de inicio del recorrido y desde su punto final; (b) la ejecución material de los servicios en destino, que corresponde al operador y a sus proveedores; (c) el acompañamiento presencial o de guía durante las etapas, por tratarse de una experiencia autoguiada; (d) los trámites migratorios, sanitarios o de documentación de los viajeros; (e) los servicios que los viajeros contraten directamente con terceros, incluso durante el viaje; y (f) cualquier servicio no señalado como incluido en el Anexo No. 1.`
            : `No hacen parte del servicio de EL ORGANIZADOR y, por tanto, no son de su cargo: (a) el transporte aéreo y cualquier trayecto desde o hacia el país de origen de EL VIAJERO, así como el desplazamiento hasta el punto de inicio del recorrido y desde su punto final; (b) la ejecución material de los servicios en destino, que corresponde al operador y a sus proveedores; (c) el acompañamiento presencial o de guía durante las etapas, por tratarse de una experiencia autoguiada; (d) los trámites migratorios, sanitarios o de documentación de EL VIAJERO; (e) los servicios que EL VIAJERO contrate directamente con terceros, incluso durante el viaje; y (f) cualquier servicio no señalado como incluido en el Anexo No. 1.`,
          `Los servicios en destino se prestan conforme a las condiciones propias de cada proveedor (horarios de entrada y salida de los alojamientos, políticas de equipaje, coberturas y exclusiones de la póliza, entre otras), que EL ORGANIZADOR informará a ${P} antes del inicio del viaje y que ${empresa ? "los viajeros se obligan" : "EL VIAJERO se obliga"} a observar.`,
          `Sin perjuicio de lo anterior, EL ORGANIZADOR es el interlocutor único de ${P} para todo lo relativo al plan: recibe sus solicitudes y reclamaciones, las tramita ante el operador y los proveedores, exige la corrección del servicio o la compensación que corresponda y responde por sus propios deberes en los términos de la ${ref("responsabilidad")}. ${P} no está obligado a reclamar directamente ante el operador ni ante proveedor alguno en el exterior.`,
        ]),
      ],
    },
    valor: { titulo: "VALOR Y MONEDA", parrafos: [valorClause] },
    pago: { titulo: "FORMA DE PAGO", parrafos: formaPago },
    modificaciones: {
      titulo: `MODIFICACIONES SOLICITADAS POR ${P}`,
      parrafos: [
        cp.modificaciones ??
          `Toda modificación del plan ya reservado (fechas, etapas, alojamientos, número de noches o servicios) está sujeta a disponibilidad de los proveedores y causará un cargo de gestión de cien euros (100 €) ${empresa ? "por cada solicitud" : "por persona"}, más la diferencia de tarifa que la modificación genere. EL ORGANIZADOR gestionará la solicitud pero no garantiza disponibilidad, costo ni resultado.`,
      ],
    },
    cancelacion: {
      titulo: "CANCELACIÓN Y REEMBOLSOS",
      parrafos: [
        cp.cancelacion ??
          `Si ${P} cancela el viaje, aplicarán las siguientes condiciones sobre el valor total del plan, en atención a los gastos y compromisos irrevocables que EL ORGANIZADOR asume anticipadamente con los proveedores: (a) cancelación con sesenta (60) días calendario o más de antelación a la fecha de inicio: reembolso de lo pagado, descontando ciento cincuenta euros (150 €) por persona por gastos de gestión; (b) cancelación posterior: con más de 16 días de antelación, penalidad del 15% del valor total; entre 15 y 11 días, del 50%; entre 10 y 6 días, del 80%; con 5 días o menos, no presentación o abandono, sin devolución.`,
        ...parags(cancelacionParags),
      ],
    },
    retracto: {
      titulo: "DERECHO DE RETRACTO",
      parrafos: [
        `En los términos del artículo 47 de la Ley 1480 de 2011, por haberse celebrado este Contrato mediante métodos de venta a distancia, ${P} podrá ejercer el derecho de retracto dentro de los cinco (5) días hábiles siguientes a su celebración, siempre que no haya comenzado la prestación del servicio. El retracto deberá comunicarse por escrito, dentro de dicho plazo, al correo electrónico reservas@caminosacro.com. Ejercido en tiempo, EL ORGANIZADOR resolverá el Contrato y devolverá la totalidad de las sumas pagadas dentro de los treinta (30) días calendario siguientes, pudiendo descontar únicamente los gastos administrativos y bancarios efectivamente causados y comprobados.`,
      ],
    },
    reversion: {
      titulo: "REVERSIÓN DEL PAGO",
      parrafos: [
        `De acuerdo con el artículo 51 de la Ley 1480 de 2011 y el Decreto 587 de 2016, cuando el pago se haya realizado por medios electrónicos, ${P} podrá solicitar la reversión del pago en los eventos previstos en dichas normas (fraude, operación no solicitada, servicio no prestado o que no corresponda a lo solicitado), presentando queja ante EL ORGANIZADOR y notificando al emisor del instrumento de pago dentro de los cinco (5) días hábiles siguientes al hecho.`,
      ],
    },
    garantia: {
      titulo: "GARANTÍA",
      parrafos: [
        `EL ORGANIZADOR responde por la calidad e idoneidad del servicio de agenciamiento ofrecido${empresa ? "" : ", en los términos de los artículos 7 y siguientes de la Ley 1480 de 2011"}. Las reclamaciones se presentarán a través de los canales de la ${ref("notificaciones")}, indicando de forma clara los hechos y el incumplimiento concreto frente a las condiciones expresamente pactadas. EL ORGANIZADOR responderá dentro de los quince (15) días hábiles siguientes.`,
      ],
    },
    responsabilidad: {
      titulo: "RESPONSABILIDAD",
      parrafos: [
        `EL ORGANIZADOR responde por el cumplimiento de sus deberes de organización, coordinación e información, dentro del alcance definido en la ${ref("alcance")}, y por los perjuicios que cause por su propio dolo o culpa grave, responsabilidad que no se entiende excluida ni limitada por ninguna estipulación de este Contrato.`,
        `Tratándose de los servicios que ejecutan materialmente el operador en destino y sus proveedores, EL ORGANIZADOR responde por la diligencia en su selección y contratación, por la veracidad de la información que traslada a ${P} y por la gestión de las reclamaciones que este le presente, obligándose a exigir del proveedor la corrección del servicio o la compensación que corresponda y a informar por escrito el resultado de su gestión. No responde por el hecho exclusivo de un tercero ni por la culpa exclusiva de ${empresa ? "un viajero" : "EL VIAJERO"} —sin que ello lo libere del deber de gestión antes descrito—, ni por los eventos de fuerza mayor o caso fortuito de la ${ref("fuerza_mayor")}.`,
        `PARÁGRAFO. — ${P} conoce y acepta los riesgos inherentes a la actividad de caminata de larga distancia, que ${empresa ? "cada viajero asume" : "asume"} voluntariamente: lesiones, enfermedades, accidentes o pérdidas ocurridos durante el recorrido que no sean imputables a EL ORGANIZADOR. Toda reclamación se tramitará a través de EL ORGANIZADOR, quien la canalizará ante el proveedor correspondiente.`,
      ],
    },
    seguro: {
      titulo: "SEGURO DE VIAJE",
      parrafos: [
        `El plan incluye una póliza de seguro de viaje con coberturas médicas y de responsabilidad civil, con vigencia limitada al itinerario contratado. Las condiciones específicas de la póliza serán entregadas a ${P} antes del inicio del viaje. El seguro no cubre el trayecto desde el país de origen ni el retorno, ni fechas o estancias por fuera del itinerario. Será responsabilidad de ${P} revisar la póliza y, si lo estima necesario, contratar por su cuenta coberturas adicionales. Cualquier gasto médico o de otra índole que exceda las coberturas de la póliza será de cuenta exclusiva de ${empresa ? "EL CONTRATANTE o del viajero afectado" : "EL VIAJERO"}.`,
      ],
    },
    obligaciones_organizador: {
      titulo: "OBLIGACIONES DE EL ORGANIZADOR",
      parrafos: [
        `EL ORGANIZADOR se obliga a: (a) reservar y confirmar ante el operador y los proveedores los servicios descritos en el Anexo No. 1, en las fechas y condiciones pactadas, una vez recibidos los pagos que correspondan; (b) entregar a ${P} la documentación del viaje —itinerario definitivo, datos de los alojamientos, credencial del peregrino, póliza de seguro y canales de asistencia— a más tardar cinco (5) días calendario antes de la fecha de inicio; (c) mantener disponible durante todo el recorrido el canal de asistencia informado; (d) gestionar ante el operador y los proveedores cualquier incidencia que ${P} le reporte, e informarle por escrito el resultado de la gestión dentro del plazo de la ${ref("garantia")}; (e) informar por escrito y de forma oportuna cualquier cambio en el plan, en los términos de la ${ref("vigencia")}; y (f) tratar y custodiar la información personal que reciba conforme a la ${ref("datos")} y a la ley.`,
      ],
    },
    obligaciones_contratante: {
      titulo: empresa ? "OBLIGACIONES DE EL CONTRATANTE" : "OBLIGACIONES DE EL VIAJERO",
      parrafos: [
        empresa
          ? `EL CONTRATANTE se obliga a: (a) pagar el valor del plan en la forma y plazos pactados; (b) entregar a EL ORGANIZADOR la relación completa y veraz de los viajeros, con sus datos de identificación y la imagen de su documento de viaje, dentro de los plazos que EL ORGANIZADOR le indique, y comunicar oportunamente cualquier cambio; y (c) asegurar que cada uno de los viajeros relacionados en el Anexo No. 2: (i) gestione y porte, a su exclusivo costo y riesgo, la documentación exigida por las autoridades migratorias (pasaporte vigente, visados, certificados y demás requisitos) — la negativa de ingreso o la deportación por incumplimiento de estos requisitos no genera responsabilidad ni obligación de reembolso para EL ORGANIZADOR; (ii) llegue por sus propios medios, de forma oportuna, al punto de inicio del recorrido; (iii) suministre información veraz, completa y actualizada, incluida la relativa a su estado de salud cuando sea relevante para la prestación del servicio; (iv) atienda las recomendaciones e instrucciones razonables de EL ORGANIZADOR y de los proveedores, y cumpla las políticas de los alojamientos y transportistas, incluidas las de equipaje (máximo 15 kg por persona en el traslado entre etapas, salvo indicación distinta del Anexo No. 1); y (v) se abstenga de conductas que pongan en riesgo su seguridad, la de terceros o el normal desarrollo del viaje.`
          : `EL VIAJERO se obliga a: (a) pagar el valor del plan en la forma y plazos pactados; (b) gestionar y portar, a su exclusivo costo y riesgo, la documentación exigida por las autoridades migratorias (pasaporte vigente, visados, certificados y demás requisitos) — la negativa de ingreso o la deportación por incumplimiento de estos requisitos no genera responsabilidad ni obligación de reembolso para EL ORGANIZADOR; (c) llegar por sus propios medios, de forma oportuna, al punto de inicio del recorrido; (d) suministrar información veraz, completa y actualizada, incluida la relativa a su estado de salud cuando sea relevante para la prestación del servicio; (e) atender las recomendaciones e instrucciones razonables de EL ORGANIZADOR y de los proveedores, y cumplir las políticas de los alojamientos y transportistas, incluidas las de equipaje (máximo 15 kg por persona en el traslado entre etapas, salvo indicación distinta del Anexo No. 1); (f) abstenerse de conductas que pongan en riesgo su seguridad, la de terceros o el normal desarrollo del viaje.`,
      ],
    },
    responsabilidad_exclusiva: {
      titulo: empresa ? "RESPONSABILIDAD EXCLUSIVA DE EL CONTRATANTE Y DE LOS VIAJEROS" : "RESPONSABILIDAD EXCLUSIVA DE EL VIAJERO",
      parrafos: [
        empresa
          ? `Son de exclusiva responsabilidad de EL CONTRATANTE y de sus viajeros: la documentación y los requisitos migratorios de cada uno; el transporte aéreo y cualquier trayecto no incluido en el plan; la custodia del equipaje y las pertenencias; los gastos personales; los daños que causen a instalaciones, bienes o terceros; y las consecuencias de la conducta grave o imprudente de un viajero, incluyendo su exclusión de los servicios sin derecho a reembolso cuando dicha conducta afecte gravemente la prestación.`
          : `Son de exclusiva responsabilidad de EL VIAJERO: su documentación y requisitos migratorios; el transporte aéreo y cualquier trayecto no incluido en el plan; la custodia de su equipaje y pertenencias; sus gastos personales; los daños que cause a instalaciones, bienes o terceros; y las consecuencias de su propia conducta grave o imprudente, incluyendo la exclusión de servicios sin derecho a reembolso cuando dicha conducta afecte gravemente la prestación.`,
      ],
    },
    fuerza_mayor: {
      titulo: "FUERZA MAYOR Y CASO FORTUITO",
      parrafos: [
        `Se entiende por fuerza mayor o caso fortuito todo acontecimiento externo, imprevisible e irresistible, ajeno a la voluntad de las partes, que impida el cumplimiento total o parcial del Contrato: desastres naturales, actos de autoridad, cierres de fronteras, huelgas, epidemias o pandemias con restricciones de movilidad, entre otros de similar naturaleza. En tales eventos, las partes procurarán de buena fe la reprogramación del viaje o la aplicación de lo pagado a una nueva fecha, descontando los costos irrecuperables ya causados ante proveedores, que serán acreditados a ${P}. La imposibilidad de viajar por causas personales, laborales o médicas de ${empresa ? "un viajero" : "EL VIAJERO"}, o ${empresa ? "el desistimiento voluntario de EL CONTRATANTE" : "su desistimiento voluntario"}, no constituye fuerza mayor y se rige por la ${ref("cancelacion")}.`,
      ],
    },
    datos: {
      titulo: "TRATAMIENTO DE DATOS PERSONALES",
      parrafos: empresa
        ? [
            `EL CONTRATANTE entrega a ${firmanteOrg(v).nombre} (CAMINO SACRO), como responsable del tratamiento, los datos personales de los viajeros relacionados en el Anexo No. 2 — datos de identificación, de contacto y la imagen de su pasaporte o documento de identidad —, y declara que cuenta con la autorización previa, expresa e informada de cada uno de ellos para hacerlo, con las siguientes finalidades: gestionar la reserva y ejecución del plan; transmitirlos al operador en España y a los proveedores del viaje (alojamientos, aseguradora, transportistas) en cuanto sea necesario para la prestación del servicio, lo que implica una transferencia internacional de datos que cada viajero autoriza expresamente; emitir la documentación del viaje; y contactarlos en relación con el servicio. El tratamiento se realizará conforme a la Ley 1581 de 2012, al Decreto 1377 de 2013 y a la Política de Tratamiento de Datos Personales publicada en ${URL_POLITICA_DATOS}. Cada viajero podrá ejercer sus derechos de conocer, actualizar, rectificar y suprimir sus datos, y revocar la autorización, escribiendo a reservas@caminosacro.com, sin perjuicio de su derecho a presentar quejas ante la Superintendencia de Industria y Comercio.`,
            ...parags([
              `EL CONTRATANTE se obliga a mantener indemne a EL ORGANIZADOR frente a cualquier reclamación, sanción o perjuicio derivado de la ausencia, insuficiencia o revocatoria de las autorizaciones de tratamiento de datos de las que declara disponer. Recíprocamente, EL ORGANIZADOR se obliga a mantener indemne a EL CONTRATANTE frente a cualquier reclamación, sanción o perjuicio derivado del uso de esos datos para finalidades distintas de las aquí autorizadas o de su custodia negligente una vez recibidos.`,
              `La autorización para el uso de las imágenes o videos en los que aparezca cada viajero durante el viaje, con fines de memoria del viaje y divulgación en los canales de CAMINO SACRO, se otorga de forma individual y consta frente al nombre de cada uno en el Anexo No. 2. Esta autorización es independiente del servicio y puede ser revocada en cualquier momento.`,
            ]),
          ]
        : [
            `EL VIAJERO autoriza de manera previa, expresa e informada a ${firmanteOrg(v).nombre} (CAMINO SACRO), como responsable del tratamiento, para recolectar, almacenar, usar y circular sus datos personales — incluidos sus datos de identificación, de contacto y la imagen de su pasaporte o documento de identidad — con las siguientes finalidades: gestionar la reserva y ejecución del plan; transmitirlos al operador en España y a los proveedores del viaje (alojamientos, aseguradora, transportistas) en cuanto sea necesario para la prestación del servicio, lo que implica una transferencia internacional de datos que EL VIAJERO autoriza expresamente; emitir la documentación del viaje; y contactarlo en relación con el servicio. El tratamiento se realizará conforme a la Ley 1581 de 2012, al Decreto 1377 de 2013 y a la Política de Tratamiento de Datos Personales publicada en ${URL_POLITICA_DATOS}. EL VIAJERO podrá ejercer sus derechos de conocer, actualizar, rectificar y suprimir sus datos, y revocar la autorización, escribiendo a reservas@caminosacro.com, sin perjuicio de su derecho a presentar quejas ante la Superintendencia de Industria y Comercio.`,
            `PARÁGRAFO. — EL VIAJERO ${v.autoriza_imagen === "sí" ? "AUTORIZA" : "NO AUTORIZA"} el uso de las imágenes o videos en los que aparezca durante el viaje para fines de memoria del viaje y divulgación en los canales de CAMINO SACRO. Esta autorización es independiente del servicio y puede ser revocada en cualquier momento.`,
          ],
    },
    confidencialidad: {
      titulo: "CONFIDENCIALIDAD",
      parrafos: [
        `Cada parte se obliga a mantener bajo reserva la información de la otra a la que acceda con ocasión de este Contrato —incluida la relación de viajeros, sus datos personales y de contacto, y las condiciones comerciales aquí pactadas— y a usarla únicamente para su ejecución. Esta obligación subsiste por dos (2) años contados desde la terminación del Contrato. No se considera confidencial la información que sea de dominio público, la que la parte receptora conociera legítimamente con anterioridad, ni aquella cuya revelación exija una autoridad competente, caso en el cual la parte requerida informará a la otra cuando la ley se lo permita.`,
      ],
    },
    origen_fondos: {
      titulo: "ORIGEN DE FONDOS Y CONDUCTA EMPRESARIAL",
      parrafos: [
        `Cada parte declara que sus recursos, y los que destine a la ejecución de este Contrato, provienen de actividades lícitas; que no se encuentra incursa en investigaciones o condenas por lavado de activos, financiación del terrorismo, corrupción o soborno transnacional; y que ni ella ni sus representantes figuran en las listas restrictivas vinculantes para Colombia. Las partes se autorizan recíprocamente a consultar dichas listas y a verificar esta información. El incumplimiento o la inexactitud de esta declaración faculta a la otra parte para terminar el Contrato de forma unilateral e inmediata, sin indemnización a su cargo.`,
      ],
    },
    cesion: {
      titulo: "CESIÓN",
      parrafos: [
        `${P} no podrá ceder total ni parcialmente este Contrato sin autorización previa, expresa y escrita de EL ORGANIZADOR. De autorizarse, todos los costos, penalidades y cargos de la cesión ante los proveedores serán asumidos por ${empresa ? "EL CONTRATANTE" : "EL VIAJERO cedente"}.`,
        ...(empresa
          ? [
              `PARÁGRAFO. — EL CONTRATANTE podrá solicitar la sustitución de un viajero relacionado en el Anexo No. 2 por otra persona, hasta quince (15) días calendario antes de la fecha de inicio del viaje. La sustitución está sujeta a la disponibilidad y a las condiciones de los proveedores, causará el cargo de gestión previsto en la ${ref("modificaciones")} más la diferencia de tarifa que genere, y solo será efectiva cuando EL ORGANIZADOR la confirme por escrito. Aceptada la sustitución, el nuevo viajero queda cobijado por este Contrato en las mismas condiciones y EL CONTRATANTE deberá aportar su documentación y la autorización de tratamiento de datos de que trata la ${ref("datos")}.`,
            ]
          : []),
      ],
    },
    vigencia: {
      titulo: "VIGENCIA Y AJUSTES DEL PLAN",
      parrafos: [
        `Este Contrato rige desde su firma y hasta el cumplimiento total de las obligaciones de las partes. EL ORGANIZADOR y los proveedores podrán realizar ajustes razonables a los detalles logísticos del plan (orden de etapas, alojamientos equivalentes) cuando sea necesario para su ejecución adecuada y segura; tales ajustes serán comunicados oportunamente y no darán lugar a reembolsos ni indemnizaciones siempre que no afecten de manera sustancial el objeto contratado.`,
      ],
    },
    notificaciones: {
      titulo: "NOTIFICACIONES",
      parrafos: [
        empresa
          ? `Las comunicaciones y notificaciones entre las partes se realizarán por escrito a los siguientes canales: EL ORGANIZADOR: reservas@caminosacro.com; EL CONTRATANTE: ${v.empresa_email || "________"}, con dirección de notificaciones en ${domicilioEmpresa(v) || "________"}. Cada parte se obliga a informar cualquier cambio de su canal de notificación.`
          : `Las comunicaciones y notificaciones entre las partes se realizarán por escrito a los siguientes correos electrónicos: EL ORGANIZADOR: reservas@caminosacro.com; EL VIAJERO: ${v.viajero_email || "________"}. Cada parte se obliga a informar cualquier cambio de su canal de notificación.`,
      ],
    },
    controversias: {
      titulo: "SOLUCIÓN DE CONTROVERSIAS Y LEY APLICABLE",
      parrafos: [
        `Toda diferencia derivada de este Contrato se intentará resolver primero por arreglo directo. Cualquiera de las partes podrá convocar a la otra por escrito a los canales de la ${ref("notificaciones")}; la etapa de arreglo directo durará treinta (30) días calendario contados desde la convocatoria, prorrogables de común acuerdo. Agotada sin acuerdo, o vencido el plazo sin respuesta, las partes quedan en libertad de acudir a la jurisdicción ordinaria.`,
        `Este Contrato se rige por la ley colombiana y cualquier controversia será conocida por las autoridades y jueces de la República de Colombia${empresa ? "" : `, sin que ninguna estipulación pueda entenderse como renuncia de ${P} a los derechos que le reconoce el Estatuto del Consumidor`}.`,
      ],
    },
    firma: {
      titulo: "ACEPTACIÓN Y FIRMA ELECTRÓNICA",
      parrafos: [
        `Las partes acuerdan celebrar y firmar este Contrato por medios electrónicos, de conformidad con la Ley 527 de 1999 y el Decreto 2364 de 2012. La firma electrónica plasmada a través del mecanismo dispuesto por EL ORGANIZADOR — que registra la identidad declarada del firmante, fecha y hora, dirección IP, dispositivo y la huella digital (hash) del documento — se considera confiable y apropiada, y las partes le reconocen la misma validez y fuerza obligatoria de una firma manuscrita. Al firmar, ${empresa ? "EL CONTRATANTE, por conducto de su representante legal, declara que leyó y comprendió íntegramente este Contrato y sus anexos, que los acepta, y que cuenta con facultades suficientes para obligar a la sociedad que representa" : "EL VIAJERO declara que leyó y comprendió íntegramente este Contrato y sus anexos, y que los acepta"}.`,
      ],
    },
  };

  return ordenClausulas(empresa).map((clave, i) => ({
    title: `${ORDINALES_FEM[i]} — ${cuerpo[clave].titulo}`,
    paragraphs: cuerpo[clave].parrafos,
  }));
}

export function anexosTexto(v: ContractVariables, plan: PaymentPlan): string {
  const partes = [`Anexos: No. 1 — Cotización ${v.codigo_cotizacion} (itinerario, servicios incluidos y no incluidos, opcionales y valores).`];
  if (esEmpresa(v)) partes.push(`No. 2 — Relación de viajeros beneficiarios.`);
  if (llevaPagare(plan)) partes.push(`No. ${numeroAnexoPagare(v)} — Pagaré en blanco y carta de instrucciones.`);
  return partes.join(" ");
}

// ---------- Anexo del pagaré: pagaré + carta (financiado Y con_pagare) ----------
// Quien llame a esto debe preguntar antes por `llevaPagare(plan)`.

export function pagareSections(v: ContractVariables, fechaFirma: string): ContractSection[] {
  const f = fmtFechaLarga(fechaFirma);
  const empresa = esEmpresa(v);
  // En un contrato de empresa quien se obliga es la sociedad, no quien estampa la firma:
  // el representante legal la suscribe en nombre de ella.
  const deudor = empresa
    ? identificacionEmpresa(v)
    : `${v.viajero_nombre || "________________"}, identificado(a) con ${v.viajero_tipo_documento || "documento"} número ${v.viajero_documento || "________"}`;
  const calidad = empresa ? "CONTRATANTE" : "VIAJERO";
  const obrando = empresa ? "" : ", obrando en su propio nombre";
  return [
    {
      title: `ANEXO No. ${numeroAnexoPagare(v)} — PAGARÉ EN BLANCO No. ${v.codigo_cotizacion} Y CARTA DE INSTRUCCIONES`,
      paragraphs: [
        `${deudor}${obrando} (en adelante, EL DEUDOR), promete de manera incondicional e irrevocable pagar a ${firmanteOrg(v).nombre}, mayor de edad, ${identificacionOrg(v)} (en adelante, EL ACREEDOR), a su orden o a quien represente sus derechos, en la ciudad de Bogotá D.C., Colombia, en la fecha de vencimiento que adelante se indica, las siguientes sumas:`,
        `1.1. La suma de ______________________________ pesos ($______________) moneda legal colombiana, por concepto de capital; 1.2. La suma de ______________________________ pesos ($______________) moneda legal colombiana, por concepto de reembolso del impuesto de timbre causado por este pagaré, si aplica; 1.3. La suma de ______________________________ pesos ($______________) moneda legal colombiana, por concepto de intereses pendientes de pago a la fecha de vencimiento.`,
        `Intereses de mora. — La suma del numeral 1.1 devengará intereses de mora a partir de la fecha de vencimiento, a la máxima tasa moratoria permitida por las normas comerciales vigentes en Colombia.`,
        `Fecha de vencimiento. — La fecha en la cual EL DEUDOR pagará las sumas antes mencionadas es ______________________________.`,
        `Renuncias. — EL DEUDOR renuncia expresamente a cualquier presentación, protesto, requerimiento o notificación adicional de cualquier naturaleza, así como a la constitución en mora.`,
        `Ley aplicable. — Este pagaré se rige por las leyes de la República de Colombia. Este pagaré se suscribe el ${f}.`,
      ],
    },
    {
      title: "CARTA DE INSTRUCCIONES",
      paragraphs: [
        `${deudor} (en adelante, EL DEUDOR), conforme al artículo 622 del Código de Comercio, por medio de la presente imparto instrucciones y otorgo facultades permanentes e irrevocables a ${firmanteOrg(v).nombre}, ${identificacionOrg(v)} (en adelante, EL ACREEDOR), y/o a sus cesionarios o causahabientes, para llenar los espacios en blanco del pagaré No. ${v.codigo_cotizacion}, en los términos siguientes:`,
        `Autorización para llenar el pagaré. — El ${f} se suscribió el Acuerdo de Prestación de Servicios Turísticos entre EL DEUDOR, en calidad de ${calidad}, y EL ACREEDOR, titular del nombre comercial CAMINO SACRO (el “Contrato”), asociado a la cotización No. ${v.codigo_cotizacion}, bajo el cual EL DEUDOR asumió obligaciones dinerarias conforme al plan de pago financiado allí pactado. En caso de que EL DEUDOR incumpla total o parcialmente sus obligaciones de pago bajo el Contrato, EL ACREEDOR podrá llenar los espacios en blanco del pagaré sin necesidad de aviso previo, presentación, protesto ni requerimiento de ninguna naturaleza. En tal evento se entenderá extinguido el plazo pendiente y será exigible el pago inmediato de la totalidad de las obligaciones con sus accesorios.`,
        `Sumas de capital (numeral 1.1). — Se llenará con todas las sumas adeudadas a EL ACREEDOR bajo el Contrato por concepto de capital el día en que se diligencie, incluyendo las declaradas vencidas por aceleración. Para la conversión de los valores pactados en euros se aplicará la tasa de referencia EUR/COP vigente el día del diligenciamiento.`,
        `Impuesto de timbre (numeral 1.2). — Se llenará con el valor del impuesto de timbre que se cause con ocasión del pagaré, si aplica, el cual será asumido por EL DEUDOR.`,
        `Intereses pendientes (numeral 1.3). — Se llenará con las sumas adeudadas por concepto de intereses pendientes de pago el día del diligenciamiento.`,
        `Fecha de vencimiento. — Se llenará con la fecha del día en que EL ACREEDOR diligencie los espacios en blanco.`,
        `El pagaré así llenado será exigible inmediatamente y prestará mérito ejecutivo sin más requisitos. EL DEUDOR declara haber recibido copia del pagaré y de esta carta de instrucciones.`,
      ],
    },
  ];
}
