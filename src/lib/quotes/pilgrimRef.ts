/**
 * La referencia de reserva de Pilgrim (`quotes.pilgrim_ref`) dentro del correo a Pilgrim.
 *
 * Va en el asunto —" · Ref. Pilgrim 47397"— para que en su bandeja lo encuentren por SU
 * número, que es el que usan ellos, y como línea de los datos del viaje, debajo de la
 * referencia nuestra.
 *
 * Es una función pura y sin servidor porque la usan las dos orillas: el servidor al armar
 * el correo y la tarjeta al guardar la referencia, que la aplica sobre el asunto y el
 * cuerpo YA editados en pantalla sin pisar lo que se haya escrito a mano.
 */

const ETIQUETA_LINEA = "Referencia Pilgrim:";
const RE_ASUNTO = /\s·\sRef\. Pilgrim\s.*$/;
const RE_LINEA = /^Referencia Pilgrim:.*(?:\n|$)/m;

export function aplicarReferenciaPilgrim(
  subject: string,
  body: string,
  ref: string | null | undefined,
): { subject: string; body: string } {
  const r = (ref ?? "").trim();

  const asuntoBase = subject.replace(RE_ASUNTO, "");
  const asunto = r ? `${asuntoBase} · Ref. Pilgrim ${r}` : asuntoBase;

  let cuerpo = body.replace(RE_LINEA, "");
  if (r) {
    // Misma columna que las demás líneas de DATOS DEL VIAJE (texto plano alineado).
    const linea = `${ETIQUETA_LINEA.padEnd(26)}${r}`;
    const ancla = /^Referencia Camino Sacro:.*$/m;
    cuerpo = ancla.test(cuerpo) ? cuerpo.replace(ancla, (m) => `${m}\n${linea}`) : `${linea}\n${cuerpo}`;
  }
  return { subject: asunto, body: cuerpo };
}

/**
 * El asunto con el que sale un correo en el hilo con Pilgrim: "RE: " + el asunto del hilo,
 * sin acumular prefijos ("RE: RE: RV: …"). Es el mismo que pone Outlook al responder, y el
 * que tiene que ver quien revisa el correo en pantalla y en la prueba.
 */
export function asuntoDelHilo(asuntoHilo: string | null | undefined): string {
  const limpio = (asuntoHilo ?? "").replace(/^((re|rv|fw|fwd)\s*:\s*)+/i, "").trim();
  return `RE: ${limpio || "(sin asunto)"}`;
}
