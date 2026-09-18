export function eur(n: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function cop(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function trm(n: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(n);
}

/**
 * "03 de may de 2027".
 *
 * Una fecha suelta ("2027-05-03") se ancla a medianoche LOCAL, no UTC. `new Date("2027-05-03")`
 * es medianoche UTC, y en Bogotá (UTC-5) eso son las 7 de la tarde del día 2: la salida del
 * 3 de mayo se pintaba «02 de may». Afectaba a todas las columnas `date` de la base —las
 * salidas y los fines de las cotizaciones, las fechas de los pagos, la del TRM— y en los dos
 * sentidos: el servidor de Railway va en UTC y las acertaba, el navegador de Bogotá no, así
 * que además discrepaban entre el render del servidor y el del cliente.
 *
 * Los instantes completos (`timestamptz`, con hora y zona) siguen igual: ahí la zona sí
 * significa algo y convertirla a hora local es lo correcto.
 */
export function fechaCorta(d: Date | string) {
  const date =
    typeof d === "string"
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d.trim()) ? `${d.trim()}T00:00:00` : d)
      : d;
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function hace(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d2 = Math.floor(h / 24);
  if (d2 < 30) return `hace ${d2} d`;
  return fechaCorta(date);
}
