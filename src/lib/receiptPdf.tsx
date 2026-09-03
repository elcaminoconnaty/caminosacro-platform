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

// Sin guionado: `@react-pdf` parte las palabras por guion al final de línea y con datos
// reales ya se ven cortes como «acomo-dación» o «Ponfe-rrada». Devolver la palabra entera
// desactiva el algoritmo. Es global al módulo `Font`, pero se repite en cada sitio que
// registra fuentes porque no todos los generadores pasan por el mismo módulo.
Font.registerHyphenationCallback((word) => [word]);


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
};

const SERIF = "Times-Roman";

export type ReceiptPdfQuote = {
  code: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  route_name: string | null;
  start_date: string | null;
  end_date: string | null;
  people: number | null;
  total_eur: number;
};

export type ReceiptPdfPayment = {
  receipt_number: string;
  paid_at: string | null;
  amount: number;
  currency: string;
  trm_eur_cop: number | null;
  amount_eur: number | null;
  method: string | null;
  account_label: string | null;
  reference: string | null;
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  brand: { fontFamily: SERIF, fontSize: 22, color: COLORS.blanco },
  brandSub: { fontSize: 9, color: COLORS.dorado, marginTop: 2, letterSpacing: 1 },
  docTitle: { fontFamily: SERIF, fontSize: 16, color: COLORS.blanco, marginTop: 14 },
  receiptNum: { fontSize: 11, color: COLORS.dorado, fontWeight: 700 },
  body: { paddingHorizontal: 36, paddingTop: 18 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  infoItem: { width: "50%", marginBottom: 6 },
  infoLabel: { fontSize: 8, color: COLORS.grisTexto, textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 11, color: COLORS.tinta, marginTop: 1 },
  sectionTitle: { fontFamily: SERIF, fontSize: 13, color: COLORS.bosque, marginBottom: 8 },
  payBox: { borderWidth: 1, borderColor: COLORS.taupe, borderRadius: 4, overflow: "hidden", marginBottom: 16 },
  payRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.taupe },
  payRowLast: { flexDirection: "row" },
  payLabel: {
    width: "40%",
    backgroundColor: COLORS.crema,
    paddingVertical: 7,
    paddingHorizontal: 10,
    fontSize: 9,
    color: COLORS.grisTexto,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  payValue: { width: "60%", paddingVertical: 7, paddingHorizontal: 10, fontSize: 10.5, color: COLORS.tinta },
  amountBox: {
    backgroundColor: COLORS.bosque,
    borderRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountLabel: { fontSize: 9, color: COLORS.dorado, textTransform: "uppercase", letterSpacing: 1 },
  amountValue: { fontFamily: SERIF, fontSize: 22, color: COLORS.blanco },
  summaryBox: { borderWidth: 1, borderColor: COLORS.taupe, borderRadius: 4, overflow: "hidden" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.taupe },
  summaryRowLast: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: COLORS.crema },
  summaryLabel: { fontSize: 10, color: COLORS.grisTexto },
  summaryValue: { fontSize: 10.5, color: COLORS.tinta, fontWeight: 700 },
  saldoLabel: { fontSize: 10.5, color: COLORS.bosque, fontWeight: 700 },
  saldoValue: { fontSize: 11.5, color: COLORS.bosque, fontWeight: 700 },
  thanks: { marginTop: 18, fontSize: 9.5, color: COLORS.grisTexto, fontStyle: "italic", textAlign: "center" },
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

const fmtEur = (n: number) =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtMonto = (n: number, currency: string) =>
  `${new Intl.NumberFormat(currency === "COP" ? "es-CO" : "es-ES", {
    minimumFractionDigits: currency === "COP" ? 0 : 2,
    maximumFractionDigits: currency === "COP" ? 0 : 2,
  }).format(n)} ${currency}`;

function fmtFechaLarga(d: string | null): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(d + "T00:00:00"),
    );
  } catch {
    return d;
  }
}

function fmtRango(start: string | null, end: string | null): string {
  if (start && end) return `${fmtFechaLarga(start)} al ${fmtFechaLarga(end)}`;
  return fmtFechaLarga(start || end);
}

export function ReceiptPDF({
  quote,
  payment,
  cobradoEur,
  saldoEur,
}: {
  quote: ReceiptPdfQuote;
  payment: ReceiptPdfPayment;
  cobradoEur: number;
  saldoEur: number;
}) {
  const detalles: Array<[string, string]> = [
    ["Fecha del pago", fmtFechaLarga(payment.paid_at)],
    ["Monto recibido", fmtMonto(payment.amount, payment.currency)],
  ];
  if (payment.currency !== "EUR" && payment.trm_eur_cop) {
    detalles.push(["TRM aplicada", `${fmtEur(payment.trm_eur_cop)} COP por 1 EUR`]);
  }
  if (payment.currency !== "EUR" && payment.amount_eur != null) {
    detalles.push(["Equivalente", `${fmtEur(payment.amount_eur)} EUR`]);
  }
  if (payment.method) detalles.push(["Método", payment.method]);
  if (payment.account_label) detalles.push(["Cuenta que recibió", payment.account_label]);
  if (payment.reference) detalles.push(["Referencia", payment.reference]);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>Camino Sacro</Text>
          <Text style={styles.brandSub}>AGENCIA DEL CAMINO DE SANTIAGO</Text>
          <View style={styles.headerRow}>
            <Text style={styles.docTitle}>Recibo de pago</Text>
            <Text style={styles.receiptNum}>{payment.receipt_number}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Recibido de</Text>
              <Text style={styles.infoValue}>{quote.client_name || "—"}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Cotización</Text>
              <Text style={styles.infoValue}>{quote.code}</Text>
            </View>
            {quote.client_phone ? (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Teléfono</Text>
                <Text style={styles.infoValue}>{quote.client_phone}</Text>
              </View>
            ) : null}
            {quote.client_email ? (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{quote.client_email}</Text>
              </View>
            ) : null}
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ruta</Text>
              <Text style={styles.infoValue}>{quote.route_name || "—"}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Fechas del viaje</Text>
              <Text style={styles.infoValue}>{fmtRango(quote.start_date, quote.end_date)}</Text>
            </View>
            {quote.people ? (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Peregrinos</Text>
                <Text style={styles.infoValue}>{quote.people}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Pago recibido</Text>
            <Text style={styles.amountValue}>{fmtMonto(payment.amount, payment.currency)}</Text>
          </View>

          <Text style={styles.sectionTitle}>Detalle del pago</Text>
          <View style={styles.payBox}>
            {detalles.map(([label, value], i) => (
              <View key={label} style={i === detalles.length - 1 ? styles.payRowLast : styles.payRow}>
                <Text style={styles.payLabel}>{label}</Text>
                <Text style={styles.payValue}>{value}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Estado de la reserva</Text>
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total de la cotización</Text>
              <Text style={styles.summaryValue}>{fmtEur(quote.total_eur)} EUR</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total abonado a la fecha</Text>
              <Text style={styles.summaryValue}>{fmtEur(cobradoEur)} EUR</Text>
            </View>
            <View style={styles.summaryRowLast}>
              <Text style={styles.saldoLabel}>Saldo pendiente</Text>
              <Text style={styles.saldoValue}>{fmtEur(saldoEur)} EUR</Text>
            </View>
          </View>

          <Text style={styles.thanks}>
            ¡Gracias por tu pago! Este recibo confirma el abono a tu reserva del Camino de Santiago.
          </Text>
        </View>

        <Text style={styles.footer} fixed>
          Camino Sacro · El Camino con Naty · caminosacro.com · WhatsApp +57 300 491 0929
        </Text>
      </Page>
    </Document>
  );
}
