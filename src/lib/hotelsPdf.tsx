import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import path from "node:path";

const fontsDir = path.join(process.cwd(), "src/lib/fonts");

Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(fontsDir, "Inter-Regular.ttf"), fontWeight: 400 },
    { src: path.join(fontsDir, "Inter-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
    { src: path.join(fontsDir, "Inter-Bold.ttf"), fontWeight: 700 },
    { src: path.join(fontsDir, "Inter-BoldItalic.ttf"), fontWeight: 700, fontStyle: "italic" },
  ],
});

const COLORS = {
  bosque: "#1a3a2a",
  bosqueMedio: "#2d5a3d",
  dorado: "#f0c060",
  doradoOscuro: "#e0a840",
  crema: "#f7f5f0",
  taupe: "#e8e3d8",
  tinta: "#2a2520",
  blanco: "#ffffff",
  grisTexto: "#5a5248",
  ambar: "#fef3c7",
  ambarBorde: "#f0c060",
};

const SERIF = "Times-Roman";

export type HotelRow = {
  night_date: string | null;
  city: string | null;
  hotel_name: string | null;
  address: string | null;
  contact: string | null;
  notes: string | null;
};

export type HotelsPdfQuote = {
  code: string;
  client_name: string | null;
  route_name: string | null;
  start_date: string | null;
  end_date: string | null;
  people: number | null;
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.blanco,
    paddingTop: 0,
    paddingBottom: 60,
    fontFamily: "Inter",
    fontSize: 10,
    color: COLORS.tinta,
  },
  header: {
    backgroundColor: COLORS.bosque,
    paddingHorizontal: 36,
    paddingTop: 28,
    paddingBottom: 22,
    color: COLORS.blanco,
  },
  brand: { fontFamily: SERIF, fontSize: 22, color: COLORS.blanco },
  brandSub: { fontSize: 9, color: COLORS.dorado, marginTop: 2, letterSpacing: 1 },
  docTitle: { fontFamily: SERIF, fontSize: 16, color: COLORS.blanco, marginTop: 14 },
  body: { paddingHorizontal: 36, paddingTop: 18 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  infoItem: { width: "50%", marginBottom: 6 },
  infoLabel: { fontSize: 8, color: COLORS.grisTexto, textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 11, color: COLORS.tinta, marginTop: 1 },
  note: {
    backgroundColor: COLORS.ambar,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.ambarBorde,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 3,
    marginBottom: 16,
  },
  noteText: { fontSize: 9.5, color: COLORS.tinta, lineHeight: 1.4 },
  table: { borderWidth: 1, borderColor: COLORS.taupe, borderRadius: 4, overflow: "hidden" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.taupe },
  trLast: { flexDirection: "row" },
  th: {
    backgroundColor: COLORS.bosque,
    color: COLORS.blanco,
    fontSize: 8.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  td: { paddingVertical: 7, paddingHorizontal: 8, fontSize: 9.5, color: COLORS.tinta },
  colNoche: { width: "16%" },
  colCiudad: { width: "20%" },
  colHotel: { width: "30%" },
  colDir: { width: "34%" },
  rowAlt: { backgroundColor: COLORS.crema },
  hotelName: { fontWeight: 700 },
  small: { fontSize: 8.5, color: COLORS.grisTexto, marginTop: 2 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    textAlign: "center",
    fontSize: 8,
    color: COLORS.grisTexto,
  },
});

function fmtFecha(d: string | null): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(new Date(d + "T00:00:00"));
  } catch {
    return d;
  }
}

function fmtRango(start: string | null, end: string | null): string {
  const f = (d: string | null) =>
    d ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d + "T00:00:00")) : "";
  if (start && end) return `${f(start)} al ${f(end)}`;
  return f(start) || f(end) || "—";
}

export function HotelsPDF({
  quote,
  hotels,
}: {
  quote: HotelsPdfQuote;
  hotels: HotelRow[];
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>Camino Sacro</Text>
          <Text style={styles.brandSub}>AGENCIA DEL CAMINO DE SANTIAGO</Text>
          <Text style={styles.docTitle}>Listado de alojamientos</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Viajero</Text>
              <Text style={styles.infoValue}>{quote.client_name || "—"}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Cotización</Text>
              <Text style={styles.infoValue}>{quote.code}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ruta</Text>
              <Text style={styles.infoValue}>{quote.route_name || "—"}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Fechas</Text>
              <Text style={styles.infoValue}>{fmtRango(quote.start_date, quote.end_date)}</Text>
            </View>
            {quote.people ? (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Personas</Text>
                <Text style={styles.infoValue}>{quote.people}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.note}>
            <Text style={styles.noteText}>
              Importante: estos alojamientos son una referencia y pueden sufrir modificaciones según la disponibilidad
              de cada localidad. Ante cualquier cambio, te avisaremos con la mayor antelación posible.
            </Text>
          </View>

          <View style={styles.table}>
            <View style={styles.tr} wrap={false}>
              <Text style={[styles.th, styles.colNoche]}>Noche</Text>
              <Text style={[styles.th, styles.colCiudad]}>Ciudad</Text>
              <Text style={[styles.th, styles.colHotel]}>Alojamiento</Text>
              <Text style={[styles.th, styles.colDir]}>Dirección / Contacto</Text>
            </View>
            {hotels.map((h, i) => {
              const last = i === hotels.length - 1;
              return (
                <View key={i} style={[last ? styles.trLast : styles.tr, i % 2 === 1 ? styles.rowAlt : {}]} wrap={false}>
                  <Text style={[styles.td, styles.colNoche]}>{fmtFecha(h.night_date)}</Text>
                  <Text style={[styles.td, styles.colCiudad]}>{h.city || "—"}</Text>
                  <View style={[styles.td, styles.colHotel]}>
                    <Text style={styles.hotelName}>{h.hotel_name || "—"}</Text>
                    {h.notes ? <Text style={styles.small}>{h.notes}</Text> : null}
                  </View>
                  <View style={[styles.td, styles.colDir]}>
                    <Text>{h.address || "—"}</Text>
                    {h.contact ? <Text style={styles.small}>{h.contact}</Text> : null}
                  </View>
                </View>
              );
            })}
            {hotels.length === 0 && (
              <View style={styles.trLast}>
                <Text style={[styles.td, { width: "100%", textAlign: "center", color: COLORS.grisTexto }]}>
                  Sin alojamientos cargados.
                </Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Camino Sacro · El Camino con Naty · caminosacro.com · WhatsApp +57 300 491 0929
        </Text>
      </Page>
    </Document>
  );
}
