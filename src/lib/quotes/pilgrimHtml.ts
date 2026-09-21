/**
 * El correo de reserva a Pilgrim, maquetado.
 *
 * La regla que manda acá: **el HTML se deriva del texto final**, el mismo que Nico revisa
 * y puede editar en la tarjeta del CRM antes de enviar. Si el HTML se armara aparte, desde
 * los datos de la cotización, bastaría con que Nico corrigiera una cifra a mano para que a
 * Pilgrim le llegara una cosa distinta de la que él aprobó en pantalla. En un correo que
 * pide un link de pago, eso no se puede permitir.
 *
 * Por eso esto es un intérprete del correo de siempre (`armarCorreoPilgrim`), no una
 * segunda redacción: reconoce sus secciones y las pinta como tablas. Lo que no reconoce
 * —porque Nico lo escribió a mano— sale como párrafo, con el texto intacto. Nunca inventa
 * ni reordena: solo cambia la manera de verse.
 *
 * Es un correo B2B a un operador: la papelería es la de la casa, pero sobria. Sin
 * "¡Buen Camino!" ni invitaciones: aquí se viene a reservar y a pagar.
 *
 * Sin `server-only`: armado de texto puro, previsualizable con un script.
 */
import { COLORES, P, P_MINI, envolturaCorreo, esc } from "@/lib/email/shell";

const { verde: VERDE, verdeM: VERDE_M, crema: CREMA, borde: BORDE, texto: TXT, suave: SEC } = COLORES;

/** `Etiqueta:            valor` → ["Etiqueta", "valor"]. */
const RE_CAMPO = /^([A-Za-zÁÉÍÓÚÑáéíóúñ0-9 .º/()-]{3,30}):\s{1,}(.+?)\s*$/;
/** `Concepto ....... 1.234,00 €` — la línea de tarifa, con su relleno de puntos. */
const RE_TARIFA = /^(.+?)\s*\.{2,}\s*(.+?)\s*$/;
/** `1. Nombre — Pasaporte AX123 (pasaporte adjunto)` */
const RE_VIAJERO = /^(\d{1,2})\.\s+(.*)$/;
/** Una línea de solo guiones: en texto separa el total; acá sobra, la tabla ya lo hace. */
const RE_REGLA = /^[\s-]{10,}$/;

/**
 * ¿Es un rótulo de sección? En el correo van en mayúsculas y solos en su línea.
 *
 * Lo entre paréntesis no cuenta: "SERVICIOS Y TARIFAS (precios Pilgrim)" es un rótulo, y
 * la aclaración va en minúsculas a propósito.
 */
function esRotulo(linea: string): boolean {
  const l = linea.trim();
  if (l.length < 3 || l.length > 60) return false;
  if (!/[A-ZÁÉÍÓÚÑ]/.test(l)) return false;
  if (l.includes(":") || RE_REGLA.test(l)) return false;
  const sinParentesis = l.replace(/\([^)]*\)/g, "").trim();
  return sinParentesis.length >= 3 && sinParentesis === sinParentesis.toLocaleUpperCase("es-CO");
}

type Bloque =
  | { tipo: "rotulo"; texto: string }
  | { tipo: "parrafo"; lineas: string[] }
  | { tipo: "campos"; filas: [string, string][] }
  | { tipo: "viajeros"; filas: [string, string][] }
  | { tipo: "tarifas"; filas: [string, string][] };

/**
 * Agrupa el correo en bloques. Recorre línea a línea y junta las que son del mismo tipo:
 * así "Ruta:", "Fecha de inicio:", "Personas:" acaban en una sola tabla en vez de en seis.
 */
function leerBloques(cuerpo: string): Bloque[] {
  const bloques: Bloque[] = [];
  const ultimo = () => bloques[bloques.length - 1];

  for (const cruda of cuerpo.split("\n")) {
    const linea = cruda.replace(/\s+$/, "");
    if (!linea.trim() || RE_REGLA.test(linea)) {
      // Una línea en blanco cierra el bloque abierto; no genera nada por sí misma.
      if (ultimo()?.tipo === "parrafo") bloques.push({ tipo: "rotulo", texto: "" });
      if (bloques.length && ultimo().tipo !== "rotulo") bloques.push({ tipo: "rotulo", texto: "" });
      continue;
    }
    if (esRotulo(linea)) {
      bloques.push({ tipo: "rotulo", texto: linea.trim() });
      continue;
    }
    const viajero = RE_VIAJERO.exec(linea);
    if (viajero) {
      if (ultimo()?.tipo !== "viajeros") bloques.push({ tipo: "viajeros", filas: [] });
      (ultimo() as { filas: [string, string][] }).filas.push([viajero[1], viajero[2].trim()]);
      continue;
    }
    const tarifa = RE_TARIFA.exec(linea);
    if (tarifa) {
      if (ultimo()?.tipo !== "tarifas") bloques.push({ tipo: "tarifas", filas: [] });
      (ultimo() as { filas: [string, string][] }).filas.push([tarifa[1].trim(), tarifa[2].trim()]);
      continue;
    }
    // Un "Etiqueta: valor" solo es ficha si venimos de un rótulo o ya estamos en una:
    // si no, una frase corriente como "Pendientes de pasaporte: Fulano." se disfrazaría
    // de dato y saldría con formato de tabla en mitad de un párrafo.
    const enFicha = ultimo()?.tipo === "campos" || (ultimo()?.tipo === "rotulo" && !!(ultimo() as { texto: string }).texto);
    const campo = enFicha ? RE_CAMPO.exec(linea) : null;
    if (campo) {
      if (ultimo()?.tipo !== "campos") bloques.push({ tipo: "campos", filas: [] });
      (ultimo() as { filas: [string, string][] }).filas.push([campo[1].trim(), campo[2].trim()]);
      continue;
    }
    if (ultimo()?.tipo !== "parrafo") bloques.push({ tipo: "parrafo", lineas: [] });
    (ultimo() as { lineas: string[] }).lineas.push(linea.trim());
  }
  // Los rótulos vacíos eran solo separadores.
  return bloques.filter((b) => b.tipo !== "rotulo" || b.texto);
}

function rotuloHtml(texto: string): string {
  return `<tr><td class="cs-pad" style="padding:20px 32px 2px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${SEC};letter-spacing:1.5px;border-bottom:1px solid ${BORDE};padding-bottom:6px;">${esc(texto)}</div>
  </td></tr>`;
}

function camposHtml(filas: [string, string][]): string {
  const cuerpo = filas
    .map(
      ([k, v]) => `<tr>
      <td style="padding:5px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${SEC};letter-spacing:0.5px;vertical-align:top;white-space:nowrap;" width="150">${esc(k)}</td>
      <td style="padding:5px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${TXT};">${esc(v)}</td>
    </tr>`,
    )
    .join("");
  return `<tr><td class="cs-pad" style="padding:8px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cuerpo}</table>
  </td></tr>`;
}

function viajerosHtml(filas: [string, string][]): string {
  const cuerpo = filas
    .map(([n, resto]) => {
      // "(pasaporte adjunto)" se separa del nombre: es el dato que Pilgrim busca al revisar.
      const adjunto = /\(pasaporte adjunto\)/i.test(resto);
      const limpio = resto.replace(/\s*\(pasaporte adjunto\)\s*/i, "").trim();
      return `<tr>
        <td style="padding:6px 0;border-bottom:1px solid ${BORDE};font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${SEC};vertical-align:top;" width="24">${esc(n)}.</td>
        <td style="padding:6px 0;border-bottom:1px solid ${BORDE};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${TXT};">${esc(limpio)}</td>
        <td style="padding:6px 0;border-bottom:1px solid ${BORDE};font-family:Arial,Helvetica,sans-serif;font-size:11px;text-align:right;white-space:nowrap;color:${adjunto ? VERDE_M : SEC};" width="120">${adjunto ? "pasaporte adjunto" : "sin pasaporte"}</td>
      </tr>`;
    })
    .join("");
  return `<tr><td class="cs-pad" style="padding:8px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cuerpo}</table>
  </td></tr>`;
}

function tarifasHtml(filas: [string, string][]): string {
  const cuerpo = filas
    .map(([concepto, importe]) => {
      const esTotal = /^total/i.test(concepto);
      const peso = esTotal ? "bold" : "normal";
      const fondo = esTotal ? `background:${CREMA};` : "";
      const color = esTotal ? VERDE : TXT;
      return `<tr>
        <td style="${fondo}padding:7px 8px 7px 0;border-top:1px solid ${BORDE};font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:${peso};color:${color};">${esc(concepto)}</td>
        <td style="${fondo}padding:7px 0;border-top:1px solid ${BORDE};font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:${peso};color:${color};text-align:right;white-space:nowrap;" width="110">${esc(importe)}</td>
      </tr>`;
    })
    .join("");
  return `<tr><td class="cs-pad" style="padding:8px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cuerpo}</table>
  </td></tr>`;
}

function parrafoHtml(lineas: string[]): string {
  return `<tr><td class="cs-pad" style="padding:12px 32px 0;">
    <p style="${P}">${lineas.map(esc).join("<br>")}</p>
  </td></tr>`;
}

export type CorreoPilgrimHtml = {
  /** El cuerpo final, tal como quedó tras la revisión de Nico. */
  cuerpo: string;
  /** Referencia de la cotización, para el rótulo y el pie. */
  code: string;
  ruta?: string | null;
  /** Cuántos pasaportes van adjuntos, para nombrarlos en el correo. */
  adjuntos: number;
  /** Envío de prueba: la línea que lo avisa (ya viene dentro del cuerpo, se detecta sola). */
  esPrueba?: boolean;
};

export function correoPilgrimHtml(d: CorreoPilgrimHtml): string {
  const bloques = leerBloques(d.cuerpo);
  const contenido = bloques
    .map((b) => {
      switch (b.tipo) {
        case "rotulo": return rotuloHtml(b.texto);
        case "campos": return camposHtml(b.filas);
        case "viajeros": return viajerosHtml(b.filas);
        case "tarifas": return tarifasHtml(b.filas);
        case "parrafo": return parrafoHtml(b.lineas);
      }
    })
    .join("");

  const pie = `<tr><td class="cs-pad" style="padding:22px 32px 26px;">
    <p style="${P_MINI}">Adjuntos: ${d.adjuntos} ${d.adjuntos === 1 ? "pasaporte" : "pasaportes"}.
      Respondiendo a este correo escribes directamente a Camino Sacro.</p>
  </td></tr>`;

  return envolturaCorreo({
    titulo: `Reserva ${d.code} · Camino Sacro`,
    preheader: `Reserva ${d.code}${d.ruta ? ` · ${d.ruta}` : ""} — quedamos atentos al link de pago.`,
    eyebrow: `${d.esPrueba ? "PRUEBA · " : ""}RESERVA ${d.code}`,
    contenido: contenido + pie,
    pie: `Camino Sacro · Reserva ${d.code}${d.ruta ? ` · ${d.ruta}` : ""}`,
  });
}
