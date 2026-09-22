/**
 * Le quita a una etiqueta de transporte de equipaje el logo del intermediario, dejando
 * TODO lo demás byte a byte como vino.
 *
 * Lo que queda en su sitio lo decide Nico, no el código: o la marca de Camino Sacro, o
 * nada —el hueco limpio, la etiqueta igualita pero sin logo de nadie—. Ver `ModoLogo` en
 * `marca.ts` y la preferencia guardada en `memoria.ts`. Todo lo demás de este archivo es
 * idéntico en los dos casos: lo que cambia es qué formulario se pone, no qué se quita.
 *
 * ── El problema ─────────────────────────────────────────────────────────────────────
 * Las mochilas las mueve Correos (Paq Mochila) y la reserva la hace Pilgrim, nuestro
 * operador en España. La etiqueta que Correos emite lleva, junto a su corneta, el logo de
 * Pilgrim: el peregrino que nos compró a nosotros acaba con el nombre de nuestro
 * proveedor pegado a la mochila durante todo el Camino. Eso es lo que se quita siempre;
 * poner el nuestro encima es una decisión aparte, y a veces la respuesta es que no.
 *
 * ── Por qué no se regenera la etiqueta entera ───────────────────────────────────────
 * Sería lo fácil de programar y lo peligroso de usar. La etiqueta amarilla es el documento
 * OPERATIVO de Correos —lo mira el repartidor que recoge a las 8 de la mañana—, lleva su
 * marca registrada y sus condiciones de servicio, y los datos que trae (los alojamientos
 * de cada noche, el código de reserva) los pone Pilgrim, no nosotros. Dibujar una copia
 * nuestra sería falsificar el impreso de un tercero y arriesgar que la mochila no viaje.
 * Acá se cambia UNA imagen y no se toca nada más: ni el amarillo, ni la corneta, ni el
 * texto, ni las medidas, ni las líneas de corte.
 *
 * ── Cómo se reconoce el logo ────────────────────────────────────────────────────────
 * En las etiquetas de Correos la hoja entera es una imagen de fondo (el impreso en blanco)
 * y encima FPDF escribe los datos; el logo del intermediario es OTRA imagen suelta,
 * dibujada dos veces: una pequeña en la cabecera y otra grande y girada 180° en el
 * reverso, que es la cara que queda a la vista cuando la etiqueta se dobla. O sea que el
 * logo se distingue solo: es la imagen que no es el fondo y que se repite.
 *
 * Aun así no se borra nada a ciegas — ver `pareceLogo`, que es deliberadamente estricto:
 * ante la duda la etiqueta se guarda entera, con el logo del proveedor y todo. Una etiqueta
 * fea llega igual a Santiago; una etiqueta a la que le faltó un dato, no.
 *
 * Y de lo que se quita se guarda la huella: la próxima etiqueta del mismo proveedor ya sale
 * reconocida, sin nada que revisar. Si algún día un proveedor nuevo trae una plantilla que
 * no se reconoce, la etiqueta se guarda tal cual y basta con correr
 * `scripts/etiqueta_prueba.ts` contra ese PDF y pegar la huella que imprime en
 * `memoria.ts`: a partir de ahí esa plantilla queda aprendida.
 *
 * Quien decide de verdad es Nico: el archivo que subió se guarda intacto al lado y en la
 * tarjeta del expediente puede volver a él de un clic. Ver `travelDocActions.ts`.
 */
import crypto from "node:crypto";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
} from "pdf-lib";
import { IDENTIDAD, Matriz, componer, invocaciones, leerFlujo, renombrarInvocaciones } from "./contenido";
import { type ModoLogo, SELLO_MARCA, prepararRelleno } from "./marca";

/** Las huellas que ya sabemos qué son. Vive en `settings`; ver `memoria.ts`. */
export type MemoriaLogos = {
  /** Imágenes confirmadas como logo de un proveedor: se quitan sin preguntar. */
  logos: string[];
  /** Imágenes que Nico dijo que NO son un logo: no se tocan nunca más. */
  respetar: string[];
};

export const MEMORIA_VACIA: MemoriaLogos = { logos: [], respetar: [] };

export type InformeEtiqueta = {
  /** Cuántas colocaciones del logo se sustituyeron. 0 = la etiqueta quedó igual. */
  reemplazos: number;
  /** Huellas de lo que se quitó, para que la próxima etiqueta igual salga reconocida. */
  huellas: string[];
  /** true si todo lo que se quitó ya estaba confirmado: no hay nada que revisar. */
  reconocido: boolean;
  /** Frases para la tarjeta del expediente. */
  detalle: string[];
  /** Qué quedó en el hueco. Las etiquetas de antes de que se pudiera elegir no lo traen. */
  modo?: ModoLogo;
};

/** A partir de esta parte de la hoja, una imagen ya no puede ser un logo: es el fondo. */
const MAX_PARTE_HOJA = 0.45;
/** Por debajo de esto es un adorno o una viñeta, no un logo. */
const MIN_PUNTOS = 10;
/** Un logo es compacto; una tira muy alargada suele ser un código de barras. */
const ASPECTO = { min: 0.25, max: 4 };
/** Un logo se repite (cabecera y reverso). Una foto o un código de barras, no. */
const MIN_APARICIONES = 2;
/**
 * Y se repite A DOS TAMAÑOS: pequeño en la cara que se rellena y grande en el reverso, que
 * es la que queda a la vista cuando la etiqueta se dobla sobre el asa de la mochila.
 *
 * Este es el filtro que de verdad decide. Sin él, "una imagen chica que se repite" también
 * describe el icono de una lista, el sello de un pie de página o una viñeta — probado
 * contra el Documento de Viaje y la Asistencia en Viaje de Pilgrim, donde el heurístico
 * suelto se llevaba por delante media docena de dibujos que no eran el logo.
 */
const MIN_TAMANOS = 2;
/** Tope de anidamiento al meterse en XObjects de formulario. */
const MAX_PROFUNDIDAD = 4;

type Uso = {
  flujo: string;
  ini: number;
  fin: number;
  ancho: number;
  alto: number;
  pagina: { ancho: number; alto: number };
};

type Imagen = {
  huella: string;
  refs: PDFRef[];
  anchoPx: number;
  altoPx: number;
  /** Dónde está declarado el nombre de la imagen, para poder quitarlo de los recursos. */
  declaraciones: { recursos: PDFDict; nombre: PDFName }[];
  usos: Uso[];
};

type Flujo = {
  texto: string;
  recursos: PDFDict | undefined;
  guardar: (nuevo: string) => void;
};

/**
 * Analiza el PDF y, si encuentra el logo del proveedor, devuelve una copia sin él: con
 * nuestra marca en su lugar (`modo: "marca"`) o con el hueco limpio (`modo: "sin-logo"`).
 * Si no encuentra nada que tocar devuelve `pdf: null` y el original se guarda tal cual:
 * una etiqueta sin cambiar siempre es mejor que una etiqueta rota.
 */
export async function quitarLogoProveedor(
  original: Uint8Array,
  memoria: MemoriaLogos = MEMORIA_VACIA,
  modo: ModoLogo = "marca",
): Promise<{ pdf: Uint8Array | null; informe: InformeEtiqueta }> {
  const sinCambios = (motivo: string): { pdf: null; informe: InformeEtiqueta } => ({
    pdf: null,
    informe: { reemplazos: 0, huellas: [], reconocido: true, detalle: [motivo], modo },
  });

  let doc: PDFDocument;
  try {
    // `updateMetadata: false` para no estamparle a la etiqueta de Correos una fecha de
    // modificación nuestra: el archivo debe seguir pareciéndose al que emitió el
    // transportista. Un PDF cifrado revienta acá a propósito y se guarda tal cual.
    doc = await PDFDocument.load(original, { updateMetadata: false });
  } catch {
    return sinCambios("No pude leer el PDF (¿protegido con contraseña?); se guarda tal cual.");
  }

  const ctx = doc.context;
  const paginas = doc.getPages();
  const flujos = new Map<string, Flujo>();
  const imagenes = new Map<string, Imagen>();
  const formasVistas = new Set<string>();
  let ilegible = false;

  /** Recorre un flujo, anota las imágenes que dibuja y se mete en los formularios. */
  function recorrer(
    clave: string,
    texto: string,
    recursos: PDFDict | undefined,
    base: Matriz,
    hoja: { ancho: number; alto: number },
    profundidad: number,
  ) {
    const ordenes = invocaciones(texto, base);
    if (!ordenes) { ilegible = true; return; }
    const xobjects = recursos?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xobjects) return;

    for (const orden of ordenes) {
      const nombre = PDFName.of(orden.nombre);
      const ref = xobjects.get(nombre);
      if (!(ref instanceof PDFRef)) continue;
      const objeto = ctx.lookup(ref);
      if (!(objeto instanceof PDFRawStream)) continue;
      const subtipo = objeto.dict.get(PDFName.of("Subtype"))?.toString();

      if (subtipo === "/Image") {
        const huella = crypto.createHash("sha256").update(Buffer.from(objeto.contents)).digest("hex");
        const imagen = imagenes.get(huella) ?? {
          huella,
          refs: [],
          anchoPx: objeto.dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber() ?? 0,
          altoPx: objeto.dict.lookupMaybe(PDFName.of("Height"), PDFNumber)?.asNumber() ?? 0,
          declaraciones: [],
          usos: [],
        };
        if (!imagen.refs.includes(ref)) imagen.refs.push(ref);
        if (!imagen.declaraciones.some((d) => d.recursos === xobjects && d.nombre === nombre)) {
          imagen.declaraciones.push({ recursos: xobjects, nombre });
        }
        imagen.usos.push({ flujo: clave, ini: orden.ini, fin: orden.fin, ancho: orden.ancho, alto: orden.alto, pagina: hoja });
        imagenes.set(huella, imagen);
        continue;
      }

      if (subtipo === "/Form" && profundidad < MAX_PROFUNDIDAD) {
        // Una etiqueta ya marcada que se vuelva a subir no se marca encima: nuestra propia
        // marca lleva sello y el recorrido no entra en ella.
        if (objeto.dict.has(SELLO_MARCA)) continue;
        const claveForma = `form:${ref.tag}`;
        if (formasVistas.has(claveForma)) continue; // un formulario se recorre una sola vez
        formasVistas.add(claveForma);

        const propia = objeto.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray);
        const numeros = propia?.asArray().map((n) => (n instanceof PDFNumber ? n.asNumber() : NaN)) ?? [];
        const suya: Matriz = numeros.length === 6 && numeros.every(Number.isFinite) ? (numeros as Matriz) : IDENTIDAD;

        const texto2 = leerFlujo(ctx, objeto);
        const recursos2 = objeto.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? recursos;
        flujos.set(claveForma, {
          texto: texto2,
          recursos: recursos2,
          guardar: (nuevo) => ctx.assign(ref, rehacerFormulario(objeto, nuevo)),
        });
        recorrer(claveForma, texto2, recursos2, componer(suya, orden.matriz), hoja, profundidad + 1);
      }
    }
  }

  paginas.forEach((pagina, i) => {
    const hoja = { ancho: pagina.getWidth(), alto: pagina.getHeight() };
    const recursos = pagina.node.Resources();
    const clave = `pagina:${i}`;
    const texto = leerFlujo(ctx, pagina.node.Contents());
    flujos.set(clave, {
      texto,
      recursos,
      guardar: (nuevo) => {
        pagina.node.set(PDFName.of("Contents"), ctx.register(ctx.flateStream(Buffer.from(nuevo, "latin1"))));
      },
    });
    recorrer(clave, texto, recursos, IDENTIDAD, hoja, 0);
  });

  if (ilegible) {
    return sinCambios("La etiqueta trae imágenes incrustadas en el flujo de dibujo; se guarda tal cual.");
  }

  // ── Quién se va y quién se queda ─────────────────────────────────────────────────
  const aQuitar: Imagen[] = [];
  let algunaSinConfirmar = false;

  for (const imagen of imagenes.values()) {
    if (memoria.respetar.includes(imagen.huella)) continue;
    const conocida = memoria.logos.includes(imagen.huella);
    if (!conocida && !pareceLogo(imagen)) continue;
    if (!conocida) algunaSinConfirmar = true;
    aQuitar.push(imagen);
  }

  if (aQuitar.length === 0) {
    return sinCambios(
      "No reconocí el logo del proveedor en esta etiqueta, así que se guarda tal cual. Si es una plantilla nueva, pásamela y la dejo aprendida.",
    );
  }

  // ── El cambio ────────────────────────────────────────────────────────────────────
  const formularioPara = await prepararRelleno(doc, modo);
  const cambiosPorFlujo = new Map<string, { ini: number; fin: number; nuevo: string }[]>();
  let n = 0;

  for (const imagen of aQuitar) {
    for (const uso of imagen.usos) {
      const nombre = `CSMarca${n++}`;
      const destino = flujos.get(uso.flujo);
      const xobjects = destino?.recursos?.lookupMaybe(PDFName.of("XObject"), PDFDict);
      if (!xobjects) continue;
      xobjects.set(PDFName.of(nombre), formularioPara(uso.ancho, uso.alto));
      const lista = cambiosPorFlujo.get(uso.flujo) ?? [];
      lista.push({ ini: uso.ini, fin: uso.fin, nuevo: nombre });
      cambiosPorFlujo.set(uso.flujo, lista);
    }
  }

  for (const [clave, cambios] of cambiosPorFlujo) {
    const destino = flujos.get(clave);
    if (destino) destino.guardar(renombrarInvocaciones(destino.texto, cambios));
  }

  // El logo no se tapa: se borra. Si solo se dibujara encima, la imagen seguiría dentro del
  // archivo y cualquiera la sacaría con un visor.
  for (const imagen of aQuitar) {
    for (const { recursos, nombre } of imagen.declaraciones) recursos.delete(nombre);
    for (const ref of imagen.refs) {
      const objeto = ctx.lookup(ref);
      if (objeto instanceof PDFRawStream) {
        const mascara = objeto.dict.get(PDFName.of("SMask"));
        if (mascara instanceof PDFRef) ctx.delete(mascara);
      }
      ctx.delete(ref);
    }
  }

  return {
    pdf: await doc.save({ useObjectStreams: false }),
    informe: {
      reemplazos: aQuitar.reduce((total, i) => total + i.usos.length, 0),
      huellas: aQuitar.map((i) => i.huella),
      reconocido: !algunaSinConfirmar,
      modo,
      detalle: aQuitar.map((imagen) => {
        // Las medidas se repiten (una etiqueta por viajero da la misma pareja de tamaños en
        // cada hoja): se listan las distintas, no las veces.
        const medidas = [...new Set(imagen.usos.map((u) => `${cm(u.ancho)}×${cm(u.alto)} cm`))];
        const veces = imagen.usos.length;
        const sitios = `${veces} ${veces === 1 ? "sitio" : "sitios"} (${medidas.join(" y ")})`;
        return modo === "sin-logo"
          ? `Logo del proveedor quitado, sin poner nada en su lugar, en ${sitios}.`
          : `Logo del proveedor sustituido por nuestra marca en ${sitios}.`;
      }),
    },
  };
}

/**
 * Los filtros que evitan borrar algo que no es un logo. Tienen que pasar TODOS: es
 * preferible dejar una etiqueta con el logo del proveedor que devolverle al peregrino una
 * etiqueta sin su código de barras.
 */
function pareceLogo(imagen: Imagen): boolean {
  if (imagen.usos.length < MIN_APARICIONES) return false;
  for (const u of imagen.usos) {
    if (Math.max(u.ancho, u.alto) < MIN_PUNTOS) return false;
    if (u.ancho > u.pagina.ancho * MAX_PARTE_HOJA) return false;
    if (u.alto > u.pagina.alto * MAX_PARTE_HOJA) return false;
  }
  const tamanos = new Set(imagen.usos.map((u) => `${Math.round(u.ancho * 2)}x${Math.round(u.alto * 2)}`));
  if (tamanos.size < MIN_TAMANOS) return false;
  if (!imagen.anchoPx || !imagen.altoPx) return false;
  const aspecto = imagen.anchoPx / imagen.altoPx;
  return aspecto >= ASPECTO.min && aspecto <= ASPECTO.max;
}

/**
 * Un XObject de formulario con el mismo diccionario y otro contenido. `/Length`, `/Filter`
 * y `/DecodeParms` se dejan fuera porque los vuelve a poner `flateStream`: copiarlos
 * describiría el contenido viejo y el PDF quedaría ilegible.
 */
function rehacerFormulario(original: PDFRawStream, contenido: string): PDFRawStream {
  const heredado: Record<string, PDFObject> = {};
  for (const [clave, valor] of original.dict.entries()) {
    const nombre = clave.asString().slice(1);
    if (nombre === "Length" || nombre === "Filter" || nombre === "DecodeParms") continue;
    heredado[nombre] = valor;
  }
  return original.dict.context.flateStream(Buffer.from(contenido, "latin1"), heredado);
}

/** Puntos PostScript a centímetros, que es como se mira una etiqueta impresa. */
function cm(puntos: number): string {
  return ((puntos / 72) * 2.54).toFixed(1);
}
