/**
 * Documento de Viaje: lo que el peregrino se lleva al Camino.
 *
 * Calca la estructura del documento que nos manda Pilgrim (expediente A47397, en
 * "Documentación de Viaje/"): portada, índice, una ficha por noche con las fotos del
 * alojamiento, los servicios incluidos con su procedimiento completo, las condiciones y
 * el contacto. La forma es la de Pilgrim porque funciona y el viajero ya la reconoce;
 * la marca, los colores y —sobre todo— los números de las condiciones son nuestros.
 *
 * Nada de lo que sale acá se escribe en este archivo:
 *   · el hotel (nombre, dirección, contactos, fotos, observaciones fijas) → comercial.hotels
 *   · la noche (fecha, etapa, km, habitación, régimen, observación puntual) → comercial.quote_hotels
 *   · servicios, condiciones y contacto → comercial.settings, clave `travel_doc`
 * Este componente solo los dibuja.
 */
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { C, SERIF, SERIF_BOLD, SANS, SANS_BOLD, PageHeader, PageFooter } from "@/lib/pdfChrome";

export type TravelDocQuote = {
  code: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  route_name: string | null;
  start_date: string | null;
  end_date: string | null;
  people: number | null;
  modality: string | null;
};

/** Una noche del viaje, ya resuelta: el hotel del catálogo fundido con los datos de la noche. */
export type TravelNight = {
  day: number | null;
  night_date: string | null;
  stage_label: string | null;
  km: number | null;
  city: string | null;
  hotel_name: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  room_label: string | null;
  regimen: string | null;
  /** Observaciones fijas del alojamiento (comercial.hotels.notes). */
  hotel_notes: string | null;
  /** Observación puntual de esta noche (comercial.quote_hotels.notes). */
  night_notes: string | null;
  /** Hasta tres, ya descargadas por el orquestador. */
  photos: Buffer[];
};

export type ServicioTexto = {
  clave: string;
  titulo: string;
  resumen?: string | null;
  parrafos?: string[];
  vinetas?: string[];
  cierre?: string[];
};

export type CondicionTexto = {
  titulo: string;
  parrafos?: string[];
  vinetas?: string[];
  cierre?: string[];
};

export type TravelDocTexts = {
  contacto: {
    /** Teléfono de la agencia en España: el que se marca DURANTE el viaje. Es el que sale
     *  en la última página del documento y en la caja de emergencias. */
    telefono?: string;
    telefono_nota?: string;
    /** WhatsApp de Camino Sacro en Colombia: el del correo, que el cliente lee ANTES de
     *  viajar y desde su casa. No sale en el documento. */
    whatsapp?: string;
    email?: string;
    email_nota?: string;
    emergencias?: string;
    emergencias_nota?: string;
    web?: string;
  };
  servicios: ServicioTexto[];
  importante?: string;
  condiciones: CondicionTexto[];
};

export type TravelDocProps = {
  quote: TravelDocQuote;
  nights: TravelNight[];
  texts: TravelDocTexts;
  /** Claves de `texts.servicios` que lleva este viaje, en orden. */
  services: string[];
  coverImage?: Buffer;
  generatedAt?: Date;
};

const MES_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function iso(d: string | null): Date | null {
  if (!d) return null;
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function fechaLarga(d: string | null): string {
  const dt = iso(d);
  return dt ? `${dt.getDate()} de ${MES_LARGO[dt.getMonth()]} de ${dt.getFullYear()}` : "—";
}

function ddmmyyyy(d: string | null): string {
  const dt = iso(d);
  if (!dt) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

/** Rango de portada: "24 de septiembre — 30 de septiembre de 2026". */
function rangoFechas(a: string | null, b: string | null): string {
  const da = iso(a);
  const db = iso(b);
  if (!da) return "";
  if (!db) return fechaLarga(a);
  const mismoAnio = da.getFullYear() === db.getFullYear();
  const izq = mismoAnio
    ? `${da.getDate()} de ${MES_LARGO[da.getMonth()]}`
    : fechaLarga(a);
  return `${izq} — ${fechaLarga(b)}`;
}

/** "Sarria - Santiago de Compostela" a partir del nombre de la ruta, si lo trae. */
function subtituloRuta(routeName: string | null): string {
  if (!routeName) return "CAMINO DE SANTIAGO";
  return routeName.toUpperCase();
}

const s = StyleSheet.create({
  page: { fontFamily: SANS, fontSize: 9.5, color: C.txt, paddingTop: 70, paddingBottom: 44, paddingHorizontal: 32 },

  // ===== PORTADA =====
  coverPage: { position: "relative", padding: 0, backgroundColor: C.verde, fontFamily: SANS },
  coverImg: { position: "absolute", top: 0, left: 0, width: "100%", height: "70%", objectFit: "cover" },
  coverImgTint: { position: "absolute", top: 0, left: 0, width: "100%", height: "70%", backgroundColor: "rgba(26, 58, 42, 0.25)" },
  coverTopTint: { position: "absolute", top: 0, left: 0, width: "100%", height: 130, backgroundColor: "rgba(15, 35, 25, 0.6)" },
  coverGreenBlock: { position: "absolute", bottom: 0, left: 0, width: "100%", height: "30%", backgroundColor: C.verde },
  coverTopHeader: { position: "absolute", top: 32, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between" },
  coverLeft: { flexDirection: "column" },
  coverBrand: { fontFamily: SERIF_BOLD, fontSize: 13, color: C.white },
  coverBrandSub: { fontFamily: SANS, fontSize: 7.5, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  coverBrandLink: { fontFamily: SANS, fontSize: 7, color: C.oro, marginTop: 3 },
  coverRight: { alignItems: "flex-end" },
  coverRespaldo: { fontFamily: SANS, fontSize: 7.5, color: "rgba(255,255,255,0.7)", letterSpacing: 1 },
  coverRespaldoName: { fontFamily: SANS, fontSize: 8, color: "rgba(255,255,255,0.95)", marginTop: 4, letterSpacing: 0.5 },
  coverContent: { position: "absolute", left: 32, right: 32, bottom: 50 },
  coverEyebrow: { fontFamily: SANS, fontSize: 7, color: C.oro, letterSpacing: 3, marginBottom: 10 },
  coverSubtitle: { fontFamily: SANS, fontSize: 8, color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, marginBottom: 8 },
  coverTitle: { fontFamily: SERIF, fontSize: 30, color: C.white, lineHeight: 1.15, marginBottom: 14 },
  coverDate: { fontFamily: SANS, fontSize: 11, color: C.oro, marginBottom: 14 },
  coverDivider: { width: 60, height: 0.5, backgroundColor: "rgba(255,255,255,0.3)", marginBottom: 14 },
  coverInfoRow: { flexDirection: "row" },
  coverInfoCol: { flex: 1 },
  coverInfoLabel: { fontFamily: SANS, fontSize: 7, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, marginBottom: 4 },
  coverInfoValue: { fontFamily: SERIF_BOLD, fontSize: 13, color: C.white },
  coverInfoSub: { fontFamily: SANS, fontSize: 8, color: "rgba(255,255,255,0.55)", marginTop: 3 },

  // ===== ÍNDICE =====
  indexTitle: { fontFamily: SERIF, fontSize: 24, color: C.verde, marginBottom: 4 },
  indexSub: { fontFamily: SANS, fontSize: 8.5, color: C.sec, marginBottom: 24 },
  indexGrid: { flexDirection: "row", flexWrap: "wrap" },
  indexCell: { width: "50%", paddingRight: 12, marginBottom: 18 },
  indexBox: { backgroundColor: C.gris, borderLeftWidth: 3, borderLeftColor: C.oro, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 3, height: 108 },
  indexNum: { fontFamily: SERIF_BOLD, fontSize: 18, color: C.oroH, marginBottom: 4 },
  indexName: { fontFamily: SANS_BOLD, fontSize: 10, color: C.verde, marginBottom: 5 },
  indexDesc: { fontFamily: SANS, fontSize: 8, color: C.sec, lineHeight: 1.45 },

  // ===== CABECERA DE DATOS =====
  clientBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  clientCol: { alignItems: "flex-end" },
  clientLine: { fontFamily: SANS, fontSize: 7.5, color: C.sec },
  eyebrow: { fontFamily: SANS, fontSize: 7.5, color: C.oroH, letterSpacing: 2, marginBottom: 4 },
  h1: { fontFamily: SERIF, fontSize: 22, color: C.verde, lineHeight: 1.2, marginBottom: 14 },
  h2: { fontFamily: SERIF, fontSize: 15, color: C.verde, marginBottom: 10, marginTop: 4 },

  // Tira de datos del viaje (Fechas / Régimen / Habitación / Alojamiento)
  factsRow: { flexDirection: "row", borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.borde, paddingVertical: 10, marginBottom: 18 },
  factCell: { flex: 1, paddingRight: 8 },
  factLabel: { fontFamily: SANS_BOLD, fontSize: 7.5, color: C.verdeM, letterSpacing: 0.5, marginBottom: 3 },
  factValue: { fontFamily: SANS, fontSize: 8.5, color: C.txt, lineHeight: 1.35 },

  sectionLabel: { fontFamily: SANS_BOLD, fontSize: 9, color: C.verde, letterSpacing: 1, marginBottom: 2 },
  dottedRule: { borderBottomWidth: 0.5, borderBottomColor: C.borde, marginBottom: 14 },

  // ===== NOCHE =====
  night: { flexDirection: "row", marginBottom: 20 },
  // `alignSelf: "flex-start"` o el chip se estira a lo alto de toda la ficha: en un flex
  // row el hijo por defecto ocupa el alto del más alto, que acá son las fotos.
  dateChip: { width: 40, alignSelf: "flex-start", backgroundColor: C.verde, borderRadius: 3, paddingVertical: 6, alignItems: "center", marginRight: 12 },
  dateChipMonth: { fontFamily: SANS, fontSize: 7, color: C.oro, letterSpacing: 0.5 },
  dateChipDay: { fontFamily: SERIF_BOLD, fontSize: 16, color: C.white, marginTop: 1 },
  nightBody: { flex: 1 },
  nightDay: { fontFamily: SANS_BOLD, fontSize: 7.5, color: C.oroH, letterSpacing: 1.5 },
  nightStageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 1 },
  nightStage: { fontFamily: SERIF, fontSize: 15, color: C.txt, flex: 1, paddingRight: 8 },
  nightKm: { fontFamily: SANS_BOLD, fontSize: 9, color: C.verdeM },
  nightRule: { borderBottomWidth: 0.5, borderBottomColor: C.borde, marginTop: 5, marginBottom: 7 },
  nightCity: { fontFamily: SANS, fontSize: 7.5, color: C.sec, letterSpacing: 0.5 },
  nightHotel: { fontFamily: SERIF_BOLD, fontSize: 13, color: C.verde, marginTop: 1 },
  addressPill: { backgroundColor: C.greenL, borderRadius: 2, paddingVertical: 4, paddingHorizontal: 8, marginTop: 5 },
  addressText: { fontFamily: SANS, fontSize: 8, color: C.verde },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  metaItem: { fontFamily: SANS, fontSize: 8, color: C.txt, marginRight: 14, marginBottom: 2 },
  metaLabel: { fontFamily: SANS_BOLD, fontSize: 8, color: C.verdeM },
  photoRow: { flexDirection: "row", marginTop: 8 },
  photo: { flex: 1, height: 72, objectFit: "cover", borderRadius: 2, marginRight: 6 },
  photoLast: { flex: 1, height: 72, objectFit: "cover", borderRadius: 2 },
  obsBox: { marginTop: 8, borderWidth: 0.5, borderColor: C.borde, borderRadius: 3, overflow: "hidden" },
  obsHead: { backgroundColor: C.gris, paddingVertical: 3, paddingHorizontal: 8 },
  obsHeadText: { fontFamily: SANS_BOLD, fontSize: 7.5, color: C.verde, letterSpacing: 0.5 },
  obsBody: { paddingVertical: 6, paddingHorizontal: 8 },
  obsText: { fontFamily: SANS, fontSize: 8, color: C.txt, lineHeight: 1.45 },
  obsTextNight: { fontFamily: SANS, fontSize: 8, color: C.amberT, lineHeight: 1.45, marginTop: 4 },

  // ===== SERVICIOS =====
  chipRow: { flexDirection: "row", marginBottom: 16 },
  chip: { flex: 1, backgroundColor: C.gris, borderRadius: 3, paddingVertical: 10, alignItems: "center", marginRight: 8 },
  chipLast: { flex: 1, backgroundColor: C.gris, borderRadius: 3, paddingVertical: 10, alignItems: "center" },
  chipValue: { fontFamily: SERIF_BOLD, fontSize: 16, color: C.verde },
  chipLabel: { fontFamily: SANS, fontSize: 7.5, color: C.sec, marginTop: 2 },
  svc: { marginBottom: 16 },
  svcTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  svcBullet: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.oroH, marginRight: 6 },
  svcTitle: { fontFamily: SANS_BOLD, fontSize: 10.5, color: C.verde },
  svcResumen: { fontFamily: SANS, fontSize: 8.5, color: C.txt, lineHeight: 1.45, marginBottom: 5, fontStyle: "italic" },
  svcBox: { borderLeftWidth: 2, borderLeftColor: C.borde, paddingLeft: 10 },
  p: { fontFamily: SANS, fontSize: 8.5, color: C.txt, lineHeight: 1.5, marginBottom: 5 },
  pHead: { fontFamily: SANS_BOLD, fontSize: 8.5, color: C.verde, lineHeight: 1.5, marginBottom: 4, marginTop: 3, letterSpacing: 0.3 },
  liRow: { flexDirection: "row", marginBottom: 4 },
  liDot: { fontFamily: SANS, fontSize: 8.5, color: C.oroH, width: 12 },
  liNum: { fontFamily: SANS_BOLD, fontSize: 8.5, color: C.oroH, width: 12 },
  liText: { fontFamily: SANS, fontSize: 8.5, color: C.txt, lineHeight: 1.5, flex: 1 },
  callout: { backgroundColor: C.amberL, borderLeftWidth: 3, borderLeftColor: C.oro, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 2, marginTop: 8, marginBottom: 4 },
  calloutTitle: { fontFamily: SANS_BOLD, fontSize: 8.5, color: C.amberT, marginBottom: 3 },
  calloutText: { fontFamily: SANS, fontSize: 8.5, color: C.amberT, lineHeight: 1.45 },

  // ===== CONDICIONES =====
  condTitle: { fontFamily: SANS_BOLD, fontSize: 9.5, color: C.verde, letterSpacing: 0.8, marginBottom: 5, marginTop: 10 },
  condText: { fontFamily: SANS, fontSize: 8, color: C.txt, lineHeight: 1.5, marginBottom: 4 },

  // ===== CONTACTO =====
  contactRow: { flexDirection: "row", marginTop: 6 },
  contactBox: { flex: 1, backgroundColor: C.gris, borderRadius: 3, padding: 12, marginRight: 8 },
  contactBoxLast: { flex: 1, backgroundColor: C.verde, borderRadius: 3, padding: 12 },
  contactLabel: { fontFamily: SANS, fontSize: 7, color: C.sec, letterSpacing: 1.5, marginBottom: 4 },
  contactLabelInv: { fontFamily: SANS, fontSize: 7, color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, marginBottom: 4 },
  contactValue: { fontFamily: SERIF_BOLD, fontSize: 13, color: C.verde },
  // El correo es la cadena más larga de la fila y a 13 pt no cabe: react-pdf lo partía
  // con guion en medio de la palabra ("reser-vas@caminosacro.com"), que en una dirección
  // de correo se lee como si el guion fuera parte de ella.
  contactValueEmail: { fontFamily: SERIF_BOLD, fontSize: 10.5, color: C.verde },
  contactValueInv: { fontFamily: SERIF_BOLD, fontSize: 13, color: C.white },
  contactNote: { fontFamily: SANS, fontSize: 7.5, color: C.sec, lineHeight: 1.4, marginTop: 5 },
  contactNoteInv: { fontFamily: SANS, fontSize: 7.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.4, marginTop: 5 },
  closing: { marginTop: 22, alignItems: "center" },
  closingTitle: { fontFamily: SERIF, fontSize: 20, color: C.verde },
  closingText: { fontFamily: SANS, fontSize: 8.5, color: C.sec, marginTop: 5, textAlign: "center", lineHeight: 1.5 },
  genStamp: { fontFamily: SANS, fontSize: 7, color: C.sec, marginTop: 18, textAlign: "center" },
});

/** Un párrafo que empieza en MAYÚSCULAS y no termina en punto es un subtítulo del bloque. */
function esSubtitulo(t: string): boolean {
  const limpio = t.trim();
  if (limpio.length === 0 || limpio.length > 70) return false;
  return limpio === limpio.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(limpio);
}

function Parrafos({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <>
      {items.map((t, i) => (
        <Text key={i} style={esSubtitulo(t) ? s.pHead : s.p}>{t}</Text>
      ))}
    </>
  );
}

function Lista({ items, numerada }: { items?: string[]; numerada?: boolean }) {
  if (!items?.length) return null;
  return (
    <>
      {items.map((t, i) => (
        <View key={i} style={s.liRow}>
          <Text style={numerada ? s.liNum : s.liDot}>{numerada ? `${i + 1}.` : "•"}</Text>
          <Text style={s.liText}>{t}</Text>
        </View>
      ))}
    </>
  );
}

function Noche({ n }: { n: TravelNight }) {
  const dt = iso(n.night_date);
  const fotos = n.photos.slice(0, 3);
  const contacto = [n.phone, n.email].filter(Boolean).join("   ");
  const estancia = [n.room_label, n.regimen].filter(Boolean).join("   ·   ");
  // `wrap={false}`: una noche partida entre dos páginas deja las fotos huérfanas de su
  // hotel, que es justo el error que hace dudar al viajero de dónde duerme.
  return (
    <View style={s.night} wrap={false}>
      <View style={s.dateChip}>
        <Text style={s.dateChipMonth}>{dt ? MES_ABBR[dt.getMonth()] : "—"}</Text>
        <Text style={s.dateChipDay}>{dt ? String(dt.getDate()).padStart(2, "0") : "—"}</Text>
      </View>
      <View style={s.nightBody}>
        <Text style={s.nightDay}>{n.day ? `DÍA ${n.day}` : "NOCHE"}</Text>
        <View style={s.nightStageRow}>
          <Text style={s.nightStage}>{n.stage_label || n.city || "—"}</Text>
          {n.km != null && n.km > 0 ? <Text style={s.nightKm}>{`${n.km} km`}</Text> : null}
        </View>
        <View style={s.nightRule} />

        {n.city ? <Text style={s.nightCity}>{n.city}</Text> : null}
        <Text style={s.nightHotel}>{n.hotel_name || "Alojamiento por confirmar"}</Text>
        {n.address ? (
          <View style={s.addressPill}><Text style={s.addressText}>{n.address}</Text></View>
        ) : null}

        {(estancia || contacto) ? (
          <View style={s.metaRow}>
            {estancia ? <Text style={s.metaItem}>{estancia}</Text> : null}
            {contacto ? <Text style={s.metaItem}>{contacto}</Text> : null}
          </View>
        ) : null}

        {fotos.length > 0 ? (
          <View style={s.photoRow}>
            {fotos.map((buf, i) => (
              <Image
                key={i}
                src={buf as unknown as string}
                style={i === fotos.length - 1 ? s.photoLast : s.photo}
              />
            ))}
          </View>
        ) : null}

        {(n.hotel_notes || n.night_notes) ? (
          <View style={s.obsBox}>
            <View style={s.obsHead}><Text style={s.obsHeadText}>Observaciones</Text></View>
            <View style={s.obsBody}>
              {n.hotel_notes ? <Text style={s.obsText}>{n.hotel_notes}</Text> : null}
              {n.night_notes ? <Text style={s.obsTextNight}>{n.night_notes}</Text> : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function TravelDocPDF({ quote, nights, texts, services, coverImage, generatedAt = new Date() }: TravelDocProps) {
  const anio = iso(quote.start_date)?.getFullYear() ?? new Date().getFullYear();
  const noches = nights.length;
  // El orden lo manda `services`; el contenido, `texts.servicios`. Si una clave no tiene
  // texto se ignora en silencio: es una clave vieja, no un error que deba tumbar el PDF.
  const bloques = services
    .map((clave) => texts.servicios.find((x) => x.clave === clave))
    .filter((x): x is ServicioTexto => !!x);
  const cont = texts.contacto || {};

  return (
    <Document
      author="Camino Sacro"
      title={`Documentación de viaje ${quote.code}`}
      subject={quote.route_name || "Camino de Santiago"}
    >
      {/* ============ PORTADA ============ */}
      <Page size="A4" style={s.coverPage}>
        {coverImage ? <Image src={coverImage as unknown as string} style={s.coverImg} /> : null}
        <View style={s.coverImgTint} />
        <View style={s.coverTopTint} />
        <View style={s.coverGreenBlock} />

        <View style={s.coverTopHeader}>
          <View style={s.coverLeft}>
            <Text style={s.coverBrand}>Camino Sacro</Text>
            <Text style={s.coverBrandSub}>Agencia del Camino de Santiago</Text>
            <Text style={s.coverBrandLink}>{cont.web || "www.caminosacro.com"}</Text>
          </View>
          <View style={s.coverRight}>
            <Text style={s.coverRespaldo}>RESPALDADO POR</Text>
            <Text style={s.coverRespaldoName}>EL CAMINO CON NATY</Text>
            <Text style={s.coverBrandLink}>www.elcaminoconnaty.com</Text>
          </View>
        </View>

        <View style={s.coverContent}>
          <Text style={s.coverEyebrow}>{`DOCUMENTACIÓN DE VIAJE · ${anio}`}</Text>
          <Text style={s.coverSubtitle}>{subtituloRuta(quote.route_name)}</Text>
          <Text style={s.coverTitle}>{quote.route_name || "Camino de Santiago"}</Text>
          {rangoFechas(quote.start_date, quote.end_date) ? (
            <Text style={s.coverDate}>{rangoFechas(quote.start_date, quote.end_date)}</Text>
          ) : null}
          <View style={s.coverDivider} />
          <View style={s.coverInfoRow}>
            <View style={s.coverInfoCol}>
              <Text style={s.coverInfoLabel}>PEREGRINO</Text>
              <Text style={s.coverInfoValue}>{quote.client_name || "—"}</Text>
              {quote.client_phone ? <Text style={s.coverInfoSub}>{quote.client_phone}</Text> : null}
            </View>
            <View style={s.coverInfoCol}>
              <Text style={s.coverInfoLabel}>RESERVA</Text>
              <Text style={s.coverInfoValue}>{quote.code}</Text>
              <Text style={s.coverInfoSub}>{`${noches} ${noches === 1 ? "noche" : "noches"}`}</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ============ ÍNDICE ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter referencia={quote.code} />
        <Text style={s.eyebrow}>ÍNDICE</Text>
        <Text style={s.indexTitle}>Documentación de viaje</Text>
        <Text style={s.indexSub}>{`Reserva ${quote.code} · ${quote.route_name || "Camino de Santiago"}`}</Text>

        <View style={s.indexGrid}>
          <View style={s.indexCell}>
            <View style={s.indexBox}>
              <Text style={s.indexNum}>01</Text>
              <Text style={s.indexName}>Listado de alojamientos</Text>
              <Text style={s.indexDesc}>Noche a noche: dónde duermes, cómo llegar, a quién llamar y qué tener en cuenta en cada alojamiento.</Text>
            </View>
          </View>
          <View style={s.indexCell}>
            <View style={s.indexBox}>
              <Text style={s.indexNum}>02</Text>
              <Text style={s.indexName}>Servicios incluidos</Text>
              <Text style={s.indexDesc}>Credencial del peregrino, seguro de viaje, traslado de mochilas y asistencia: qué incluye y cómo se usa cada uno.</Text>
            </View>
          </View>
          <View style={s.indexCell}>
            <View style={s.indexBox}>
              <Text style={s.indexNum}>03</Text>
              <Text style={s.indexName}>Condiciones de reserva</Text>
              <Text style={s.indexDesc}>Condiciones generales, modificaciones, política de cancelación y plazos de pago.</Text>
            </View>
          </View>
          <View style={s.indexCell}>
            <View style={s.indexBox}>
              <Text style={s.indexNum}>04</Text>
              <Text style={s.indexName}>Contacto</Text>
              <Text style={s.indexDesc}>Teléfono de atención, correo y el número para emergencias fuera de horario.</Text>
            </View>
          </View>
        </View>

        {texts.importante ? (
          <View style={s.callout}>
            <Text style={s.calloutTitle}>Antes de salir</Text>
            <Text style={s.calloutText}>{texts.importante}</Text>
          </View>
        ) : null}
      </Page>

      {/* ============ ITINERARIO ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter referencia={quote.code} />

        <View style={s.clientBar}>
          <View>
            <Text style={s.eyebrow}>{subtituloRuta(quote.route_name)}</Text>
          </View>
          <View style={s.clientCol}>
            <Text style={s.clientLine}>{`Cliente: ${quote.client_name || "—"}`}</Text>
            {quote.client_phone ? <Text style={s.clientLine}>{`Teléfono: ${quote.client_phone}`}</Text> : null}
            {quote.client_email ? <Text style={s.clientLine}>{`Email: ${quote.client_email}`}</Text> : null}
          </View>
        </View>

        <Text style={s.h1}>{quote.route_name || "Camino de Santiago"}</Text>

        <View style={s.factsRow}>
          <View style={s.factCell}>
            <Text style={s.factLabel}>FECHAS</Text>
            <Text style={s.factValue}>{`${ddmmyyyy(quote.start_date)} - ${ddmmyyyy(quote.end_date)}`}</Text>
          </View>
          <View style={s.factCell}>
            <Text style={s.factLabel}>NOCHES</Text>
            <Text style={s.factValue}>{String(noches)}</Text>
          </View>
          <View style={s.factCell}>
            <Text style={s.factLabel}>VIAJEROS</Text>
            <Text style={s.factValue}>{String(quote.people ?? 1)}</Text>
          </View>
          <View style={s.factCell}>
            <Text style={s.factLabel}>ALOJAMIENTO</Text>
            <Text style={s.factValue}>{quote.modality || "—"}</Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>Itinerario</Text>
        <View style={s.dottedRule} />

        {nights.length === 0 ? (
          <Text style={s.p}>Todavía no hay alojamientos asignados para este viaje.</Text>
        ) : (
          nights.map((n, i) => <Noche key={i} n={n} />)
        )}
      </Page>

      {/* ============ SERVICIOS INCLUIDOS ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter referencia={quote.code} />

        <Text style={s.eyebrow}>LO QUE LLEVAS CONTRATADO</Text>
        <Text style={s.h1}>Servicios incluidos</Text>

        <View style={s.chipRow}>
          <View style={s.chip}>
            <Text style={s.chipValue}>{String(noches)}</Text>
            <Text style={s.chipLabel}>{noches === 1 ? "Noche" : "Noches"}</Text>
          </View>
          <View style={s.chip}>
            <Text style={s.chipValue}>{String(quote.people ?? 1)}</Text>
            <Text style={s.chipLabel}>{(quote.people ?? 1) === 1 ? "Viajero" : "Viajeros"}</Text>
          </View>
          <View style={s.chipLast}>
            <Text style={s.chipValue}>{String(bloques.length)}</Text>
            <Text style={s.chipLabel}>Servicios</Text>
          </View>
        </View>

        {bloques.length === 0 ? (
          <Text style={s.p}>No se marcó ningún servicio para este viaje.</Text>
        ) : (
          bloques.map((b) => (
            <View key={b.clave} style={s.svc}>
              <View style={s.svcTitleRow}>
                <View style={s.svcBullet} />
                <Text style={s.svcTitle}>{b.titulo}</Text>
              </View>
              {b.resumen ? <Text style={s.svcResumen}>{b.resumen}</Text> : null}
              <View style={s.svcBox}>
                <Parrafos items={b.parrafos} />
                <Lista items={b.vinetas} numerada={b.clave === "seguro"} />
                <Parrafos items={b.cierre} />
              </View>
            </View>
          ))
        )}

        {texts.importante ? (
          <View style={s.callout}>
            <Text style={s.calloutTitle}>Importante</Text>
            <Text style={s.calloutText}>{texts.importante}</Text>
          </View>
        ) : null}
      </Page>

      {/* ============ CONDICIONES ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter referencia={quote.code} />

        <Text style={s.eyebrow}>LETRA PEQUEÑA, EN GRANDE</Text>
        <Text style={s.h1}>Condiciones de reserva</Text>
        <Text style={s.p}>
          Estas condiciones resumen el contrato de prestación de servicios turísticos que firmaste con
          Camino Sacro. Ante cualquier diferencia, el contrato firmado es el que manda.
        </Text>

        {texts.condiciones.map((c, i) => (
          <View key={i} wrap={false}>
            <Text style={s.condTitle}>{c.titulo}</Text>
            {(c.parrafos || []).map((t, j) => <Text key={j} style={s.condText}>{t}</Text>)}
            <Lista items={c.vinetas} />
            {(c.cierre || []).map((t, j) => <Text key={`c${j}`} style={s.condText}>{t}</Text>)}
          </View>
        ))}
      </Page>

      {/* ============ CONTACTO ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter referencia={quote.code} />

        <Text style={s.eyebrow}>ESTAMOS AL OTRO LADO</Text>
        <Text style={s.h1}>Contáctanos si necesitas ayuda</Text>

        <View style={s.contactRow}>
          <View style={s.contactBox}>
            <Text style={s.contactLabel}>TELÉFONO</Text>
            <Text style={s.contactValue}>{cont.telefono || "—"}</Text>
            {cont.telefono_nota ? <Text style={s.contactNote}>{cont.telefono_nota}</Text> : null}
          </View>
          <View style={s.contactBox}>
            <Text style={s.contactLabel}>CORREO</Text>
            <Text style={s.contactValueEmail}>{cont.email || "—"}</Text>
            {cont.email_nota ? <Text style={s.contactNote}>{cont.email_nota}</Text> : null}
          </View>
          <View style={s.contactBoxLast}>
            <Text style={s.contactLabelInv}>EMERGENCIAS</Text>
            <Text style={s.contactValueInv}>{cont.emergencias || cont.telefono || "—"}</Text>
            {cont.emergencias_nota ? <Text style={s.contactNoteInv}>{cont.emergencias_nota}</Text> : null}
          </View>
        </View>

        <View style={s.callout}>
          <Text style={s.calloutTitle}>Misas en la Catedral de Santiago</Text>
          <Text style={s.calloutText}>Los horarios se consultan en catedraldesantiago.es/liturgia/</Text>
        </View>

        <View style={s.closing}>
          <Text style={s.closingTitle}>¡Buen Camino!</Text>
          <Text style={s.closingText}>
            Todo está listo para emprender la aventura. Lee con calma esta documentación y
            escríbenos ante cualquier duda: preferimos resolverla antes de que salgas.
          </Text>
        </View>

        <Text style={s.genStamp}>
          {`Documentación generada el ${fechaLarga(generatedAt.toISOString().slice(0, 10))} · Reserva ${quote.code}`}
        </Text>
      </Page>
    </Document>
  );
}
