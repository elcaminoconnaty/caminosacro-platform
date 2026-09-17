/**
 * Fechas del calendario editorial, todas en hora de Bogotá.
 *
 * La pieza guarda `programada_para` como instante (timestamptz, UTC). Lo que Nico elige
 * es un día y una hora de Colombia. Este archivo es el único sitio donde se traduce una
 * cosa en la otra, y es puro (sin base ni librerías) para que lo puedan usar el
 * navegador, las acciones y el cron por igual.
 *
 * Por qué no `new Date("2026-09-20T19:30")`: eso se interpreta en la zona del PROCESO,
 * que en Railway es UTC y en el portátil es Bogotá. La misma cadena daría dos instantes
 * distintos según dónde corra. Colombia es UTC-5 fijo, sin horario de verano, así que la
 * conversión es una suma; queda escrita con nombre para que nadie la repita a mano.
 */

export const ZONA = "America/Bogota";
/** Colombia no cambia de hora: UTC-5 todo el año. */
const DESFASE_MIN = -5 * 60;

const fmtFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
});
const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false,
});

/** `YYYY-MM-DD` del instante en Bogotá. Sin argumento: hoy. */
export function fechaLocal(instante: Date | string = new Date()): string {
  return fmtFecha.format(typeof instante === "string" ? new Date(instante) : instante);
}

/** `HH:MM` del instante en Bogotá. */
export function horaLocal(instante: Date | string): string {
  return fmtHora.format(typeof instante === "string" ? new Date(instante) : instante);
}

/** Día y hora de Bogotá → instante ISO (UTC). Valida la forma; devuelve null si no cuadra. */
export function aInstante(fecha: string, hora: string): string | null {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!f || !h) return null;
  const [anio, mes, dia] = [Number(f[1]), Number(f[2]), Number(f[3])];
  const [hh, mm] = [Number(h[1]), Number(h[2])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hh > 23 || mm > 59) return null;
  const utc = Date.UTC(anio, mes - 1, dia, hh, mm) - DESFASE_MIN * 60_000;
  const d = new Date(utc);
  // Un 31 de febrero se "desborda" a marzo: se rechaza en vez de aceptarlo corrido.
  if (fechaLocal(d) !== fecha) return null;
  return d.toISOString();
}

/** Texto corto para chips y badges: "mar 22 sep · 7:30 p. m." */
export function textoCorto(instante: Date | string): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  const dia = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, weekday: "short", day: "numeric", month: "short" }).format(d);
  const hora = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return `${dia} · ${hora}`;
}

// ---------- Cadencia ----------

export const CADENCIAS = ["diario", "cada2", "lmv", "lj", "semanal"] as const;
export type CadenciaId = (typeof CADENCIAS)[number];

export const CADENCIA: Record<CadenciaId, { etiqueta: string; ayuda: string }> = {
  diario:  { etiqueta: "Todos los días",     ayuda: "Un post cada día." },
  cada2:   { etiqueta: "Día por medio",      ayuda: "Un día sí, un día no." },
  lmv:     { etiqueta: "Lun · Mié · Vie",    ayuda: "Tres a la semana." },
  lj:      { etiqueta: "Lun · Jue",          ayuda: "Dos a la semana." },
  semanal: { etiqueta: "Una vez por semana", ayuda: "Siempre el mismo día de la semana que el último." },
};

export function esCadencia(v: string): v is CadenciaId {
  return (CADENCIAS as readonly string[]).includes(v);
}

/** 0 = domingo … 6 = sábado, del día `YYYY-MM-DD` (calendario, sin zona). */
function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Suma días a un `YYYY-MM-DD` de calendario. */
export function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * El siguiente día libre según la cadencia.
 *
 * `ocupados` son los días (Bogotá) que ya tienen algo programado o publicado. Se parte
 * del último ocupado que sea hoy o futuro (la "cola"); si no hay, de hoy. Se avanza según
 * la cadencia y se salta cualquier día que ya esté ocupado, para que dos aprobaciones
 * seguidas caigan en días distintos. Nunca propone un día pasado.
 */
export function siguienteDiaLibre(ocupados: Iterable<string>, cadencia: CadenciaId, hoy = fechaLocal()): string {
  const set = new Set(ocupados);
  const futuros = [...set].filter((d) => d >= hoy).sort();
  const ultimo = futuros.length ? futuros[futuros.length - 1] : null;

  const cabe = (d: string): boolean => {
    const ds = diaSemana(d);
    switch (cadencia) {
      case "diario": return true;
      case "cada2": return ultimo ? diasEntre(ultimo, d) % 2 === 0 : true;
      case "lmv": return ds === 1 || ds === 3 || ds === 5;
      case "lj": return ds === 1 || ds === 4;
      case "semanal": return ultimo ? diasEntre(ultimo, d) % 7 === 0 : true;
    }
  };

  // Sin cola: hoy mismo vale si la cadencia lo admite (la hora la pone quien programa).
  let candidato = ultimo ? sumarDias(ultimo, 1) : hoy;
  for (let i = 0; i < 400; i++) {
    if (!set.has(candidato) && cabe(candidato)) return candidato;
    candidato = sumarDias(candidato, 1);
  }
  return sumarDias(hoy, 1);
}

function diasEntre(a: string, b: string): number {
  const [a1, m1, d1] = a.split("-").map(Number);
  const [a2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}
