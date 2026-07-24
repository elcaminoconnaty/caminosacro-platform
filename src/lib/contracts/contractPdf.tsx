import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";
import path from "node:path";
import {
  type ContractVariables,
  type PaymentPlan,
  contractIntro,
  contractConsideraciones,
  contractClauses,
  anexosTexto,
  pagareSections,
} from "./template";

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
  dorado: "#b08d3f",
  crema: "#f7f5f0",
  taupe: "#e8e3d8",
  tinta: "#2a2520",
  grisTexto: "#5a5248",
  blanco: "#ffffff",
};

const SERIF = "Times-Roman";
const SERIF_ITALIC = "Times-Italic";

const s = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Inter",
    fontSize: 8.8,
    lineHeight: 1.5,
    color: COLORS.tinta,
  },
  membrete: { textAlign: "center", marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: COLORS.dorado },
  marca: { fontFamily: SERIF, fontSize: 18, letterSpacing: 4, color: COLORS.bosque, lineHeight: 1 },
  submarca: { fontSize: 6.5, letterSpacing: 2, color: COLORS.dorado, marginTop: 5, textTransform: "uppercase", lineHeight: 1 },
  titulo: { fontFamily: SERIF, fontSize: 12, textAlign: "center", marginBottom: 2, textTransform: "uppercase" },
  subtitulo: { fontFamily: SERIF, fontSize: 9.5, textAlign: "center", color: COLORS.dorado, marginBottom: 12, letterSpacing: 1.5, textTransform: "uppercase" },
  p: { marginBottom: 6, textAlign: "justify" },
  h2: { fontWeight: 700, fontSize: 9, marginTop: 10, marginBottom: 4, textTransform: "uppercase" },
  clauseTitle: { fontWeight: 700, fontSize: 8.8, marginTop: 8, marginBottom: 3 },
  firmas: { flexDirection: "row", marginTop: 30, gap: 24 },
  firmaCol: { flex: 1 },
  firmaImg: { height: 46, objectFit: "contain", objectPositionX: 0, marginBottom: 2 },
  firmaEspacio: { height: 48 },
  firmaMecanica: { fontFamily: SERIF_ITALIC, fontSize: 20, color: "#1a2a3a", height: 40, marginTop: 8 },
  firmaMecanicaNota: { fontSize: 6, color: COLORS.grisTexto, marginBottom: 2 },
  firmaLinea: { borderTopWidth: 1, borderTopColor: COLORS.tinta, paddingTop: 4, fontSize: 8.4 },
  firmaNombre: { fontWeight: 700 },
  sello: {
    marginTop: 18,
    backgroundColor: COLORS.crema,
    borderWidth: 1,
    borderColor: COLORS.taupe,
    borderRadius: 4,
    padding: 8,
  },
  selloTitulo: { fontWeight: 700, fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.6, color: COLORS.bosque, marginBottom: 3 },
  selloLinea: { fontSize: 7, color: COLORS.grisTexto, marginBottom: 1 },
  pie: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    textAlign: "center",
    fontSize: 6.5,
    color: COLORS.dorado,
    letterSpacing: 0.8,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.taupe,
    paddingTop: 6,
  },
  pageNum: { position: "absolute", bottom: 24, right: 20, fontSize: 7, color: COLORS.grisTexto },
});

export type ContractSignature = {
  signer_name: string;
  signer_document: string;
  signature_image: string | null; // data URL PNG
  signed_at: string;              // ISO
  signer_ip: string | null;
  signer_user_agent: string | null;
  doc_hash: string | null;        // hash del documento presentado al firmar
};

function Membrete() {
  return (
    <View style={s.membrete} fixed>
      <Text style={s.marca}>CAMINO SACRO</Text>
      <Text style={s.submarca}>Agencia del Camino de Santiago · caminosacro.com</Text>
    </View>
  );
}

function Pie() {
  return (
    <Text style={s.pie} fixed>
      CAMINO SACRO · reservas@caminosacro.com · Respaldado por El Camino con Naty
    </Text>
  );
}

export function ContractPDF({
  variables: v,
  plan,
  signature,
  orgSignature,
}: {
  variables: ContractVariables;
  plan: PaymentPlan;
  signature?: ContractSignature | null;
  // Firma guardada del organizador (data URL PNG). Si no hay, se usa la firma
  // mecánica en cursiva — ambas válidas bajo la Ley 527.
  orgSignature?: string | null;
}) {
  // Fechas siempre en hora de Colombia (la firma se hace desde Colombia; usar
  // UTC corría el día después de las 7 p.m.).
  const signedDate = signature?.signed_at ? new Date(signature.signed_at) : new Date();
  const fechaFirma = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Bogota",
  }).format(signedDate); // yyyy-mm-dd
  const fechaFirmaLarga = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(signedDate);

  return (
    <Document
      title={`Contrato ${v.codigo_cotizacion} — Camino Sacro`}
      author="Camino Sacro"
      subject="Acuerdo de Prestación de Servicios Turísticos"
    >
      <Page size="A4" style={s.page}>
        <Membrete />
        <Text style={s.titulo}>Acuerdo de Prestación de Servicios Turísticos</Text>
        <Text style={s.subtitulo}>Camino Sacro · Cotización {v.codigo_cotizacion}</Text>

        {contractIntro(v).map((p, i) => (
          <Text key={`i${i}`} style={s.p}>{p}</Text>
        ))}

        <Text style={s.h2}>Consideraciones</Text>
        {contractConsideraciones(v).map((p, i) => (
          <Text key={`c${i}`} style={s.p}>{p}</Text>
        ))}

        <Text style={s.h2}>Cláusulas</Text>
        {contractClauses(v, plan).map((cl, i) => (
          <View key={`cl${i}`} wrap>
            <Text style={s.clauseTitle}>{cl.title}</Text>
            {cl.paragraphs.map((p, j) => (
              <Text key={`cl${i}p${j}`} style={s.p}>{p}</Text>
            ))}
          </View>
        ))}

        <Text style={[s.p, { marginTop: 10 }]}>
          Para constancia, se firma electrónicamente el {fechaFirmaLarga}, en dos ejemplares del mismo tenor,
          uno para cada parte. {anexosTexto(v, plan)}
        </Text>

        <View style={s.firmas} wrap={false}>
          <View style={s.firmaCol}>
            {signature?.signature_image ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={signature.signature_image} style={s.firmaImg} />
            ) : (
              <View style={s.firmaEspacio} />
            )}
            <View style={s.firmaLinea}>
              <Text style={s.firmaNombre}>EL VIAJERO</Text>
              <Text>{signature?.signer_name || v.viajero_nombre || "________________"}</Text>
              <Text>
                {v.viajero_tipo_documento || "Documento"} {signature?.signer_document || v.viajero_documento || "________"}
              </Text>
            </View>
          </View>
          <View style={s.firmaCol}>
            {signature ? (
              orgSignature ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={orgSignature} style={s.firmaImg} />
              ) : (
                <Text style={s.firmaMecanica}>Nicolás Villa Posada</Text>
              )
            ) : (
              <View style={s.firmaEspacio} />
            )}
            <View style={s.firmaLinea}>
              <Text style={s.firmaNombre}>EL ORGANIZADOR — CAMINO SACRO</Text>
              <Text>NICOLÁS VILLA POSADA</Text>
              <Text>C.C. 1.017.126.076</Text>
              {signature && <Text style={s.firmaMecanicaNota}>Firmado electrónicamente al aprobar y enviar este contrato</Text>}
            </View>
          </View>
        </View>

        {signature && (
          <View style={s.sello} wrap={false}>
            <Text style={s.selloTitulo}>Constancia de firma electrónica — Ley 527 de 1999 / Decreto 2364 de 2012</Text>
            <Text style={s.selloLinea}>
              Firmado por: {signature.signer_name} · {v.viajero_tipo_documento} {signature.signer_document}
            </Text>
            <Text style={s.selloLinea}>
              Fecha y hora: {new Date(signature.signed_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })} (America/Bogota)
            </Text>
            {signature.signer_ip && <Text style={s.selloLinea}>Dirección IP: {signature.signer_ip}</Text>}
            {signature.signer_user_agent && (
              <Text style={s.selloLinea}>Dispositivo: {signature.signer_user_agent.slice(0, 160)}</Text>
            )}
            {signature.doc_hash && <Text style={s.selloLinea}>Huella SHA-256 del documento aceptado: {signature.doc_hash}</Text>}
          </View>
        )}

        <Pie />
        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} fixed />
      </Page>

      {plan.type === "financiado" && (
        <Page size="A4" style={s.page}>
          <Membrete />
          {pagareSections(v, fechaFirma).map((sec, i) => (
            <View key={`px${i}`} wrap>
              <Text style={[s.h2, { textAlign: "center" }]}>{sec.title}</Text>
              {sec.paragraphs.map((p, j) => (
                <Text key={`px${i}p${j}`} style={s.p}>{p}</Text>
              ))}
            </View>
          ))}

          <View style={[s.firmas, { marginTop: 26 }]} wrap={false}>
            <View style={s.firmaCol}>
              {signature?.signature_image ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={signature.signature_image} style={s.firmaImg} />
              ) : (
                <View style={s.firmaEspacio} />
              )}
              <View style={s.firmaLinea}>
                <Text style={s.firmaNombre}>EL DEUDOR</Text>
                <Text>{signature?.signer_name || v.viajero_nombre || "________________"}</Text>
                <Text>
                  {v.viajero_tipo_documento || "Documento"} {signature?.signer_document || v.viajero_documento || "________"}
                </Text>
              </View>
            </View>
            <View style={s.firmaCol} />
          </View>

          <Pie />
          <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} fixed />
        </Page>
      )}
    </Document>
  );
}
