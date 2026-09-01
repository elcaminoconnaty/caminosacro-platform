/**
 * Asistencia en Viaje: la guía de "a quién llamo si pasa algo".
 *
 * Es GENÉRICA. Lo verifiqué leyendo las 11 páginas del PDF que manda Pilgrim
 * (ASISTENCIA_EN_VIAJE_PILGRIM.pdf): no menciona al viajero ni el número de reserva en
 * ninguna parte, aunque Pilgrim la enlace en cada correo como si fuera personalizada.
 * Por eso hay UNA sola, se regenera desde Configuración y vive en
 * comercial-docs/generico: corregir un teléfono vale también para los viajes ya enviados.
 *
 * Todo el texto y todos los números vienen de comercial.settings, clave
 * `asistencia_viaje`. Acá no hay ni un teléfono escrito a mano — si lo hubiera, cambiarlo
 * exigiría un despliegue y tarde o temprano el PDF diría una cosa y el CRM otra.
 */
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { C, SERIF, SERIF_BOLD, SANS, SANS_BOLD, PageHeader, PageFooter } from "@/lib/pdfChrome";

export type AsistenciaTelefono = { nombre: string; numero: string };

export type AsistenciaSeccion = {
  clave: string;
  titulo: string;
  entradilla?: string | null;
  pasos: string[];
  recuerda?: string | null;
  telefonos_titulo?: string | null;
  telefonos: AsistenciaTelefono[];
};

export type AsistenciaTexts = {
  intro?: string[];
  secciones: AsistenciaSeccion[];
};

const s = StyleSheet.create({
  page: { fontFamily: SANS, fontSize: 9.5, color: C.txt, paddingTop: 70, paddingBottom: 44, paddingHorizontal: 32 },

  coverPage: { position: "relative", padding: 0, backgroundColor: C.verde, fontFamily: SANS },
  coverContent: { position: "absolute", left: 40, right: 40, top: 150 },
  coverBrand: { fontFamily: SERIF_BOLD, fontSize: 13, color: C.white },
  coverBrandSub: { fontFamily: SANS, fontSize: 7.5, color: "rgba(255,255,255,0.75)", marginTop: 4 },
  coverTop: { position: "absolute", top: 40, left: 40, right: 40 },
  coverEyebrow: { fontFamily: SANS, fontSize: 7.5, color: C.oro, letterSpacing: 3, marginBottom: 12 },
  coverTitle: { fontFamily: SERIF, fontSize: 40, color: C.white, lineHeight: 1.1 },
  coverTagline: { fontFamily: SANS, fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 16, lineHeight: 1.5 },
  coverDivider: { width: 60, height: 0.5, backgroundColor: "rgba(255,255,255,0.3)", marginVertical: 22 },
  coverNote: { fontFamily: SANS, fontSize: 9, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, marginBottom: 6 },
  coverFoot: { position: "absolute", bottom: 40, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between" },
  coverFootText: { fontFamily: SANS, fontSize: 7.5, color: "rgba(255,255,255,0.55)" },

  eyebrow: { fontFamily: SANS, fontSize: 7.5, color: C.oroH, letterSpacing: 2, marginBottom: 4 },
  h1: { fontFamily: SERIF, fontSize: 24, color: C.verde, lineHeight: 1.2, marginBottom: 8 },
  entradilla: { fontFamily: SANS, fontSize: 9.5, color: C.sec, lineHeight: 1.5, marginBottom: 16 },

  // Índice de la página 2
  idxRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: C.borde },
  idxNum: { fontFamily: SERIF_BOLD, fontSize: 14, color: C.oroH, width: 30 },
  idxName: { fontFamily: SANS_BOLD, fontSize: 10.5, color: C.verde, flex: 1 },
  idxPhone: { fontFamily: SANS, fontSize: 8.5, color: C.sec },

  step: { flexDirection: "row", marginBottom: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.verde, alignItems: "center", justifyContent: "center", marginRight: 10 },
  stepNumText: { fontFamily: SANS_BOLD, fontSize: 9, color: C.white },
  stepText: { fontFamily: SANS, fontSize: 9, color: C.txt, lineHeight: 1.5, flex: 1, paddingTop: 4 },

  recuerda: { backgroundColor: C.amberL, borderLeftWidth: 3, borderLeftColor: C.oro, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 2, marginTop: 6, marginBottom: 14 },
  recuerdaTitle: { fontFamily: SANS_BOLD, fontSize: 8.5, color: C.amberT, marginBottom: 3 },
  recuerdaText: { fontFamily: SANS, fontSize: 8.5, color: C.amberT, lineHeight: 1.5 },

  phoneBox: { backgroundColor: C.verde, borderRadius: 4, paddingVertical: 14, paddingHorizontal: 16, marginTop: 4 },
  phoneBoxTitle: { fontFamily: SANS, fontSize: 7.5, color: C.oro, letterSpacing: 2, marginBottom: 10 },
  phoneRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 },
  phoneName: { fontFamily: SANS, fontSize: 8.5, color: "rgba(255,255,255,0.75)", flex: 1, paddingRight: 10 },
  phoneNumber: { fontFamily: SERIF_BOLD, fontSize: 14, color: C.white },

  closing: { marginTop: 30, alignItems: "center" },
  closingTitle: { fontFamily: SERIF, fontSize: 26, color: C.verde },
  closingText: { fontFamily: SANS, fontSize: 9, color: C.sec, marginTop: 8, textAlign: "center", lineHeight: 1.6 },
});

export function AsistenciaPDF({ texts }: { texts: AsistenciaTexts }) {
  const secciones = texts.secciones || [];
  return (
    <Document author="Camino Sacro" title="Asistencia en Viaje — Camino Sacro" subject="Camino de Santiago">
      {/* ============ PORTADA ============ */}
      <Page size="A4" style={s.coverPage}>
        <View style={s.coverTop}>
          <Text style={s.coverBrand}>Camino Sacro</Text>
          <Text style={s.coverBrandSub}>Agencia del Camino de Santiago</Text>
        </View>

        <View style={s.coverContent}>
          <Text style={s.coverEyebrow}>GUÍA DE ASISTENCIA</Text>
          <Text style={s.coverTitle}>Asistencia{"\n"}en viaje</Text>
          <Text style={s.coverTagline}>Disfruta de tu experiencia sin contratiempos.</Text>
          <View style={s.coverDivider} />
          {(texts.intro || []).map((t, i) => (
            <Text key={i} style={s.coverNote}>{t}</Text>
          ))}
        </View>

        <View style={s.coverFoot}>
          <Text style={s.coverFootText}>www.caminosacro.com</Text>
          <Text style={s.coverFootText}>Respaldado por El Camino con Naty</Text>
        </View>
      </Page>

      {/* ============ ÍNDICE ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter />
        <Text style={s.eyebrow}>QUÉ HAY AQUÍ</Text>
        <Text style={s.h1}>Cuando lo necesites</Text>
        <Text style={s.entradilla}>
          Cada apartado te dice qué hacer, en qué orden, y a qué número llamar. Ve directo al
          que te haga falta.
        </Text>

        {secciones.map((sec, i) => (
          <View key={sec.clave} style={s.idxRow}>
            <Text style={s.idxNum}>{String(i + 1).padStart(2, "0")}</Text>
            <Text style={s.idxName}>{sec.titulo}</Text>
            <Text style={s.idxPhone}>{sec.telefonos?.[0]?.numero || ""}</Text>
          </View>
        ))}
      </Page>

      {/* ============ UNA PÁGINA POR APARTADO ============ */}
      {secciones.map((sec) => (
        <Page key={sec.clave} size="A4" style={s.page}>
          <PageHeader />
          <PageFooter />
          <Text style={s.eyebrow}>ASISTENCIA EN VIAJE</Text>
          <Text style={s.h1}>{sec.titulo}</Text>
          {sec.entradilla ? <Text style={s.entradilla}>{sec.entradilla}</Text> : null}

          {(sec.pasos || []).map((paso, i) => (
            <View key={i} style={s.step} wrap={false}>
              <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
              <Text style={s.stepText}>{paso}</Text>
            </View>
          ))}

          {sec.recuerda ? (
            <View style={s.recuerda}>
              <Text style={s.recuerdaTitle}>Recuerda</Text>
              <Text style={s.recuerdaText}>{sec.recuerda}</Text>
            </View>
          ) : null}

          {(sec.telefonos || []).length > 0 ? (
            <View style={s.phoneBox} wrap={false}>
              <Text style={s.phoneBoxTitle}>{(sec.telefonos_titulo || "TELÉFONOS").toUpperCase()}</Text>
              {sec.telefonos.map((t, i) => (
                <View key={i} style={s.phoneRow}>
                  <Text style={s.phoneName}>{t.nombre}</Text>
                  <Text style={s.phoneNumber}>{t.numero}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Page>
      ))}

      {/* ============ CIERRE ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter />
        <View style={s.closing}>
          <Text style={s.closingTitle}>¡Buen Camino!</Text>
          <Text style={s.closingText}>
            Guarda esta guía en tu teléfono y llévala contigo. Ojalá no tengas que abrirla,
            pero si la necesitas, aquí está todo lo que hay que saber.
          </Text>
          <Text style={s.closingText}>Camino Sacro · www.caminosacro.com</Text>
        </View>
      </Page>
    </Document>
  );
}
