/**
 * Buscar una cotización por lo que uno se acuerda del cliente.
 *
 * Sin "server-only" a propósito: la misma regla la usan la tabla de Seguimiento (en el
 * navegador) y el endpoint del agente (en el servidor). Si buscar significara una cosa en la
 * pantalla y otra por Telegram, Nico encontraría la cotización en un lado y no en el otro, y
 * concluiría que no existe — que es justo el error que no se puede cometer con un cliente.
 *
 * Tres cosas que la búsqueda vieja de la tabla no hacía y ahora sí:
 *
 *  1. **Correo.** Es media conversación de venta: mucha gente escribe pidiendo por correo.
 *  2. **Tildes.** "Martín" y "Martin" son la misma persona.
 *  3. **Teléfono con formato.** En la base hay `+57 300 123 4567`, `573001234567` y
 *     `3001234567` para el mismo número. Se comparan solo los dígitos y basta con que uno
 *     termine en el otro: así "3001234567" encuentra al que está guardado con indicativo.
 */

/** Lo mínimo que hace falta de una cotización para poder buscarla. */
export type FilaBuscable = {
  code: string;
  client_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  route_name?: string | null;
};

/** Minúsculas y sin tildes: "Martín" y "MARTIN" tienen que caer en el mismo saco. */
export function normalizarTexto(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function soloDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D+/g, "");
}

/**
 * ¿Estos dos textos son el mismo teléfono? Se comparan los dígitos y se acepta que a uno le
 * sobre el indicativo. Se exigen 6 dígitos para no dar por bueno un "300" contra medio
 * directorio.
 */
export function mismoTelefono(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = soloDigitos(a);
  const y = soloDigitos(b);
  if (x.length < 6 || y.length < 6) return false;
  return x.endsWith(y) || y.endsWith(x);
}

/** Una consulta "parece un teléfono" si es casi toda dígitos y tiene al menos 6. */
export function pareceTelefono(consulta: string): boolean {
  const d = soloDigitos(consulta);
  return d.length >= 6 && d.length >= normalizarTexto(consulta).replace(/[\s()+.-]/g, "").length;
}

/**
 * ¿Esta cotización responde a lo que se buscó? La consulta vacía trae todo (el filtro lo
 * ponen el estado y las fechas).
 */
export function coincideCotizacion(fila: FilaBuscable, consulta: string): boolean {
  const q = normalizarTexto(consulta);
  if (!q) return true;

  if (pareceTelefono(consulta) && mismoTelefono(fila.client_phone, consulta)) return true;

  const heno = [fila.code, fila.client_name, fila.client_email, fila.client_phone, fila.route_name]
    .map(normalizarTexto)
    .join(" ");
  return heno.includes(q);
}
