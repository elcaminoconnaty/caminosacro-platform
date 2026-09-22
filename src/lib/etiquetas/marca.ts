/**
 * Lo que ocupa el hueco que deja el logo de un proveedor dentro de una etiqueta de
 * equipaje. Hay dos rellenos posibles y los elige Nico (ver `ModoLogo`):
 *
 *   - `"marca"`   — la marca de Camino Sacro en el mismo sitio y del mismo tamaño.
 *   - `"sin-logo"` — nada: el logo se va y el hueco queda limpio, sin marca de nadie.
 *
 * Los dos son un XObject de formulario con el mismo sello, así que todo lo que viene
 * después —la colocación, el borrado de la imagen, la idempotencia— es idéntico. Lo único
 * que cambia es qué hay dibujado dentro.
 *
 * ── Qué se dibuja en el modo `"marca"` ──────────────────────────────────────────────
 * El símbolo de la marca (las dos montañas, el camino y el sol) y debajo el nombre,
 * "CAMINO SACRO", en la misma serif con la que se firman todos nuestros PDF. Es el mismo
 * orden del logo que se quita —símbolo arriba, nombre abajo— para que la etiqueta se lea
 * igual que siempre y el cambio no se note como un parche.
 *
 * `marca-camino-sacro.png` es el símbolo del sitio (la "identidad del sitio" de
 * caminosacro.com) recortado a su tinta y con el fondo crema convertido en transparencia,
 * porque el hueco cae unas veces sobre el amarillo de Correos y otras sobre blanco.
 * Para cambiar el logo mañana basta con reemplazar ESE archivo por otro PNG con
 * transparencia: la composición se recalcula sola a partir de sus proporciones.
 *
 * ── Por qué un XObject de formulario y no una imagen ────────────────────────────────
 * El PDF ya trae escrito "dibuja el objeto X en este cuadro, con este giro". Si lo que se
 * pone en el lugar de X es UN SOLO objeto, la colocación del proveedor se respeta al
 * milímetro sin tocar una sola coordenada suya — y la etiqueta de Correos lleva el logo
 * dos veces, una derecha en la cabecera y otra girada 180° en el reverso, que es el que
 * queda a la vista cuando la etiqueta se dobla. Un formulario es ese "un solo objeto" y
 * además puede llevar dentro una imagen Y texto.
 *
 * El formulario se dibuja en un lienzo cómodo de 100×100 y su `/Matrix` lo encoge al
 * cuadrado unidad, que es lo que el `Do` estira hasta el tamaño final. Cuando el hueco no
 * es cuadrado, esa misma matriz lo centra en vez de deformarlo.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PDFBool, PDFDocument, PDFName, PDFRef, StandardFonts } from "pdf-lib";

/**
 * Sello privado de los formularios que ponemos nosotros, sea la marca o el hueco vacío.
 *
 * Existe por la idempotencia: nuestro símbolo también es "una imagen chica que se repite a
 * dos tamaños", o sea que el detector de logos se reconocería a sí mismo y volvería a
 * envolver la marca en otra marca cada vez que una etiqueta ya procesada se vuelva a subir.
 * Con esto, el recorrido se salta lo que ya es nuestro. La clave no es estándar y a un
 * visor le da igual: las claves desconocidas en un diccionario de PDF se ignoran.
 *
 * Lo lleva también el hueco vacío, y por el mismo motivo al revés: una etiqueta que ya se
 * dejó sin logo no vuelve a tocarse, y al cambiar de opinión se reprocesa el original
 * guardado, no la que ya salió marcada.
 */
export const SELLO_MARCA = PDFName.of("CSMarcaCaminoSacro");

/** Qué se pone en el lugar del logo del proveedor. Lo decide Nico; ver `memoria.ts`. */
export type ModoLogo = "marca" | "sin-logo";

/** El verde de Camino Sacro (`C.verde` de pdfChrome), en componentes 0-1 para el PDF. */
const VERDE = "0.102 0.227 0.165";

const NOMBRE = "CAMINO SACRO";

/** El lienzo del formulario. Números redondos para que la composición se lea sola. */
const LIENZO = 100;

const RUTA_SIMBOLO = path.join(process.cwd(), "src/lib/etiquetas/marca-camino-sacro.png");

/** Una fábrica de rellenos: dado el hueco que deja el logo, el objeto que va en su lugar. */
export type Relleno = (ancho: number, alto: number) => PDFRef;

/**
 * Prepara el relleno una vez por documento y devuelve la fábrica: un formulario por cada
 * forma de hueco distinta.
 *
 * En el modo `"marca"` el símbolo y la fuente se incrustan UNA sola vez aunque el logo
 * aparezca en veinte sitios (una etiqueta por viajero en un grupo de trece); en
 * `"sin-logo"` no se incrusta nada, que es justo la gracia.
 */
export async function prepararRelleno(doc: PDFDocument, modo: ModoLogo = "marca"): Promise<Relleno> {
  return modo === "sin-logo" ? huecoVacio(doc) : await prepararMarca(doc);
}

/**
 * El relleno que no dibuja nada.
 *
 * Es un formulario vacío y no un borrado de la orden `Do` a propósito: el flujo de
 * contenido de Correos se queda con exactamente los mismos bytes y las mismas órdenes que
 * traía, solo que el objeto al que apuntan está en blanco. Recortar operadores del flujo
 * sería la otra forma de hacerlo, y la que puede dejar un `q` sin su `Q` y tumbar la hoja
 * entera. Uno solo para todo el documento: un hueco vacío no tiene forma que ajustar.
 */
function huecoVacio(doc: PDFDocument): Relleno {
  const ref = doc.context.register(
    doc.context.flateStream("", {
      Type: "XObject",
      Subtype: "Form",
      FormType: 1,
      BBox: [0, 0, LIENZO, LIENZO],
      Matrix: [1 / LIENZO, 0, 0, 1 / LIENZO, 0, 0],
      [SELLO_MARCA.asString().slice(1)]: PDFBool.True,
      Resources: { ProcSet: [PDFName.of("PDF")] },
    }),
  );
  return () => ref;
}

async function prepararMarca(doc: PDFDocument): Promise<Relleno> {
  const simbolo = await doc.embedPng(await fs.readFile(RUTA_SIMBOLO));
  const fuente = await doc.embedStandardFont(StandardFonts.TimesRomanBold);
  const cache = new Map<string, PDFRef>();

  // Composición dentro del lienzo, de arriba a abajo: símbolo, aire, nombre.
  const anchoSimbolo = LIENZO - 8;
  const altoSimbolo = (anchoSimbolo * simbolo.height) / simbolo.width;
  const topeSimbolo = LIENZO - 3;

  // El nombre se agranda hasta llenar el ancho disponible, con un tope para que en un
  // hueco muy alto no crezca más que el símbolo.
  const anchoNombre = LIENZO - 14;
  const cuerpo = Math.min(14, (anchoNombre / fuente.widthOfTextAtSize(NOMBRE, 100)) * 100);
  const espaciado = cuerpo * 0.06;
  const anchoReal = fuente.widthOfTextAtSize(NOMBRE, cuerpo) + espaciado * (NOMBRE.length - 1);

  const ordenes = [
    `q ${anchoSimbolo} 0 0 ${altoSimbolo} ${(LIENZO - anchoSimbolo) / 2} ${(topeSimbolo - altoSimbolo).toFixed(2)} cm /Simbolo Do Q`,
    `BT ${VERDE} rg /Nombre ${cuerpo.toFixed(2)} Tf ${espaciado.toFixed(3)} Tc`,
    `1 0 0 1 ${((LIENZO - anchoReal) / 2).toFixed(2)} 8 Tm (${NOMBRE}) Tj ET`,
  ].join("\n");

  /**
   * Un formulario para un hueco de `ancho`×`alto` puntos. La marca es casi cuadrada, así
   * que en un hueco cuadrado —el único que usa Correos— la matriz sale limpia.
   */
  return function formularioPara(ancho: number, alto: number): PDFRef {
    const clave = `${Math.round(ancho * 10)}x${Math.round(alto * 10)}`;
    const guardado = cache.get(clave);
    if (guardado) return guardado;

    // Contener, no estirar: se usa el lado menor y se centra en el otro.
    const lado = Math.min(ancho, alto);
    const ex = lado / ancho;
    const ey = lado / alto;
    const matriz = [ex / LIENZO, 0, 0, ey / LIENZO, (1 - ex) / 2, (1 - ey) / 2];

    const ref = doc.context.register(
      doc.context.flateStream(ordenes, {
        Type: "XObject",
        Subtype: "Form",
        FormType: 1,
        BBox: [0, 0, LIENZO, LIENZO],
        Matrix: matriz,
        [SELLO_MARCA.asString().slice(1)]: PDFBool.True,
        Resources: {
          XObject: { Simbolo: simbolo.ref },
          Font: { Nombre: fuente.ref },
          ProcSet: [PDFName.of("PDF"), PDFName.of("Text"), PDFName.of("ImageC")],
        },
      }),
    );
    cache.set(clave, ref);
    return ref;
  };
}
