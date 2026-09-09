import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * El Informe de Firmas: la hoja que convierte un PDF en prueba.
 *
 * Es la misma hoja que cierra los contratos de ZapSign —estado, número, fecha de creación,
 * huella SHA-256 del original, y por cada firmante su trazo, fecha y hora, token, correo,
 * teléfono, nivel de seguridad, IP, ubicación y dispositivo— con una cosa que allá no
 * existe y acá sí: la URL pública de verificación (/verificar). La auditoría B3 lo dijo
 * claro: la plataforma "produce la prueba de integridad y no tiene forma de usarla".
 *
 * Es una Página, no un Documento: va dentro del mismo PDF del contrato, al final. Un
 * informe en archivo aparte se separa del documento que acredita.
 *
 * Portado de El Camino con Naty (components/pdf/informe-firmas.tsx) con la estética de
 * Camino Sacro; las fuentes se registran en contractPdf.tsx, que es quien lo importa.
 */

const COLORS = {
  bosque: "#1a3a2a",
  dorado: "#b08d3f",
  crema: "#f7f5f0",
  taupe: "#e8e3d8",
  tinta: "#2a2520",
  grisTexto: "#5a5248",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 40, paddingBottom: 50, paddingHorizontal: 48,
    fontFamily: "Inter", fontSize: 8.2, lineHeight: 1.4, color: COLORS.tinta,
  },
  membrete: { textAlign: "center", marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: COLORS.dorado },
  marca: { fontFamily: "Times-Roman", fontSize: 16, letterSpacing: 4, color: COLORS.bosque, lineHeight: 1 },
  titulo: { fontFamily: "Times-Roman", fontSize: 13, color: COLORS.bosque, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 },
  zona: { fontSize: 6.8, color: COLORS.grisTexto, marginBottom: 12 },

  cinta: { backgroundColor: COLORS.crema, borderLeftWidth: 3, borderLeftColor: COLORS.dorado, padding: 10, borderRadius: 4, marginBottom: 12 },
  rotulo: { fontSize: 6.5, color: COLORS.dorado, textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 2 },
  estado: { fontWeight: 700, fontSize: 11, color: COLORS.bosque, marginBottom: 7 },
  fila: { flexDirection: "row", marginBottom: 3 },
  filaClave: { width: 120, color: COLORS.grisTexto },
  filaClaveCorta: { width: 74, color: COLORS.grisTexto },
  filaValor: { flex: 1 },
  /* La huella se parte en grupos de cuatro para que se pueda leer y dictar. */
  huella: { fontSize: 7.2, letterSpacing: 0.3 },

  seccion: {
    fontSize: 6.8, color: COLORS.dorado, textTransform: "uppercase", letterSpacing: 1.5,
    marginTop: 4, marginBottom: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.taupe, paddingBottom: 4,
  },

  firmante: { borderWidth: 0.5, borderColor: COLORS.taupe, borderRadius: 4, padding: 10, marginBottom: 10 },
  firmanteCabeza: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  firmanteNombre: { fontWeight: 700, fontSize: 9.5, color: COLORS.bosque },
  firmanteRol: { fontSize: 6.5, color: COLORS.dorado, textTransform: "uppercase", letterSpacing: 1.2 },
  trazo: { height: 36, width: 150, objectFit: "contain", objectPositionX: 0, marginBottom: 5 },
  trazoMecanico: { fontFamily: "Times-Italic", fontSize: 16, color: "#1a2a3a", marginBottom: 6 },
  cols: { flexDirection: "row" },
  col: { flex: 1, paddingRight: 10 },

  legal: { fontSize: 7.2, color: COLORS.grisTexto, lineHeight: 1.45, marginTop: 8, textAlign: "justify" },
  pie: {
    position: "absolute", bottom: 24, left: 48, right: 48, textAlign: "center",
    fontSize: 6.5, color: COLORS.dorado, letterSpacing: 0.8, borderTopWidth: 0.5, borderTopColor: COLORS.taupe, paddingTop: 6,
  },
});

export type FirmanteInforme = {
  rol: "camino_sacro" | "contratante";
  rolTexto: string;
  /** Identificador único de esta firma, como el "Token" de ZapSign. */
  token: string;
  nombre: string;
  documento: string;
  email: string;
  telefono: string | null;
  firmadoEn: string;
  ip: string | null;
  dispositivo: string | null;
  /** "lat, lon" reportada por el navegador, si el firmante la concedió. */
  ubicacion: string | null;
  /** Nivel de seguridad: cómo se comprobó que era quien decía ser. */
  metodo: string;
  /** Data URL del trazo del canvas; sin él va la firma mecánica en cursiva. */
  trazo?: string | null;
};

export type InformeFirmasProps = {
  /** Identificador del documento (el id del contrato). */
  numero: string;
  /** Título del documento y número de contrato, para la fila "Documento". */
  documento: string;
  creadoEn: string;
  /** Momento en que se selló el documento: la última firma. */
  actualizadoEn: string;
  /** SHA-256 del PDF antes de firmar, ya agrupado de a cuatro. */
  huellaOriginal: string;
  urlVerificacion: string;
  firmantes: FirmanteInforme[];
  paginas: number;
};

function Fila({ k, v, corta, mono }: { k: string; v: string; corta?: boolean; mono?: boolean }) {
  return (
    <View style={s.fila}>
      <Text style={corta ? s.filaClaveCorta : s.filaClave}>{k}</Text>
      <Text style={mono ? [s.filaValor, s.huella] : s.filaValor}>{v}</Text>
    </View>
  );
}

/** "NICOLÁS VILLA POSADA" → "Nicolás Villa Posada", para la firma mecánica en cursiva. */
function tituloCase(nombre: string): string {
  return nombre
    .toLocaleLowerCase("es-CO")
    .replace(/(^|\s)(\p{L})/gu, (_m, sep, letra) => sep + letra.toLocaleUpperCase("es-CO"));
}

export function PaginaInformeFirmas(p: InformeFirmasProps) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.membrete}>
        <Text style={s.marca}>CAMINO SACRO</Text>
      </View>
      <Text style={s.titulo}>Informe de Firmas</Text>
      <Text style={s.zona}>
        Fechas y horas en UTC-0500 (America/Bogota) · Última actualización: {p.actualizadoEn}
      </Text>

      <View style={s.cinta}>
        <Text style={s.rotulo}>Estado</Text>
        <Text style={s.estado}>Firmado</Text>
        <Fila k="Documento" v={p.documento} />
        <Fila k="Número" v={p.numero} />
        <Fila k="Fecha de creación" v={p.creadoEn} />
        <Fila k="Páginas" v={String(p.paginas)} />
        <Fila mono k="Huella del original" v={`SHA-256 ${p.huellaOriginal}`} />
      </View>

      <Text style={s.seccion}>
        Firmas · {p.firmantes.length} de {p.firmantes.length}
      </Text>

      {p.firmantes.map((f) => (
        <View key={f.rol} style={s.firmante} wrap={false}>
          <View style={s.firmanteCabeza}>
            <Text style={s.firmanteNombre}>{f.nombre}</Text>
            <Text style={s.firmanteRol}>{f.rolTexto}</Text>
          </View>
          {f.trazo ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf no acepta alt
            <Image style={s.trazo} src={f.trazo} />
          ) : (
            <Text style={s.trazoMecanico}>{tituloCase(f.nombre)}</Text>
          )}
          <View style={s.cols}>
            <View style={s.col}>
              <Fila corta k="Documento" v={f.documento} />
              <Fila corta k="Correo" v={f.email} />
              {f.telefono ? <Fila corta k="Teléfono" v={f.telefono} /> : null}
              <Fila corta k="Firmado el" v={f.firmadoEn} />
            </View>
            <View style={s.col}>
              <Fila corta k="Verificación" v={f.metodo} />
              {f.ip ? <Fila corta k="Dirección IP" v={f.ip} /> : null}
              {f.ubicacion ? <Fila corta k="Ubicación" v={`${f.ubicacion} (aprox., reportada por el dispositivo)`} /> : null}
            </View>
          </View>
          <Fila corta mono k="Token" v={f.token} />
          {f.dispositivo ? <Fila corta k="Dispositivo" v={f.dispositivo.slice(0, 160)} /> : null}
        </View>
      ))}

      <Text style={s.seccion}>Cumplimiento legal de la firma electrónica</Text>
      <Text style={s.legal}>
        Este documento fue firmado electrónicamente conforme a la Ley 527 de 1999 y al Decreto 2364 de 2012 de
        la República de Colombia. Los datos que aparecen arriba se capturaron en el momento de cada firma para
        acreditar la autoría y la integridad del documento. Cada firmante aceptó de forma expresa que este
        método constituye su firma y lo obliga en los mismos términos que una firma manuscrita.
        {"\n\n"}
        Para comprobar que el archivo que tiene en sus manos es exactamente el que se firmó, calcule su
        huella SHA-256 y péguela en {p.urlVerificacion}. Si el documento hubiera sido alterado en un solo
        carácter, la huella sería distinta. (La huella del documento firmado no puede ir impresa dentro de
        él mismo: calcularla sobre el archivo terminado y luego escribirla dentro lo cambiaría.)
        {"\n\n"}
        Este registro es parte integral del documento número {p.numero}.
      </Text>

      <Text style={s.pie} fixed>
        CAMINO SACRO · reservas@caminosacro.com · Informe de firmas del documento {p.numero}
      </Text>
    </Page>
  );
}
