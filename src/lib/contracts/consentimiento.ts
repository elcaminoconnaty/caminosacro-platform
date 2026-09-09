/**
 * El texto que el firmante acepta al marcar la casilla. Se archiva en
 * `contracts.consent_text` junto con la firma: si mañana cambia esta constante, los
 * contratos ya firmados siguen diciendo qué aceptó cada uno.
 *
 * Vive aparte del formulario porque lo necesitan las dos orillas: el navegador para
 * mostrarlo y el servidor para guardarlo. Antes estaba escrito en el JSX de SignForm y
 * cambiaba con cada despliegue sin dejar rastro.
 *
 * La autorización de tratamiento de datos NO está solo acá: es una cláusula del contrato,
 * dentro del PDF que se hashea y se firma (ver template.ts). Un checkbox vive en el código;
 * una cláusula, en el documento.
 */
export type OpcionesConsentimiento = {
  /** Contrato de empresa: firma el representante legal. */
  empresa: boolean;
  /** El paquete incluye el pagaré en blanco con su carta de instrucciones. */
  financiado: boolean;
  razonSocial?: string | null;
};

export function textoConsentimiento(o: OpcionesConsentimiento): string {
  if (o.empresa) {
    return (
      `Declaro que obro como representante legal de ${o.razonSocial || "la empresa"}, con facultades ` +
      `suficientes para obligarla; que leí y comprendí íntegramente el contrato` +
      (o.financiado ? ", incluido el pagaré en blanco con su carta de instrucciones (Anexo No. 3)," : "") +
      ` y sus anexos, incluida la relación de viajeros del Anexo No. 2; que los datos suministrados son ` +
      `veraces; que la empresa cuenta con la autorización previa, expresa e informada de cada viajero ` +
      `para entregar sus datos personales y la imagen de su documento de viaje y transmitirlos al ` +
      `operador del viaje en España, conforme a la Ley 1581 de 2012; y que firmo electrónicamente con ` +
      `plena validez legal (Ley 527 de 1999 y Decreto 2364 de 2012). Acepto que este método de firma ` +
      `electrónica constituye mi firma y obliga a la empresa en los mismos términos que una firma ` +
      `manuscrita, y entiendo que quedan registrados mi nombre, mi documento, la fecha y hora, mi ` +
      `dirección IP, el dispositivo desde el que firmo, mi ubicación aproximada si la autorizo y la ` +
      `huella digital del documento.`
    );
  }
  return (
    `Declaro que leí y comprendí íntegramente el contrato` +
    (o.financiado ? ", incluido el pagaré en blanco con su carta de instrucciones (Anexo No. 2)," : "") +
    ` y sus anexos; que los datos que suministro son veraces; que autorizo el tratamiento de mis datos ` +
    `personales — incluida la imagen de mi pasaporte y su transmisión al operador del viaje en España — ` +
    `conforme a la Ley 1581 de 2012; y que firmo electrónicamente con plena validez legal (Ley 527 de ` +
    `1999 y Decreto 2364 de 2012). Acepto que este método de firma electrónica constituye mi firma y me ` +
    `obliga en los mismos términos que una firma manuscrita, y entiendo que quedan registrados mi ` +
    `nombre, mi documento, la fecha y hora, mi dirección IP, el dispositivo desde el que firmo, mi ` +
    `ubicación aproximada si la autorizo y la huella digital del documento.`
  );
}
