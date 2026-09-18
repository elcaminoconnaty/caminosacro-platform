// Condiciones pactadas con Colegiatura (CS-2026-080), en un solo sitio.
//
// Las lee la vista previa (colegiatura_preview.tsx) y el guardado (colegiatura_guardar.ts),
// para que lo que se revisa y lo que se guarda no puedan separarse.
//
// Por qué existe este archivo: Colegiatura revisó el contrato contra el Anexo No. 1 y
// encontró tres diferencias — porcentajes de cancelación, cargo por modificación y plazos
// de pago — y devolvió el contrato sin firmar. Acá quedan los dos documentos diciendo lo
// mismo. Unificar la plantilla de la cotización con el articulado, para que no vuelvan a
// separarse en el próximo cliente, es tarea aparte.
import type { CondicionesParticulares } from "../src/lib/contracts/template";
import type { CondicionesCotizacion } from "../src/lib/quotePdf";

/**
 * Correcciones de datos del contrato que salieron al comparar los dos documentos lado a
 * lado. No son condiciones pactadas: son campos que decían algo distinto de la cotización
 * o que se leían mal, y que el CRM deja editar como cualquier otra variable.
 */
export const VARIABLES_CORREGIDAS = {
  // Decía "29". La cotización se emitió el 28-ago y vale hasta el 27-sep: son 30 días, y
  // es el número que imprime la cotización. Dos documentos, dos cifras distintas.
  validez: "30",
  // Decía "8962": el resto del contrato escribe "8.962 €". Sin el punto, la cláusula
  // tercera es la única cifra del documento con otro formato.
  valor_total_eur: "8.962",
  // Las dos variables traían el mismo texto, así que la cláusula primera decía "en
  // modalidad Pensión · 3 triples + 2 dobles con acomodación Pensión · 3 triples + 2
  // dobles". Separadas, cada una dice lo suyo.
  modalidad: "pensión (alojamiento y desayuno)",
  habitaciones: "privada con baño privado, en 3 habitaciones triples y 2 habitaciones dobles",
} as const;

/** Valor total y cuotas, de una sola fuente: los dos documentos citan estas cifras. */
export const TOTAL_EUR = "8.962";
export const CUOTA_1 = { eur: "3.584,80", pct: "40%", fecha: "4 de septiembre de 2026" };
export const CUOTA_2 = { eur: "5.377,20", pct: "60%", fecha: "15 de septiembre de 2026" };

// ---------- Anexo No. 1 de la cláusula segunda ----------

export const INCLUYE =
  "Siete (7) noches de alojamiento en pensión con baño privado, siete (7) desayunos, traslado privado de Porto a Baiona el 17 de octubre de 2026 —con recogida a las 11:00 a. m. en el Eurostars Das Artes (Porto), para los 13 viajeros y su equipaje—, traslado de equipaje entre etapas (1 bulto de máximo 15 kg por persona, en las etapas definidas en el itinerario del Anexo No. 1), credencial del peregrino, gestión de la Compostela, asistencia telefónica 24 horas, seguro de viaje con coberturas médicas y de responsabilidad civil, y guía del Camino en PDF";

// Sin la línea "traslado hasta el punto de inicio del Camino": ese traslado es justo el de
// Porto a Baiona, que SÍ está incluido. Tenerla acá era la mitad de la contradicción que
// hizo preguntar a Colegiatura si los 612 € estaban dentro de los 8.962 €.
export const NO_INCLUYE =
  "Traslados desde y hasta el país o ciudad de origen, almuerzos y cenas no especificados, tasas turísticas (de pago directo en el alojamiento, cuyo importe varía según población, tipo y categoría del alojamiento) y cualquier servicio no señalado expresamente como incluido";

// La otra mitad: el traslado estaba como OPCIONAL, y la cláusula segunda dice que los
// opcionales "solo harán parte del plan si fueron contratados y pagados expresamente".
export const OPCIONALES =
  "ninguno pendiente: el traslado privado de Porto a Baiona, por 612 €, quedó contratado y pagado, y está comprendido dentro del valor total de 8.962 € de la cláusula tercera";

// ---------- Articulado del contrato ----------

export const CONDICIONES_CONTRATO: CondicionesParticulares = {
  pago:
    "Conforme al Anexo No. 1, la confirmación de la reserva exige un pago inicial del treinta por ciento (30%) del valor del plan, con un mínimo de ciento cincuenta euros (150 €) por persona —no reembolsables—, dentro de los siete (7) días siguientes a la confirmación, y el saldo debe estar abonado antes de la fecha de inicio del viaje. Sin el pago total no hay lugar a la entrega de la documentación del viaje ni a la prestación de los servicios.",
  pago_parags: [
    `Las partes dejan constancia del plan de pagos efectivamente acordado y cumplido, que hace parte de este Contrato: cuota 1: tres mil quinientos ochenta y cuatro euros con ochenta céntimos (${CUOTA_1.eur} €), equivalentes al cuarenta por ciento (${CUOTA_1.pct}) del valor total, recibida el ${CUOTA_1.fecha}; cuota 2: cinco mil trescientos setenta y siete euros con veinte céntimos (${CUOTA_2.eur} €), equivalentes al sesenta por ciento (${CUOTA_2.pct}) restante, recibida el ${CUOTA_2.fecha}.`,
    `EL ORGANIZADOR declara haber recibido el cien por ciento (100%) del valor del plan —ocho mil novecientos sesenta y dos euros (${TOTAL_EUR} €)—, por lo que a la fecha de suscripción de este Contrato no queda suma alguna pendiente a cargo de EL CONTRATANTE. En consecuencia, no se suscribe pagaré ni carta de instrucciones, y la documentación del viaje se entregará en los términos de este Contrato.`,
  ],
  modificaciones:
    "Toda modificación del plan ya reservado (fechas, etapas, alojamientos, número de noches o servicios) está sujeta a disponibilidad de los proveedores y causará el cargo de gestión previsto en el Anexo No. 1, que se liquida según la duración de la reserva: veinticinco euros (25 €) para reservas de entre 1 y 6 noches; cuarenta euros (40 €) para reservas de entre 7 y 14 noches; y sesenta euros (60 €) para reservas de 15 noches o más. Tratándose de este plan, de siete (7) noches, el cargo es de cuarenta euros (40 €) por cada solicitud, más la diferencia de tarifa que la modificación genere. EL ORGANIZADOR gestionará la solicitud pero no garantiza disponibilidad, costo ni resultado.",
  // El "si no se contrató cobertura de anulación" no es adorno: el Anexo No. 1 condiciona
  // los porcentajes a eso, y sin la frase el contrato los cobraría siempre — más duro que
  // la cotización que el cliente aceptó, que es justo lo que había que unificar.
  cancelacion:
    "Si EL CONTRATANTE cancela el viaje, aplicarán las condiciones del Anexo No. 1 sobre el valor total del plan, en atención a los gastos y compromisos irrevocables que EL ORGANIZADOR asume anticipadamente con los proveedores: (a) cancelación con sesenta (60) días calendario o más de antelación a la fecha de inicio: reembolso de lo pagado, descontando ciento cincuenta euros (150 €) por persona por gastos de gestión, IVA incluido, que no se reembolsan ni están amparados por cobertura de anulación alguna; (b) cancelación posterior: si no se contrató cobertura de anulación, o el motivo de la anulación no está amparado por ella, EL CONTRATANTE indemnizará a EL ORGANIZADOR, además de los gastos de gestión anteriores, con las siguientes cuantías sobre el importe de venta: con más de 16 días de antelación a la salida, el 5%; entre los 15 y los 11 días previos a la salida, el 30%; entre los 10 y los 6 días previos a la fecha de inicio, el 50%; y con 5 días o menos, no presentación a la fecha de salida o abandono durante el viaje, sin derecho a devolución alguna.",
  cancelacion_parags: [
    "Si la reserva comprende algún servicio con política de cancelación propia, ese servicio se regirá por la suya, en los términos del Anexo No. 1.",
  ],
};

// ---------- Texto de la cotización (Anexo No. 1) ----------

export const CONDICIONES_COTIZACION: CondicionesCotizacion = {
  // El catálogo de "Costero desde Baiona" duerme en Redondela los días 3 y 4; a este grupo
  // el operador le confirmó ARCADE. De ahí salió la pregunta de Colegiatura sobre si la
  // ruta definitiva era la de Redondela: la cotización de la plataforma decía Redondela y
  // la que se les envió a mano decía Arcade. Manda Arcade.
  etapas: [
    { day: 1, from_place: null, to_place: "Traslado Porto → Baiona", km: null, accommodation: "Baiona" },
    { day: 2, from_place: "Baiona", to_place: "Vigo", km: 25, accommodation: "Vigo" },
    { day: 3, from_place: "Vigo", to_place: "Arcade", km: 22.7, accommodation: "Arcade" },
    { day: 4, from_place: "Arcade", to_place: "Pontevedra", km: 12.9, accommodation: "Pontevedra" },
    { day: 5, from_place: "Pontevedra", to_place: "Caldas de Reis", km: 21.1, accommodation: "Caldas de Reis" },
    { day: 6, from_place: "Caldas de Reis", to_place: "Padrón", km: 18.6, accommodation: "Padrón" },
    { day: 7, from_place: "Padrón", to_place: "Santiago", km: 18.6, accommodation: "Santiago" },
    { day: 8, from_place: null, to_place: "Santiago · Fin de servicios", km: null, accommodation: null },
  ],
  // Mismas dos listas que el Anexo No. 1 de la cláusula segunda del contrato.
  incluido: [
    "7 noches en pensión con baño privado",
    "7 desayunos",
    "Traslado privado Porto → Baiona el 17 de octubre — recogida 11:00 a. m. en Eurostars Das Artes (Porto), 13 viajeros con su equipaje",
    "Traslado de mochilas entre etapas — máx. 15 kg por persona, exclusivamente en las etapas del itinerario",
    "Credencial del peregrino",
    "Gestión de la Compostela",
    "Asistencia telefónica 24h durante el Camino",
    "Seguro de viaje — coberturas médicas y de responsabilidad civil",
    "Guía del Camino en PDF y mapas",
  ],
  // Sin "Traslado hasta el punto de inicio del Camino": ese traslado es el de Porto a
  // Baiona, que está incluido.
  no_incluido: [
    "Traslado desde y hasta tu lugar de origen",
    "Almuerzos y cenas no especificados",
    "Tasas turísticas vigentes — pago directo en el alojamiento según población y categoría",
    "Cualquier servicio no especificado en servicios incluidos",
  ],
  opcionales_nota:
    "El traslado privado de Porto a Baiona (612 €) quedó contratado y pagado: está incluido dentro del total de 8.962 € de esta cotización. Los demás servicios opcionales del catálogo no se incluyen por defecto y habría que contratarlos expresamente.",
  validez:
    "La validez de este presupuesto es de 30 días desde la fecha de envío de la cotización. Esta cotización fue confirmada dentro de ese plazo y su reserva está en firme: sus condiciones son las que recoge el Acuerdo de Prestación de Servicios Turísticos No. CS-2026-080, del que esta cotización hace parte integral como Anexo No. 1.",
  confirmacion_pago:
    `Para confirmar el viaje es necesario abonar el 30% de la reserva (mínimo 150€ por persona — no reembolsables) en un plazo máximo de 7 días desde la confirmación, y el saldo antes de la fecha de inicio del viaje. En esta reserva el pago se realizó así: ${CUOTA_1.eur} € (${CUOTA_1.pct}) el ${CUOTA_1.fecha} y ${CUOTA_2.eur} € (${CUOTA_2.pct}) el ${CUOTA_2.fecha}. La reserva está pagada al 100% y no queda saldo pendiente.`,
  // Misma escala que la cláusula quinta del contrato. El texto estándar decía 100 € por
  // persona y el articulado 100 € por solicitud: ninguno de los dos era lo pactado.
  modificaciones:
    "Cualquier modificación que altere el itinerario o las fechas una vez formalizada la reserva tendrá un coste en concepto de gastos de gestión según la duración de la reserva: 25€ para reservas de entre 1 y 6 noches, 40€ para reservas de entre 7 y 14 noches y 60€ para reservas de 15 noches o más. En esta reserva, de 7 noches, el cargo es de 40€ por cada solicitud, más la diferencia de precio entre la reserva original y la nueva opción.",
  // Sección suprimida: es la que se contradecía con el párrafo de confirmación ("el saldo
  // 60 días antes" arriba, "el 70% antes de los 30 días previos" acá) y no tiene sentido
  // anunciar escalones de pago por antelación en una reserva ya pagada al 100%.
  plazos_pago: { items: [] },
  opcional_rotulo: "Contratado y pagado · incluido en el total",
};
