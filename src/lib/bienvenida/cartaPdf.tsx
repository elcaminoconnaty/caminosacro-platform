/**
 * La carta de bienvenida en PDF, generada para UNA cotización.
 *
 * Reproduce las cartas que se hacían a mano por ruta ("Carta de Bienvenida/" en la
 * carpeta de la Plataforma Comercial): misma foto de portada, mismas cuatro páginas, mismas
 * medidas, colores y textos. Las medidas vienen de leer esos PDF, por eso los números son
 * tan concretos (margen de 74 pt, filas de 21 pt, cabecera de 57 pt…).
 *
 * Lo único que cambia de una carta a otra es la ruta: título, párrafo, cifras e itinerario,
 * que salen del itinerario de la cotización (ver @/lib/bienvenida/render). Los textos fijos
 * (portada, próximos pasos, tips, contacto) se editan en Configuración.
 *
 * Tipografía: las originales usaban Caladea para los títulos y Liberation Sans para el
 * texto. Caladea ya vive en src/lib/fonts; en lugar de Liberation Sans va Helvetica, que
 * tiene exactamente las mismas métricas. La flecha de las etapas no existe en Helvetica,
 * así que se dibuja con Inter (la registra @/lib/pdfChrome al importarse).
 */
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import path from "node:path";
import { C, SANS as INTER } from "@/lib/pdfChrome";
import type { TextosCarta } from "@/lib/bienvenida/textos";

Font.register({
  family: "Caladea",
  fonts: [
    { src: path.join(process.cwd(), "src/lib/fonts/Caladea-Regular.ttf"), fontWeight: 400 },
    { src: path.join(process.cwd(), "src/lib/fonts/Caladea-Bold.ttf"), fontWeight: 700 },
  ],
});

const SERIF = "Caladea";
const SANS = "Helvetica";
// Las variantes de Helvetica se piden por peso y estilo: como nombre de familia
// ("Helvetica-Bold") @react-pdf las ignora y pinta la regular.
const BOLD = { fontFamily: SANS, fontWeight: 700 } as const;
const ITALIC = { fontFamily: SANS, fontStyle: "italic" } as const;
const GRIS_TEXTO = "#555555";
const X = 74; // margen lateral de las cartas originales

export type FilaCarta = { dia: number; etapa: string; distancia: string };

export type CartaBienvenidaProps = {
  titulo: string;
  intro: string;
  /** "8 días · 7 noches · 6 etapas · 112 km · A pie · Dificultad media" */
  cifras: string;
  itinerario: FilaCarta[];
  /** Los textos fijos de la carta, los de Configuración (ver @/lib/bienvenida/textos). */
  textos: TextosCarta;
  portada?: Buffer;
};

const s = StyleSheet.create({
  // ===== Portada =====
  portada: { position: "relative", padding: 0, backgroundColor: C.verde, fontFamily: SANS },
  // Como en la original, la foto sube 70 pt y se sale por arriba. Va con `fixed`: sin eso
  // @react-pdf ve una imagen más alta que la página y la manda sola a una hoja aparte.
  foto: { position: "absolute", top: -70, left: 0, width: 595, height: 893 },
  velo: { position: "absolute", top: 0, left: 0, width: 595, height: 674, backgroundColor: "rgba(26, 59, 41, 0.25)" },
  franjaSup: { position: "absolute", top: 0, left: 0, width: 595, height: 130, backgroundColor: "rgba(15, 36, 26, 0.6)" },
  bloqueInf: { position: "absolute", bottom: 0, left: 0, width: 595, height: 168, backgroundColor: C.verde },
  cabPortada: {
    position: "absolute", top: 51, left: X, right: X,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
  },
  marcaPortada: { fontFamily: SERIF, fontWeight: 700, fontSize: 13, color: C.white },
  subPortada: { fontSize: 7.5, color: "rgba(255,255,255,0.75)", marginTop: 8 },
  webPortada: { fontSize: 7, color: C.oro, marginTop: 8 },
  respaldo: { alignItems: "flex-end" },
  respaldoTit: { fontSize: 7.5, color: "rgba(255,255,255,0.7)", marginTop: 6, letterSpacing: 0.5 },
  respaldoNom: { fontSize: 8, color: C.white, marginTop: 7, letterSpacing: 0.5 },
  bienvenida: { position: "absolute", top: 680, left: X, right: X },
  eyebrowPortada: { fontSize: 9, color: C.oro },
  tituloPortada: { fontFamily: SERIF, fontSize: 34, color: C.white, marginTop: 2 },
  textoPortada: { width: 345, fontSize: 10, color: "rgba(255,255,255,0.75)", lineHeight: 1.3, marginTop: 8 },
  numPortada: { position: "absolute", bottom: 32, right: X, fontSize: 7, color: "rgba(255,255,255,0.5)" },

  // ===== Páginas interiores =====
  pagina: { fontFamily: SANS, fontSize: 10.5, color: GRIS_TEXTO, paddingTop: 86, paddingBottom: 60, paddingHorizontal: X },
  cabecera: {
    position: "absolute", top: 0, left: 0, right: 0, height: 57, backgroundColor: C.verde,
    paddingHorizontal: X, paddingTop: 29, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
  },
  cabMarca: { fontFamily: SERIF, fontWeight: 700, fontSize: 11, color: C.white },
  cabSub: { fontSize: 7, color: "rgba(255,255,255,0.7)", marginTop: 6 },
  cabWeb: { fontSize: 7, color: C.oro, marginTop: 5 },
  pie: {
    position: "absolute", bottom: 30, left: X, right: X, flexDirection: "row", justifyContent: "space-between",
    paddingTop: 5, borderTopWidth: 0.3, borderTopColor: C.borde,
  },
  pieTxt: { fontSize: 7, color: GRIS_TEXTO },

  eyebrow: { fontSize: 10, color: C.oroH, marginBottom: 2 },
  titulo: { fontFamily: SERIF, fontSize: 26, color: C.verde, marginBottom: 20 },
  parrafo: { fontSize: 10.5, color: GRIS_TEXTO, lineHeight: 1.43, textAlign: "justify" },
  cifras: {
    marginTop: 20, backgroundColor: C.gris, borderRadius: 5, paddingVertical: 7,
    ...BOLD, fontSize: 10, color: C.verde, textAlign: "center",
  },
  h2: { fontFamily: SERIF, fontSize: 20, color: C.verde, marginTop: 10, marginBottom: 14 },

  tablaCab: { flexDirection: "row", paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: C.verde },
  th: { ...BOLD, fontSize: 10, color: C.txt },
  fila: { flexDirection: "row", alignItems: "center", height: 21, borderBottomWidth: 0.3, borderBottomColor: C.borde },
  colDia: { width: 39, paddingLeft: 2 },
  colEtapa: { flex: 1 },
  colDist: { width: 90, textAlign: "right" },
  dia: { ...BOLD, fontSize: 11, color: C.oroH },
  etapa: { fontSize: 11, color: C.txt },
  flecha: { fontFamily: INTER, fontSize: 10 },
  dist: { fontSize: 10, color: GRIS_TEXTO, textAlign: "right" },

  pasos: { fontSize: 10, color: C.oroH, marginTop: 26, marginBottom: 14 },
  pasoTit: { ...BOLD, fontSize: 12, color: C.verde, marginBottom: 14 },
  pasoTxt: { fontSize: 10.5, color: GRIS_TEXTO, lineHeight: 1.43, textAlign: "justify", marginBottom: 4 },

  tipsTit: { fontFamily: SERIF, fontSize: 20, color: C.verde, marginTop: -6, marginBottom: 18 },
  tipsGrupo: { ...BOLD, fontSize: 12, color: C.verde, marginTop: 4, marginBottom: 16 },
  tip: { fontSize: 10.5, color: GRIS_TEXTO, lineHeight: 1.43, textAlign: "justify", marginBottom: 6 },

  separador: { marginTop: 22, borderTopWidth: 0.3, borderTopColor: C.borde, paddingTop: 14 },
  dudas: { fontSize: 10, color: C.oroH, marginBottom: 10 },
  dudasTxt: { fontSize: 11, color: GRIS_TEXTO, marginBottom: 6 },
  whatsapp: { ...BOLD, fontSize: 11, color: C.verde, marginBottom: 4 },
  web: { fontSize: 11, color: C.verde },
  buenCamino: { fontFamily: SERIF, fontSize: 22, color: C.verde, marginTop: 16, marginBottom: 8 },
  firma: { fontSize: 11, color: GRIS_TEXTO, marginBottom: 3 },
  firmaSub: { ...ITALIC, fontSize: 10, color: GRIS_TEXTO },
});

function Cabecera() {
  return (
    <View style={s.cabecera} fixed>
      <View>
        <Text style={s.cabMarca}>Camino Sacro</Text>
        <Text style={s.cabSub}>Agencia del Camino de Santiago</Text>
      </View>
      <Text style={s.cabWeb}>www.caminosacro.com</Text>
    </View>
  );
}

function Pie() {
  return (
    <View style={s.pie} fixed>
      <Text style={s.pieTxt}>Camino Sacro · Agencia del Camino de Santiago</Text>
      <Text style={s.pieTxt} render={({ pageNumber }) => String(pageNumber)} />
    </View>
  );
}

/** "Sarria → Portomarín": la flecha va en Inter porque Helvetica no la trae. */
function Etapa({ texto }: { texto: string }) {
  const partes = texto.split(" → ");
  return (
    <Text style={s.etapa}>
      {partes.map((p, i) => (
        <Text key={i}>
          {i > 0 ? <Text style={s.flecha}>{" → "}</Text> : null}
          {p}
        </Text>
      ))}
    </Text>
  );
}

export function CartaBienvenidaPDF({ titulo, intro, cifras, itinerario, textos, portada }: CartaBienvenidaProps) {
  return (
    <Document author="Camino Sacro" title={`Bienvenida — ${titulo}`}>
      {/* ============ Portada ============ */}
      <Page size="A4" style={s.portada}>
        {portada ? <Image src={portada as unknown as string} style={s.foto} fixed /> : null}
        <View style={s.velo} />
        <View style={s.franjaSup} />
        <View style={s.bloqueInf} />

        <View style={s.cabPortada}>
          <View>
            <Text style={s.marcaPortada}>Camino Sacro</Text>
            <Text style={s.subPortada}>Agencia del Camino de Santiago</Text>
            <Text style={s.webPortada}>www.caminosacro.com</Text>
          </View>
          <View style={s.respaldo}>
            <Text style={s.respaldoTit}>RESPALDADO POR</Text>
            <Text style={s.respaldoNom}>EL CAMINO CON NATY</Text>
            <Text style={s.webPortada}>www.elcaminoconnaty.com</Text>
          </View>
        </View>

        <View style={s.bienvenida}>
          <Text style={s.eyebrowPortada}>CARTA DE BIENVENIDA</Text>
          <Text style={s.tituloPortada}>¡Bienvenido/a al Camino!</Text>
          <Text style={s.textoPortada}>{textos.portada}</Text>
        </View>
        <Text style={s.numPortada}>1</Text>
      </Page>

      {/* ============ Tu ruta + próximos pasos ============ */}
      <Page size="A4" style={s.pagina}>
        <Cabecera />
        <Pie />

        <Text style={s.eyebrow}>TU RUTA</Text>
        <Text style={s.titulo}>{titulo}</Text>
        <Text style={s.parrafo}>{intro}</Text>
        <Text style={s.cifras}>{cifras}</Text>

        <Text style={s.h2}>Itinerario</Text>
        <View style={s.tablaCab}>
          <Text style={[s.th, s.colDia, { paddingLeft: 0 }]}>DÍA</Text>
          <Text style={[s.th, s.colEtapa]}>ETAPA</Text>
          <Text style={[s.th, s.colDist]}>DISTANCIA</Text>
        </View>
        {itinerario.map((f) => (
          <View key={f.dia} style={s.fila} wrap={false}>
            <View style={s.colDia}><Text style={s.dia}>{f.dia}</Text></View>
            <View style={s.colEtapa}><Etapa texto={f.etapa} /></View>
            <View style={s.colDist}><Text style={s.dist}>{f.distancia}</Text></View>
          </View>
        ))}

        <Text style={s.pasos}>PRÓXIMOS PASOS</Text>
        {textos.pasos.map((p, i) => (
          <View key={i} wrap={false}>
            <Text style={s.pasoTit}>{p.titulo}</Text>
            <Text style={s.pasoTxt}>{p.texto}</Text>
          </View>
        ))}
      </Page>

      {/* ============ Tips ============ */}
      <Page size="A4" style={s.pagina}>
        <Cabecera />
        <Pie />
        <Text style={s.tipsTit}>Tips para preparar tu Camino</Text>
        {textos.tips.map((g, i) => (
          <View key={i}>
            <Text style={s.tipsGrupo}>{g.titulo}</Text>
            {g.items.map((t, k) => (
              <Text key={k} style={s.tip}>{`·  ${t}`}</Text>
            ))}
          </View>
        ))}
      </Page>

      {/* ============ Dudas y despedida ============ */}
      <Page size="A4" style={s.pagina}>
        <Cabecera />
        <Pie />
        <View style={s.separador}>
          <Text style={s.dudas}>¿DUDAS?</Text>
          <Text style={s.dudasTxt}>{textos.contacto.texto}</Text>
          <Text style={s.whatsapp}>{`WhatsApp: ${textos.contacto.whatsapp}`}</Text>
          <Text style={s.web}>{`Web: ${textos.contacto.web}`}</Text>
          <Text style={s.buenCamino}>¡Buen Camino!</Text>
          <Text style={s.firma}>{textos.firma.nombres}</Text>
          <Text style={s.firmaSub}>{textos.firma.sub}</Text>
        </View>
      </Page>
    </Document>
  );
}
