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

export function fechaCorta(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * Una fecha suelta ("2027-05-03") en "03 may 2027", sin pasar por `Date`.
 *
 * `fechaCorta` sí pasa por `Date`, y `new Date("2027-05-03")` es medianoche **UTC**: en
 * Bogotá (UTC-5) eso son las 7 de la tarde del día 2, así que una salida del 3 de mayo se
 * pinta "02 may". El servidor de Railway va en UTC y la acierta; el navegador de Nico, no.
 * En columnas como `start_date`, que en Postgres son `date` y no llevan hora, el día es el
 * dato entero: no hay zona que aplicarle.
 */
export function fechaCortaISO(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const [, y, mes, d] = m;
  return `${d} ${MESES_CORTOS[Number(mes) - 1] ?? mes} ${y}`;
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
