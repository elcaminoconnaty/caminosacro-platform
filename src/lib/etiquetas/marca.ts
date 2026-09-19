/**
 * La marca de Camino Sacro, lista para ocupar el hueco que deja el logo de un proveedor
 * dentro de una etiqueta de equipaje.
 *
 * ── Qué se dibuja ───────────────────────────────────────────────────────────────────
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
 * Sello privado del formulario de la marca.
 *
 * Existe por la idempotencia: nuestro símbolo también es "una imagen chica que se repite a
 * dos tamaños", o sea que el detector de logos se reconocería a sí mismo y volvería a
 * envolver la marca en otra marca cada vez que una etiqueta ya procesada se vuelva a subir.
 * Con esto, el recorrido se salta lo que ya es nuestro. La clave no es estándar y a un
 * visor le da igual: las claves desconocidas en un diccionario de PDF se ignoran.
 */
export const SELLO_MARCA = PDFName.of("CSMarcaCaminoSacro");

/** El verde de Camino Sacro (`C.verde` de pdfChrome), en componentes 0-1 para el PDF. */
const VERDE = "0.102 0.227 0.165";

const NOMBRE = "CAMINO SACRO";

/** El lienzo del formulario. Números redondos para que la composición se lea sola. */
const LIENZO = 100;

const RUTA_SIMBOLO = path.join(process.cwd(), "src/lib/etiquetas/marca-camino-sacro.png");

/**
 * Prepara la marca una vez por documento y devuelve una fábrica de formularios: uno por
 * cada forma de hueco distinta. El símbolo y la fuente se incrustan UNA sola vez aunque el
 * logo aparezca en veinte sitios (una etiqueta por viajero en un grupo de trece).
 */
export async function prepararMarca(doc: PDFDocument) {
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
