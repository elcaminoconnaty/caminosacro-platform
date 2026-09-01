/**
 * La identidad de Camino Sacro en PDF, en un solo lugar.
 *
 * Antes vivía copiada dentro de quotePdf.tsx y hotelsPdf.tsx: las mismas fuentes, la
 * misma paleta y el mismo pie de página escritos dos veces, con dos registros distintos
 * de la familia "Inter". El documento de viaje habría sido la tercera copia.
 *
 * Importar este módulo REGISTRA las fuentes como efecto de importación. Es a propósito:
 * cualquier PDF que use `C`, `PageHeader` o `PageFooter` ya trae las fuentes puestas, y
 * nadie tiene que acordarse de llamar a un `registrar()`.
 */
import { Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import path from "node:path";

// Inter TTF locales: soportan el Unicode ancho (flechas, símbolos, «») que las fuentes
// built-in de PDF (Adobe Standard Encoding) no incluyen.
const FONT_DIR = path.join(process.cwd(), "src/lib/fonts");
Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(FONT_DIR, "Inter-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Inter-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
  ],
});
Font.register({
  family: "Inter-Bold",
  fonts: [
    { src: path.join(FONT_DIR, "Inter-Bold.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Inter-BoldItalic.ttf"), fontWeight: 400, fontStyle: "italic" },
  ],
});

// Times built-in para títulos y números: sin caracteres raros, y da el aire de imprenta
// que separa un título de un párrafo.
export const SERIF = "Times-Roman";
export const SERIF_BOLD = "Times-Bold";
export const SANS = "Inter";
export const SANS_BOLD = "Inter-Bold";

export const C = {
  verde: "#1a3a2a",
  verdeM: "#2d5a3d",
  oro: "#f0c060",
  oroH: "#e0a840",
  gris: "#f7f5f0",
  borde: "#e8e3d8",
  txt: "#1a1a1a",
  sec: "#666666",
  white: "#ffffff",
  greenL: "#eef3eb",
  amberL: "#fef8ee",
  amberT: "#633806",
  pinkL: "#fdf2f2",
  pinkT: "#9c2424",
};

const s = StyleSheet.create({
  pageHeader: {
    position: "absolute", top: 24, left: 32, right: 32, flexDirection: "row",
    justifyContent: "space-between", alignItems: "flex-start",
  },
  hLeft: { flexDirection: "column" },
  hBrand: { fontFamily: SERIF_BOLD, fontSize: 11, color: C.verde },
  hSub: { fontFamily: SANS, fontSize: 6.5, color: C.sec, marginTop: 1.5 },
  hPage: { fontFamily: SANS, fontSize: 7, color: C.sec },
  pageFooter: {
    position: "absolute", bottom: 18, left: 32, right: 32,
    flexDirection: "row", justifyContent: "space-between",
    paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.borde,
  },
  pageFooterText: { fontFamily: SANS_BOLD, fontSize: 8, color: C.txt },
  pageFooterRight: { fontFamily: SANS, fontSize: 8, color: C.sec },
});

/** Cabecera de las páginas interiores. `fixed` la repite en cada página. */
export function PageHeader() {
  return (
    <View style={s.pageHeader} fixed>
      <View style={s.hLeft}>
        <Text style={s.hBrand}>Camino Sacro</Text>
        <Text style={s.hSub}>Agencia de peregrinaciones · Respaldado por El Camino con Naty</Text>
      </View>
      <Text style={s.hPage} render={({ pageNumber, totalPages }) => `Pág ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

/**
 * Pie de las páginas interiores. `referencia` es lo que identifica el documento: en una
 * cotización o una documentación de viaje es el código; en la Asistencia en Viaje, que
 * es genérica y no pertenece a ninguna reserva, no va nada.
 */
export function PageFooter({ referencia }: { referencia?: string | null }) {
  return (
    <View style={s.pageFooter} fixed>
      <Text style={s.pageFooterText}>{referencia ? `Camino Sacro · ${referencia}` : "Camino Sacro"}</Text>
      <Text style={s.pageFooterRight}>Respaldado por El Camino con Naty</Text>
    </View>
  );
}
