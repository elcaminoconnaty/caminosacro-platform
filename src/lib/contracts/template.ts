// Plantilla del Acuerdo de Prestación de Servicios Turísticos de Camino Sacro.
// Fuente única de verdad del texto legal: la consumen el PDF (contractPdf.tsx),
// el editor del CRM (ContractCard) y la página pública de firma (/contrato/[token]).
// El texto fue redactado bajo ley colombiana (Ley 1480/2011, Ley 1581/2012,
// Ley 527/1999) — ver `Camino Sacro/Contrato/` para el histórico y el PDF plantilla.

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
};

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

export function contractIntro(v: ContractVariables): string[] {
  return [
    `(i) NICOLÁS VILLA POSADA, mayor de edad, identificado con la cédula de ciudadanía número 1.017.126.076, obrando en su propio nombre como titular del nombre comercial “CAMINO SACRO” (caminosacro.com), quien en adelante se denominará “EL ORGANIZADOR”, y`,
    `(ii) ${v.viajero_nombre || "________________"}, mayor de edad, identificado(a) con ${v.viajero_tipo_documento || "documento"} número ${v.viajero_documento || "________"}, obrando en su propio nombre, quien en adelante se denominará “EL VIAJERO”.`,
    `Ambas partes se reconocen mutuamente la capacidad legal necesaria y acuerdan celebrar el presente contrato de prestación de servicios turísticos (en adelante, “el Contrato”), asociado a la cotización No. ${v.codigo_cotizacion}, el cual se regirá por las cláusulas aquí establecidas y, en lo no previsto, por las normas civiles y comerciales de la República de Colombia y por la Ley 1480 de 2011.`,
  ];
}

export function contractConsideraciones(v: ContractVariables): string[] {
  return [
    `1. CAMINO SACRO organiza y comercializa planes turísticos para recorrer las rutas del Camino de Santiago (España), integrando en un solo producto, con un precio global, una combinación de servicios de carácter turístico prestados por terceros: alojamiento, traslado de equipaje entre etapas, asistencia en ruta, seguro de viaje y servicios complementarios.`,
    `2. La ejecución material de los servicios en destino está a cargo de un operador mayorista habilitado como agencia de viajes en España y de su red de proveedores locales (alojamientos, transportistas y aseguradoras), con quienes EL ORGANIZADOR contrata para conformar el plan.`,
    `3. La experiencia contratada es autoguiada: EL VIAJERO recorre las etapas a su propio ritmo, sin grupo cerrado ni acompañamiento presencial permanente, con el respaldo logístico y la asistencia contratados.`,
    `4. EL VIAJERO conoció y aceptó previamente la cotización No. ${v.codigo_cotizacion}, cuyo contenido (itinerario, servicios incluidos y no incluidos, opcionales y valores) hace parte integral de este Contrato como Anexo No. 1.`,
  ];
}

export function contractClauses(v: ContractVariables, plan: PaymentPlan): ContractSection[] {
  const financiado = plan.type === "financiado";
  const conPagare = llevaPagare(plan);
  const numCuotas = financiado ? plan.cuotas.length : 0;
  const crono = financiado ? cronogramaTexto(plan) : "";

  // Cláusula Tercera según la moneda en que paga el viajero. Si paga en euros
  // (transferencia a la cuenta de España) no se menciona la tasa ni el COP.
  const valorClause =
    v.moneda === "COP"
      ? `El valor total del plan es de ${v.valor_total_cop} pesos colombianos (COP), equivalente a ${v.valor_total_eur} euros (EUR) según la tasa de referencia EUR/COP de ${v.trm} vigente el ${fmtFechaLarga(v.fecha_cotizacion)}. Cuando EL VIAJERO realice pagos parciales o anticipados en pesos, cada pago se liquidará a la tasa de referencia vigente el día del pago; las fluctuaciones de la tasa de cambio son asumidas íntegramente por EL VIAJERO. La cotización tiene una validez de ${v.validez} días desde su emisión.`
      : `El valor total del plan es de ${v.valor_total_eur} euros (EUR), pagadero en euros mediante transferencia a la cuenta que EL ORGANIZADOR indique. La cotización tiene una validez de ${v.validez} días desde su emisión.`;

  const formaPago: string[] = [
    `Por regla general, EL VIAJERO pagará el cien por ciento (100%) del valor del plan al momento de confirmar la reserva, mediante los medios de pago que EL ORGANIZADOR le informe.`,
  ];
  if (financiado) {
    // Los parágrafos se numeran seguidos. Sin pagaré, el que era CUARTO pasa a TERCERO:
    // un contrato que salta del SEGUNDO al CUARTO delata que se le quitó algo, y en un
    // documento que se firma eso invita a preguntas que no tienen buena respuesta.
    const parrafos = [
      `Las partes pactan un plan de pagos en ${numCuotas} cuotas, conforme al siguiente cronograma, que hace parte de este Contrato: ${crono}. En todo caso, el cien por ciento (100%) del valor del plan deberá estar pagado a más tardar sesenta (60) días calendario antes de la fecha de inicio del viaje. Sin el pago total no habrá lugar a la entrega de la documentación del viaje ni a la prestación de los servicios.`,
      `El plan financiado no causa intereses remuneratorios. En caso de mora en cualquiera de las cuotas, EL ORGANIZADOR podrá cobrar intereses moratorios a la tasa máxima legal permitida, declarar vencido el plazo de las cuotas pendientes y exigir su pago inmediato, y, transcurridos cinco (5) días calendario desde el vencimiento sin pago ni justificación, entender que EL VIAJERO ha desistido del viaje, con aplicación de la política de cancelación de la cláusula sexta y liberación del cupo.`,
      ...(conPagare
        ? [`Como garantía de las obligaciones dinerarias de este Contrato, EL VIAJERO suscribe un pagaré en blanco con carta de instrucciones (Anexo No. 2), de conformidad con los artículos 621, 622 y 710 del Código de Comercio.`]
        : []),
      `Los costos y comisiones bancarias o de la pasarela de pago dependen del banco desde donde se origina el pago y de la forma de pago elegida, y son asumidos por EL VIAJERO. Se tendrá como valor pagado el que efectivamente ingrese a la cuenta de EL ORGANIZADOR; si el monto acreditado es menor al pactado, EL VIAJERO deberá realizar el ajuste correspondiente por la diferencia. Los pagos se entienden recibidos cuando EL ORGANIZADOR confirme su acreditación por escrito.`,
    ];
    const ORDINALES = ["PRIMERO", "SEGUNDO", "TERCERO", "CUARTO", "QUINTO"];
    formaPago.push(
      ...parrafos.map(
        (texto, i) =>
          `PARÁGRAFO ${ORDINALES[i]}${i === 0 ? " (PLAN FINANCIADO)" : ""}. — ${texto}`,
      ),
    );
  } else {
    formaPago.push(
      `PARÁGRAFO PRIMERO. — Si con posterioridad las partes pactan por escrito un plan de pagos en cuotas, el cien por ciento (100%) del valor del plan deberá estar pagado a más tardar sesenta (60) días calendario antes de la fecha de inicio del viaje; sin el pago total no habrá lugar a la entrega de la documentación del viaje ni a la prestación de los servicios.`,
      `PARÁGRAFO SEGUNDO. — Los costos y comisiones bancarias o de la pasarela de pago dependen del banco desde donde se origina el pago y de la forma de pago elegida, y son asumidos por EL VIAJERO. Se tendrá como valor pagado el que efectivamente ingrese a la cuenta de EL ORGANIZADOR; si el monto acreditado es menor al pactado, EL VIAJERO deberá realizar el ajuste correspondiente por la diferencia. Los pagos se entienden recibidos cuando EL ORGANIZADOR confirme su acreditación por escrito.`,
    );
  }

  return [
    {
      title: "PRIMERA — OBJETO",
      paragraphs: [
        `EL ORGANIZADOR se obliga frente a EL VIAJERO a organizar, coordinar y gestionar el plan turístico ${v.ruta_nombre}, con origen en ${v.origen || "—"} y destino ${v.destino || "Santiago de Compostela"}, entre el ${fmtFechaLarga(v.fecha_inicio)} y el ${fmtFechaLarga(v.fecha_fin)}, para ${v.num_personas} persona(s), en modalidad ${v.modalidad || "—"} con acomodación ${v.habitaciones || "según cotización"}, conforme al detalle del Anexo No. 1.`,
      ],
    },
    {
      title: "SEGUNDA — ALCANCE Y NATURALEZA DEL SERVICIO",
      paragraphs: [
        `EL ORGANIZADOR actúa como organizador del plan: selecciona, contrata y coordina con los proveedores los servicios que lo componen y acompaña a EL VIAJERO en la preparación del viaje y durante su ejecución a través de los canales de asistencia informados. La ejecución material de los servicios en destino (alojamientos, traslado de equipaje, asistencia en ruta) corresponde al operador mayorista habilitado como agencia de viajes en España y a sus proveedores.`,
        `PARÁGRAFO PRIMERO. — El plan comprende los servicios expresamente señalados como incluidos en el Anexo No. 1: ${v.incluye}. No comprende, entre otros, los señalados como no incluidos: ${v.no_incluye}. Los servicios opcionales (${v.opcionales || "ninguno"}) solo harán parte del plan si fueron contratados y pagados expresamente.`,
        `PARÁGRAFO SEGUNDO. — EL ORGANIZADOR no presta ni organiza el transporte aéreo ni ningún trayecto desde o hacia el país de origen de EL VIAJERO, ni el desplazamiento hasta el punto de inicio del recorrido, los cuales son de exclusiva cuenta y responsabilidad de EL VIAJERO.`,
      ],
    },
    {
      title: "TERCERA — VALOR Y MONEDA",
      paragraphs: [valorClause],
    },
    { title: "CUARTA — FORMA DE PAGO", paragraphs: formaPago },
    {
      title: "QUINTA — MODIFICACIONES SOLICITADAS POR EL VIAJERO",
      paragraphs: [
        `Toda modificación del plan ya reservado (fechas, etapas, alojamientos, número de noches o servicios) está sujeta a disponibilidad de los proveedores y causará un cargo de gestión de cien euros (100 €) por persona, más la diferencia de tarifa que la modificación genere. EL ORGANIZADOR gestionará la solicitud pero no garantiza disponibilidad, costo ni resultado.`,
      ],
    },
    {
      title: "SEXTA — CANCELACIÓN Y REEMBOLSOS",
      paragraphs: [
        `Si EL VIAJERO cancela el viaje, aplicarán las siguientes condiciones sobre el valor total del plan, en atención a los gastos y compromisos irrevocables que EL ORGANIZADOR asume anticipadamente con los proveedores: (a) cancelación con sesenta (60) días calendario o más de antelación a la fecha de inicio: reembolso de lo pagado, descontando ciento cincuenta euros (150 €) por persona por gastos de gestión; (b) cancelación posterior: con más de 16 días de antelación, penalidad del 15% del valor total; entre 15 y 11 días, del 50%; entre 10 y 6 días, del 80%; con 5 días o menos, no presentación o abandono, sin devolución.`,
        `PARÁGRAFO PRIMERO. — La suspensión, interrupción o abandono del viaje por parte de EL VIAJERO una vez iniciado, o el cambio de itinerario por razones personales, no dará lugar a reembolso, y los costos y gestiones adicionales que ello implique serán de su exclusiva cuenta.`,
        `PARÁGRAFO SEGUNDO. — Los reembolsos aprobados se realizarán dentro de los treinta (30) días calendario siguientes a la validación de la solicitud, por el mismo medio de pago utilizado, salvo acuerdo distinto. Las tasas, comisiones bancarias o cambiarias que se generen dentro de la transacción de reembolso serán asumidas por EL VIAJERO y se descontarán del valor a devolver.`,
      ],
    },
    {
      title: "SÉPTIMA — DERECHO DE RETRACTO",
      paragraphs: [
        `En los términos del artículo 47 de la Ley 1480 de 2011, por haberse celebrado este Contrato mediante métodos de venta a distancia, EL VIAJERO podrá ejercer el derecho de retracto dentro de los cinco (5) días hábiles siguientes a su celebración, siempre que no haya comenzado la prestación del servicio. El retracto deberá comunicarse por escrito, dentro de dicho plazo, al correo electrónico reservas@caminosacro.com. Ejercido en tiempo, EL ORGANIZADOR resolverá el Contrato y devolverá la totalidad de las sumas pagadas dentro de los treinta (30) días calendario siguientes, pudiendo descontar únicamente los gastos administrativos y bancarios efectivamente causados y comprobados.`,
      ],
    },
    {
      title: "OCTAVA — REVERSIÓN DEL PAGO",
      paragraphs: [
        `De acuerdo con el artículo 51 de la Ley 1480 de 2011 y el Decreto 587 de 2016, cuando el pago se haya realizado por medios electrónicos, EL VIAJERO podrá solicitar la reversión del pago en los eventos previstos en dichas normas (fraude, operación no solicitada, servicio no prestado o que no corresponda a lo solicitado), presentando queja ante EL ORGANIZADOR y notificando al emisor del instrumento de pago dentro de los cinco (5) días hábiles siguientes al hecho.`,
      ],
    },
    {
      title: "NOVENA — GARANTÍA",
      paragraphs: [
        `EL ORGANIZADOR responde por la calidad e idoneidad del servicio de organización y coordinación ofrecido, en los términos de los artículos 7 y siguientes de la Ley 1480 de 2011. Las reclamaciones se presentarán a través de los canales de la cláusula décima octava, indicando de forma clara los hechos y el incumplimiento concreto frente a las condiciones expresamente pactadas. EL ORGANIZADOR responderá dentro de los quince (15) días hábiles siguientes. No serán procedentes reclamaciones fundadas exclusivamente en percepciones subjetivas o expectativas no pactadas.`,
      ],
    },
    {
      title: "DÉCIMA — RESPONSABILIDAD",
      paragraphs: [
        `EL ORGANIZADOR responde por el cumplimiento de sus deberes de organización, coordinación e información, y por los perjuicios que cause por su propio dolo o culpa grave, responsabilidad que no se entiende excluida ni limitada por ninguna estipulación de este Contrato. Sin perjuicio de lo anterior, EL VIAJERO acepta que EL ORGANIZADOR no será responsable por: (a) fallas operativas en la ejecución material de los servicios atribuibles exclusivamente al operador en España o a los proveedores en destino (cambios de alojamiento por disponibilidad, retrasos o incidencias en el traslado de equipaje, deficiencias del servicio hotelero), sin perjuicio de su deber de gestionar la reclamación ante el proveedor; (b) situaciones de fuerza mayor o caso fortuito conforme a la cláusula décima cuarta; (c) los riesgos inherentes a la actividad de caminata de larga distancia que EL VIAJERO asume voluntariamente: lesiones, enfermedades, accidentes o pérdidas ocurridos durante el recorrido que no sean imputables a EL ORGANIZADOR.`,
        `PARÁGRAFO. — Toda reclamación de EL VIAJERO se tramitará a través de EL ORGANIZADOR, quien la canalizará ante el proveedor correspondiente. Este Contrato se rige por la ley colombiana y cualquier controversia será conocida por las autoridades y jueces de la República de Colombia, sin que ninguna estipulación pueda entenderse como renuncia de EL VIAJERO a los derechos que le reconoce el Estatuto del Consumidor.`,
      ],
    },
    {
      title: "DÉCIMA PRIMERA — SEGURO DE VIAJE",
      paragraphs: [
        `El plan incluye una póliza de seguro de viaje con coberturas médicas y de responsabilidad civil, con vigencia limitada al itinerario contratado. Las condiciones específicas de la póliza serán entregadas a EL VIAJERO antes del inicio del viaje. El seguro no cubre el trayecto desde el país de origen ni el retorno, ni fechas o estancias por fuera del itinerario. Será responsabilidad de EL VIAJERO revisar la póliza y, si lo estima necesario, contratar por su cuenta coberturas adicionales. Cualquier gasto médico o de otra índole que exceda las coberturas de la póliza será de cuenta exclusiva de EL VIAJERO.`,
      ],
    },
    {
      title: "DÉCIMA SEGUNDA — OBLIGACIONES DEL VIAJERO",
      paragraphs: [
        `EL VIAJERO se obliga a: (a) pagar el valor del plan en la forma y plazos pactados; (b) gestionar y portar, a su exclusivo costo y riesgo, la documentación exigida por las autoridades migratorias (pasaporte vigente, visados, certificados y demás requisitos) — la negativa de ingreso o la deportación por incumplimiento de estos requisitos no genera responsabilidad ni obligación de reembolso para EL ORGANIZADOR; (c) llegar por sus propios medios, de forma oportuna, al punto de inicio del recorrido; (d) suministrar información veraz, completa y actualizada, incluida la relativa a su estado de salud cuando sea relevante para la prestación del servicio; (e) atender las recomendaciones e instrucciones razonables de EL ORGANIZADOR y de los proveedores, y cumplir las políticas de los alojamientos y transportistas, incluidas las de equipaje (máximo 15 kg por persona en el traslado entre etapas, salvo indicación distinta del Anexo No. 1); (f) abstenerse de conductas que pongan en riesgo su seguridad, la de terceros o el normal desarrollo del viaje.`,
      ],
    },
    {
      title: "DÉCIMA TERCERA — RESPONSABILIDAD EXCLUSIVA DEL VIAJERO",
      paragraphs: [
        `Son de exclusiva responsabilidad de EL VIAJERO: su documentación y requisitos migratorios; el transporte aéreo y cualquier trayecto no incluido en el plan; la custodia de su equipaje y pertenencias; sus gastos personales; los daños que cause a instalaciones, bienes o terceros; y las consecuencias de su propia conducta grave o imprudente, incluyendo la exclusión de servicios sin derecho a reembolso cuando dicha conducta afecte gravemente la prestación.`,
      ],
    },
    {
      title: "DÉCIMA CUARTA — FUERZA MAYOR Y CASO FORTUITO",
      paragraphs: [
        `Se entiende por fuerza mayor o caso fortuito todo acontecimiento externo, imprevisible e irresistible, ajeno a la voluntad de las partes, que impida el cumplimiento total o parcial del Contrato: desastres naturales, actos de autoridad, cierres de fronteras, huelgas, epidemias o pandemias con restricciones de movilidad, entre otros de similar naturaleza. En tales eventos, las partes procurarán de buena fe la reprogramación del viaje o la aplicación de lo pagado a una nueva fecha, descontando los costos irrecuperables ya causados ante proveedores, que serán acreditados a EL VIAJERO. La imposibilidad de viajar por causas personales, laborales o médicas de EL VIAJERO, o su desistimiento voluntario, no constituye fuerza mayor y se rige por la cláusula sexta.`,
      ],
    },
    {
      title: "DÉCIMA QUINTA — TRATAMIENTO DE DATOS PERSONALES",
      paragraphs: [
        `EL VIAJERO autoriza de manera previa, expresa e informada a NICOLÁS VILLA POSADA (CAMINO SACRO), como responsable del tratamiento, para recolectar, almacenar, usar y circular sus datos personales — incluidos sus datos de identificación, de contacto y la imagen de su pasaporte o documento de identidad — con las siguientes finalidades: gestionar la reserva y ejecución del plan; transmitirlos al operador en España y a los proveedores del viaje (alojamientos, aseguradora, transportistas) en cuanto sea necesario para la prestación del servicio, lo que implica una transferencia internacional de datos que EL VIAJERO autoriza expresamente; emitir la documentación del viaje; y contactarlo en relación con el servicio. El tratamiento se realizará conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013. EL VIAJERO podrá ejercer sus derechos de conocer, actualizar, rectificar y suprimir sus datos, y revocar la autorización, escribiendo a reservas@caminosacro.com, sin perjuicio de su derecho a presentar quejas ante la Superintendencia de Industria y Comercio.`,
        `PARÁGRAFO. — EL VIAJERO ${v.autoriza_imagen === "sí" ? "AUTORIZA" : "NO AUTORIZA"} el uso de las imágenes o videos en los que aparezca durante el viaje para fines de memoria del viaje y divulgación en los canales de CAMINO SACRO. Esta autorización es independiente del servicio y puede ser revocada en cualquier momento.`,
      ],
    },
    {
      title: "DÉCIMA SEXTA — CESIÓN",
      paragraphs: [
        `EL VIAJERO no podrá ceder total ni parcialmente este Contrato sin autorización previa, expresa y escrita de EL ORGANIZADOR. De autorizarse, todos los costos, penalidades y cargos de la cesión ante los proveedores serán asumidos por EL VIAJERO cedente.`,
      ],
    },
    {
      title: "DÉCIMA SÉPTIMA — VIGENCIA Y AJUSTES DEL PLAN",
      paragraphs: [
        `Este Contrato rige desde su firma y hasta el cumplimiento total de las obligaciones de las partes. EL ORGANIZADOR y los proveedores podrán realizar ajustes razonables a los detalles logísticos del plan (orden de etapas, alojamientos equivalentes) cuando sea necesario para su ejecución adecuada y segura; tales ajustes serán comunicados oportunamente y no darán lugar a reembolsos ni indemnizaciones siempre que no afecten de manera sustancial el objeto contratado.`,
      ],
    },
    {
      title: "DÉCIMA OCTAVA — NOTIFICACIONES",
      paragraphs: [
        `Las comunicaciones y notificaciones entre las partes se realizarán por escrito a los siguientes correos electrónicos: EL ORGANIZADOR: reservas@caminosacro.com; EL VIAJERO: ${v.viajero_email || "________"}. Cada parte se obliga a informar cualquier cambio de su canal de notificación.`,
      ],
    },
    {
      title: "DÉCIMA NOVENA — ACEPTACIÓN Y FIRMA ELECTRÓNICA",
      paragraphs: [
        `Las partes acuerdan celebrar y firmar este Contrato por medios electrónicos, de conformidad con la Ley 527 de 1999 y el Decreto 2364 de 2012. La firma electrónica plasmada a través del mecanismo dispuesto por EL ORGANIZADOR — que registra la identidad declarada del firmante, fecha y hora, dirección IP, dispositivo y la huella digital (hash) del documento — se considera confiable y apropiada, y las partes le reconocen la misma validez y fuerza obligatoria de una firma manuscrita. Al firmar, EL VIAJERO declara que leyó y comprendió íntegramente este Contrato y sus anexos, y que los acepta.`,
      ],
    },
  ];
}

export function anexosTexto(v: ContractVariables, plan: PaymentPlan): string {
  const base = `Anexos: No. 1 — Cotización ${v.codigo_cotizacion} (itinerario, servicios incluidos y no incluidos, opcionales y valores).`;
  return llevaPagare(plan)
    ? `${base} No. 2 — Pagaré en blanco y carta de instrucciones.`
    : base;
}

// ---------- Anexo No. 2: pagaré + carta (financiado Y con_pagare) ----------
// Quien llame a esto debe preguntar antes por `llevaPagare(plan)`.

export function pagareSections(v: ContractVariables, fechaFirma: string): ContractSection[] {
  const f = fmtFechaLarga(fechaFirma);
  const deudor = `${v.viajero_nombre || "________________"}, identificado(a) con ${v.viajero_tipo_documento || "documento"} número ${v.viajero_documento || "________"}`;
  return [
    {
      title: `ANEXO No. 2 — PAGARÉ EN BLANCO No. ${v.codigo_cotizacion} Y CARTA DE INSTRUCCIONES`,
      paragraphs: [
        `${deudor}, obrando en su propio nombre (en adelante, EL DEUDOR), promete de manera incondicional e irrevocable pagar a NICOLÁS VILLA POSADA, mayor de edad, identificado con la cédula de ciudadanía número 1.017.126.076 (en adelante, EL ACREEDOR), a su orden o a quien represente sus derechos, en la ciudad de Bogotá D.C., Colombia, en la fecha de vencimiento que adelante se indica, las siguientes sumas:`,
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
        `${deudor} (en adelante, EL DEUDOR), conforme al artículo 622 del Código de Comercio, por medio de la presente imparto instrucciones y otorgo facultades permanentes e irrevocables a NICOLÁS VILLA POSADA, C.C. 1.017.126.076 (en adelante, EL ACREEDOR), y/o a sus cesionarios o causahabientes, para llenar los espacios en blanco del pagaré No. ${v.codigo_cotizacion}, en los términos siguientes:`,
        `Autorización para llenar el pagaré. — El ${f} se suscribió el Acuerdo de Prestación de Servicios Turísticos entre EL DEUDOR, en calidad de VIAJERO, y EL ACREEDOR, titular del nombre comercial CAMINO SACRO (el “Contrato”), asociado a la cotización No. ${v.codigo_cotizacion}, bajo el cual EL DEUDOR asumió obligaciones dinerarias conforme al plan de pago financiado allí pactado. En caso de que EL DEUDOR incumpla total o parcialmente sus obligaciones de pago bajo el Contrato, EL ACREEDOR podrá llenar los espacios en blanco del pagaré sin necesidad de aviso previo, presentación, protesto ni requerimiento de ninguna naturaleza. En tal evento se entenderá extinguido el plazo pendiente y será exigible el pago inmediato de la totalidad de las obligaciones con sus accesorios.`,
        `Sumas de capital (numeral 1.1). — Se llenará con todas las sumas adeudadas a EL ACREEDOR bajo el Contrato por concepto de capital el día en que se diligencie, incluyendo las declaradas vencidas por aceleración. Para la conversión de los valores pactados en euros se aplicará la tasa de referencia EUR/COP vigente el día del diligenciamiento.`,
        `Impuesto de timbre (numeral 1.2). — Se llenará con el valor del impuesto de timbre que se cause con ocasión del pagaré, si aplica, el cual será asumido por EL DEUDOR.`,
        `Intereses pendientes (numeral 1.3). — Se llenará con las sumas adeudadas por concepto de intereses pendientes de pago el día del diligenciamiento.`,
        `Fecha de vencimiento. — Se llenará con la fecha del día en que EL ACREEDOR diligencie los espacios en blanco.`,
        `El pagaré así llenado será exigible inmediatamente y prestará mérito ejecutivo sin más requisitos. EL DEUDOR declara haber recibido copia del pagaré y de esta carta de instrucciones.`,
      ],
    },
  ];
}
