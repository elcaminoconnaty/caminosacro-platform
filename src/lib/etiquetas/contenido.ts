/**
 * Lo mínimo para LEER y REESCRIBIR el flujo de contenido de una página de PDF.
 *
 * El flujo de contenido es la lista de órdenes de dibujo de una página ("pon esta matriz",
 * "pinta este objeto"). Para cambiarle el logo a una etiqueta de equipaje hay que saber
 * dos cosas que el diccionario del PDF no dice:
 *
 *   1. DÓNDE se dibuja cada imagen y DE QUÉ TAMAÑO. Un PDF guarda la imagen en píxeles y
 *      aparte la matriz que la coloca; sin recorrer el flujo no se sabe si esa imagen de
 *      1366×1320 sale como un logo de 2,4 cm o como el fondo de la hoja entera. Esa
 *      diferencia es justo la que decide qué se puede tocar.
 *   2. EN QUÉ BYTE está escrito el nombre del objeto. Cambiar `/I1 Do` por `/CSM0 Do` es
 *      todo lo que hace falta para sustituir un dibujo por otro dejando la colocación
 *      —tamaño, posición y giro— exactamente igual que la puso el proveedor.
 *
 * No es un intérprete de PDF: entiende `q`, `Q`, `cm` y `Do`, que es lo único que importa
 * acá, e ignora el resto de órdenes sin tocarlas. Los flujos que genera FPDF (el
 * generador de Correos) son de los más simples que existen.
 *
 * Todo el texto se maneja en `latin1`: un flujo de contenido es binario y `latin1` es la
 * única codificación de Node que va y vuelve byte a byte sin perder nada.
 */
import { PDFArray, PDFContext, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";

/** Matriz de PDF: [a b c d e f]. */
export type Matriz = [number, number, number, number, number, number];

export const IDENTIDAD: Matriz = [1, 0, 0, 1, 0, 0];

/** `a` aplicada ANTES que `b`, que es el orden en que el operador `cm` compone. */
export function componer(a: Matriz, b: Matriz): Matriz {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

type Token =
  | { t: "num"; v: number }
  | { t: "nombre"; v: string; ini: number; fin: number }
  | { t: "otro" }
  | { t: "op"; v: string };

const BLANCO = " \n\r\t\f\0";
const DELIM = "()<>[]{}/%";

/**
 * Parte el flujo en tokens. Los nombres (`/I1`) guardan su posición en bytes porque es lo
 * que permite reescribirlos después sin volver a serializar el flujo entero.
 */
function tokenizar(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (BLANCO.includes(c)) { i++; continue; }
    if (c === "%") { while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    // Cadena literal: los paréntesis anidan y `\` escapa al siguiente carácter.
    if (c === "(") {
      let nivel = 1; i++;
      while (i < s.length && nivel > 0) {
        if (s[i] === "\\") i++;
        else if (s[i] === "(") nivel++;
        else if (s[i] === ")") nivel--;
        i++;
      }
      out.push({ t: "otro" }); continue;
    }
    if (c === "<" && s[i + 1] === "<") { out.push({ t: "op", v: "<<" }); i += 2; continue; }
    if (c === ">" && s[i + 1] === ">") { out.push({ t: "op", v: ">>" }); i += 2; continue; }
    if (c === "<") { const f = s.indexOf(">", i); if (f < 0) break; out.push({ t: "otro" }); i = f + 1; continue; }
    if (c === "/") {
      let j = i + 1;
      while (j < s.length && !BLANCO.includes(s[j]) && !DELIM.includes(s[j])) j++;
      out.push({ t: "nombre", v: s.slice(i + 1, j), ini: i, fin: j });
      i = j; continue;
    }
    if ("[]{}".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    let j = i;
    while (j < s.length && !BLANCO.includes(s[j]) && !DELIM.includes(s[j])) j++;
    const w = s.slice(i, j);
    out.push(/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w) ? { t: "num", v: parseFloat(w) } : { t: "op", v: w });
    i = j;
  }
  return out;
}

/** Una orden `Do`: qué objeto se dibuja, con qué tamaño en puntos y dónde está su nombre. */
export type Invocacion = {
  nombre: string;
  /** Ancho y alto REALES sobre la hoja, en puntos (1 pt = 1/72"). Ya con el giro aplicado. */
  ancho: number;
  alto: number;
  x: number;
  y: number;
  /** La matriz completa, por si hace falta encadenar dentro de un XObject de formulario. */
  matriz: Matriz;
  /** Posición en bytes del token `/nombre`, para poder reescribirlo. */
  ini: number;
  fin: number;
};

/**
 * Recorre el flujo y devuelve todas las órdenes `Do` con su tamaño ya resuelto.
 *
 * `base` es la matriz que ya venía puesta cuando se entra al flujo: para una página es la
 * identidad, y para un XObject de formulario es la matriz del `Do` que lo invocó compuesta
 * con el `/Matrix` del propio formulario.
 *
 * Si aparece una imagen en línea (`BI … ID … EI`) se abandona: mezclan datos binarios con
 * órdenes y el tokenizador se perdería. Correos no las usa; si algún día un proveedor las
 * usa, es mejor no tocar nada que romper la etiqueta.
 */
export function invocaciones(flujo: string, base: Matriz = IDENTIDAD): Invocacion[] | null {
  const tokens = tokenizar(flujo);
  const out: Invocacion[] = [];
  const pila: Matriz[] = [];
  let ctm: Matriz = base;
  let args: Token[] = [];

  for (const t of tokens) {
    if (t.t !== "op") { args.push(t); continue; }
    if (t.v === "BI") return null;
    if (t.v === "q") pila.push(ctm);
    else if (t.v === "Q") ctm = pila.pop() ?? base;
    else if (t.v === "cm" && args.length >= 6 && args.slice(-6).every((a) => a.t === "num")) {
      const n = args.slice(-6).map((a) => (a as { v: number }).v) as Matriz;
      ctm = componer(n, ctm);
    } else if (t.v === "Do") {
      const ultimo = args[args.length - 1];
      if (ultimo?.t === "nombre") {
        out.push({
          nombre: ultimo.v,
          // El cuadrado unidad del objeto se estira por la matriz: el largo de cada
          // columna es el tamaño real, y así el giro no cuenta como deformación.
          ancho: Math.hypot(ctm[0], ctm[1]),
          alto: Math.hypot(ctm[2], ctm[3]),
          x: ctm[4],
          y: ctm[5],
          matriz: ctm,
          ini: ultimo.ini,
          fin: ultimo.fin,
        });
      }
    }
    args = [];
  }
  return out;
}

/**
 * Sustituye los nombres de una lista de invocaciones. Se aplica de atrás hacia adelante
 * para que los cambios de longitud no invaliden las posiciones que faltan.
 */
export function renombrarInvocaciones(flujo: string, cambios: { ini: number; fin: number; nuevo: string }[]): string {
  let s = flujo;
  for (const c of [...cambios].sort((a, b) => b.ini - a.ini)) {
    s = s.slice(0, c.ini) + `/${c.nuevo}` + s.slice(c.fin);
  }
  return s;
}

/**
 * Lee un `/Contents` (que puede ser un flujo suelto o un array de flujos que se concatenan)
 * y lo devuelve ya descomprimido, en `latin1`.
 */
export function leerFlujo(ctx: PDFContext, obj: unknown): string {
  const resuelto = obj instanceof PDFRef ? ctx.lookup(obj) : obj;
  if (resuelto instanceof PDFArray) {
    // El separador importa: sin él, el último token de un trozo se pegaría al primero del
    // siguiente y `…Q` + `q…` se leería como un solo operador inexistente.
    return resuelto.asArray().map((o) => leerFlujo(ctx, o)).join("\n");
  }
  if (resuelto instanceof PDFRawStream) {
    return Buffer.from(decodePDFRawStream(resuelto).decode()).toString("latin1");
  }
  return "";
}
