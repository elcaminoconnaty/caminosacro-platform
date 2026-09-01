/**
 * Emparejar la localidad de una etapa con la ciudad de un hotel del catálogo.
 *
 * Hace falta porque las dos fuentes escriben el mismo sitio distinto y las dos tienen
 * razón: el catálogo de rutas dice "Pedrouzo" y "Santiago"; el hotel, tal como lo pone
 * el alojamiento, dice "O Pedrouzo (O Pino)" y "Santiago de Compostela". Con igualdad
 * exacta, dos de las seis noches del Sarria → Santiago se quedaban sin hotel.
 *
 * Sin `server-only`: es texto puro, y así se puede probar sin levantar Next.
 */

/** Minúsculas, sin tildes, sin paréntesis, sin artículo gallego/castellano inicial. */
export function normalizarLugar(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(o|a|el|la|los|las)\s+/, "");
}

/**
 * Busca el hotel de una localidad. Primero exacto; si no, el que empiece igual en
 * cualquiera de los dos sentidos ("santiago" ↔ "santiago de compostela"), y de esos, el
 * de nombre más largo, que es el más específico.
 *
 * Nunca hace "contiene" a secas: "Arzúa" no debe emparejar con nada solo porque
 * comparta letras. Es una PROPUESTA que se revisa en la tarjeta, pero una propuesta mala
 * es peor que ninguna, porque se acepta sin mirar.
 */
export function hotelParaLugar<T extends { city: string | null }>(
  lugar: string | null | undefined,
  hoteles: T[],
): T | null {
  const buscado = normalizarLugar(lugar);
  if (!buscado) return null;

  const exacto = hoteles.find((h) => normalizarLugar(h.city) === buscado);
  if (exacto) return exacto;

  const parciales = hoteles.filter((h) => {
    const c = normalizarLugar(h.city);
    if (!c) return false;
    return c.startsWith(`${buscado} `) || buscado.startsWith(`${c} `);
  });
  if (parciales.length === 0) return null;

  return parciales.sort(
    (a, b) => normalizarLugar(b.city).length - normalizarLugar(a.city).length,
  )[0];
}
