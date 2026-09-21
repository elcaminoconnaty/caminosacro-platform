/**
 * Nombres de personas, presentables.
 *
 * `settings.firmantes` guarda los nombres en mayúsculas sostenidas porque así van en el
 * contrato ("NICOLÁS VILLA POSADA"), pero ese mismo nombre firma correos y mensajes de
 * WhatsApp, donde gritar queda raro. Y los nombres de los clientes llegan como los teclee
 * quien los teclee: "juan", "JUAN CARLOS PÉREZ", "Juan Carlos".
 */

/** Una palabra suelta: inicial en mayúscula, y el resto en minúscula solo si venía a gritos. */
function palabra(p: string): string {
  if (!p) return "";
  const resto = p === p.toUpperCase() ? p.slice(1).toLowerCase() : p.slice(1);
  return p.charAt(0).toUpperCase() + resto;
}

/**
 * El nombre de pila. "JUAN CARLOS PÉREZ" → "Juan"; "juan" → "Juan".
 *
 * Un "Hola JUAN CARLOS PÉREZ" en WhatsApp se lee como lo que sería: un envío masivo.
 */
export function nombrePila(nombre: string | null | undefined): string {
  return palabra(String(nombre ?? "").trim().split(/\s+/)[0] ?? "");
}

/**
 * El nombre completo, presentable: "NICOLÁS VILLA POSADA" → "Nicolás Villa Posada".
 *
 * Las partículas de los apellidos se dejan en minúscula ("de", "del", "la", "van"), que
 * es como se escriben en español, salvo que abran el nombre.
 */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "van", "von"]);

export function nombrePropio(nombre: string | null | undefined): string {
  const partes = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  return partes
    .map((p, i) => (i > 0 && PARTICULAS.has(p.toLowerCase()) ? p.toLowerCase() : palabra(p)))
    .join(" ");
}
