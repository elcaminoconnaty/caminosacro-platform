import { Document, Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";
import path from "node:path";
import type { BikeRow, BikeSpec } from "./catalog";
import {
  CONDICIONES_ALQUILER,
  EQUIPAMIENTO_BAJO_PETICION,
  EQUIPAMIENTO_INCLUIDO,
  EQUIPAMIENTO_OPCIONAL,
  TALLAS,
} from "./data";

// Mismo registro de fuentes que quotePdf.tsx: los dos documentos tienen que salir de la
// misma caja tipográfica. Inter cubre el unicode (flechas, comillas de pulgada, ·) que las
// fuentes built-in de PDF no traen.
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

const SERIF = "Times-Roman";
const SERIF_BOLD = "Times-Bold";
const SANS = "Inter";
const SANS_BOLD = "Inter-Bold";

// Paleta idéntica a la de la cotización (quotePdf.tsx). Si cambia allá, cambia acá.
const C = {
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
};

const s = StyleSheet.create({
  page: { fontFamily: SANS, fontSize: 9.5, color: C.txt, paddingTop: 70, paddingBottom: 44, paddingHorizontal: 32 },

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

  // ===== PORTADA =====
  coverPage: { position: "relative", padding: 0, backgroundColor: C.verde, fontFamily: SANS },
  coverImg: { position: "absolute", top: 0, left: 0, width: "100%", height: "70%", objectFit: "cover" },
  coverImgTint: { position: "absolute", top: 0, left: 0, width: "100%", height: "70%", backgroundColor: "rgba(26, 58, 42, 0.25)" },
  coverTopTint: { position: "absolute", top: 0, left: 0, width: "100%", height: 130, backgroundColor: "rgba(15, 35, 25, 0.6)" },
  coverGreenBlock: { position: "absolute", bottom: 0, left: 0, width: "100%", height: "30%", backgroundColor: C.verde },
  coverTopHeader: {
    position: "absolute", top: 30, left: 32, right: 32,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
  },
  coverBrand: { fontFamily: SERIF_BOLD, fontSize: 13, color: C.white },
  coverBrandSub: { fontFamily: SANS, fontSize: 7.5, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  coverBrandLink: { fontFamily: SANS, fontSize: 7, color: C.oro, marginTop: 3 },
  coverRight: { alignItems: "flex-end" },
  coverRespaldo: { fontFamily: SANS, fontSize: 7.5, color: "rgba(255,255,255,0.7)", letterSpacing: 1 },
  coverRespaldoName: { fontFamily: SANS, fontSize: 8, color: "rgba(255,255,255,0.95)", marginTop: 4, letterSpacing: 0.5 },
  coverContent: { position: "absolute", left: 32, right: 32, bottom: 46 },
  coverEyebrow: { fontFamily: SANS, fontSize: 7, color: C.oro, letterSpacing: 3, marginBottom: 8 },
  coverSubtitle: { fontFamily: SANS, fontSize: 8, color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase" },
  coverTitle: { fontFamily: SERIF, fontSize: 30, color: C.white, lineHeight: 1.15, marginBottom: 10 },
  coverLead: { fontFamily: SANS, fontSize: 9.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, marginBottom: 12 },
  coverDivider: { width: 60, height: 0.5, backgroundColor: "rgba(255,255,255,0.3)", marginBottom: 14 },
  coverInfoRow: { flexDirection: "row" },
  coverInfoCol: { flex: 1 },
  coverInfoLabel: { fontFamily: SANS, fontSize: 7, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, marginBottom: 4 },
  coverInfoValue: { fontFamily: SERIF_BOLD, fontSize: 13, color: C.white },
  coverInfoSub: { fontFamily: SANS, fontSize: 8, color: "rgba(255,255,255,0.55)", marginTop: 3 },

  // ===== FICHA DE BICI =====
  detailEyebrow: { fontFamily: SANS, fontSize: 8, color: C.oroH, letterSpacing: 1.5, marginBottom: 5 },
  detailTitle: { fontFamily: SERIF, fontSize: 24, color: C.verde, marginBottom: 4 },
  detailTagline: { fontFamily: SANS, fontSize: 9.5, color: C.sec, fontStyle: "italic", marginBottom: 12 },

  photoCard: {
    borderWidth: 0.5, borderColor: C.borde, borderRadius: 6, backgroundColor: C.white,
    paddingVertical: 8, alignItems: "center", marginBottom: 12,
  },
  // objectFit "contain" + alto fijo: las 7 fotos tienen proporciones distintas y ninguna
  // se puede deformar. Se apaisan dentro de la caja y quedan centradas.
  photo: { width: "100%", height: 240, objectFit: "contain" },

  bodyText: { fontFamily: SANS, fontSize: 9, color: C.txt, lineHeight: 1.5, marginBottom: 6 },
  idealBox: {
    backgroundColor: C.gris, borderLeftWidth: 2, borderLeftColor: C.oro,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 3, marginBottom: 12,
  },
  idealText: { fontFamily: SANS_BOLD, fontSize: 8.5, color: C.verdeM, lineHeight: 1.4 },

  fichaRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  fichaCol: { flex: 1, borderWidth: 0.5, borderColor: C.borde, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 7 },
  fichaLabel: { fontFamily: SANS, fontSize: 6.5, color: C.sec, letterSpacing: 1, marginBottom: 4 },
  fichaValue: { fontFamily: SANS_BOLD, fontSize: 8.5, color: C.txt, lineHeight: 1.4 },
  fichaValueSub: { fontFamily: SANS, fontSize: 8, color: C.sec, lineHeight: 1.4, marginTop: 2 },

  chipRow: { flexDirection: "row", gap: 5, flexWrap: "wrap" },
  chip: { backgroundColor: C.greenL, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontFamily: SANS_BOLD, fontSize: 8.5, color: C.verdeM },
  chipNote: { fontFamily: SANS, fontSize: 7, color: C.sec, fontStyle: "italic", marginTop: 5 },

  motorBox: { backgroundColor: C.greenL, borderRadius: 6, padding: 10, marginBottom: 10, flexDirection: "row", gap: 10 },
  motorTitleRow: { marginBottom: 6 },
  motorTitle: { fontFamily: SANS_BOLD, fontSize: 8.5, color: C.verdeM, letterSpacing: 1 },
  motorCol: { flex: 1 },
  motorLabel: { fontFamily: SANS, fontSize: 6.5, color: C.verdeM, letterSpacing: 1, marginBottom: 3 },
  motorValue: { fontFamily: SANS_BOLD, fontSize: 8, color: C.verde, lineHeight: 1.4 },

  sectionLabel: { fontFamily: SANS_BOLD, fontSize: 7.5, color: C.sec, letterSpacing: 1.2, marginBottom: 6 },
  specsRow: { flexDirection: "row", gap: 16 },
  specsCol: { flex: 1 },
  specRow: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.25, borderBottomColor: C.borde },
  specLabel: { width: 74, fontFamily: SANS, fontSize: 7, color: C.sec },
  specValue: { flex: 1, fontFamily: SANS, fontSize: 7.5, color: C.txt, lineHeight: 1.35 },

  footnote: { fontFamily: SANS, fontSize: 7.5, color: C.sec, fontStyle: "italic", lineHeight: 1.45, marginTop: 10 },

  // ===== PÁGINAS DE TEXTO =====
  h1: { fontFamily: SERIF, fontSize: 24, color: C.verde, marginBottom: 6 },
  h1Sub: { fontFamily: SANS, fontSize: 9.5, color: C.sec, lineHeight: 1.5, marginBottom: 18 },
  h2: { fontFamily: SERIF, fontSize: 18, color: C.verde, marginBottom: 8 },

  equipRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  equipBox: { flex: 1, borderRadius: 6, padding: 12 },
  equipBoxIn: { backgroundColor: C.greenL },
  equipBoxOpt: { backgroundColor: C.gris, borderWidth: 0.5, borderColor: C.borde },
  equipBoxReq: { backgroundColor: C.amberL },
  equipTitle: { fontFamily: SANS_BOLD, fontSize: 9, marginBottom: 3 },
  equipTitleIn: { color: C.verdeM },
  equipTitleOpt: { color: C.txt },
  equipTitleReq: { color: C.amberT },
  equipSub: { fontFamily: SANS, fontSize: 7, marginBottom: 8, lineHeight: 1.35 },
  equipSubIn: { color: C.verdeM },
  equipSubOpt: { color: C.sec },
  equipSubReq: { color: C.amberT },
  equipItem: { flexDirection: "row", marginBottom: 5 },
  equipBullet: { width: 9, fontFamily: SANS, fontSize: 8.5 },
  equipText: { flex: 1, fontFamily: SANS, fontSize: 8.5, lineHeight: 1.4 },

  alforjaRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 6, borderBottomWidth: 0.25, borderBottomColor: C.borde,
  },
  alforjaName: { flex: 1 },
  alforjaModelo: { fontFamily: SANS_BOLD, fontSize: 8.5, color: C.txt },
  alforjaGama: { fontFamily: SANS, fontSize: 7, color: C.sec, marginTop: 1.5 },
  alforjaCap: { width: 170, fontFamily: SANS, fontSize: 8.5, color: C.verdeM, textAlign: "right" },

  tallaHead: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.borde, paddingBottom: 6, marginBottom: 2 },
  tallaTH: { fontFamily: SANS_BOLD, fontSize: 8, color: C.sec, letterSpacing: 0.5 },
  tallaRow: { flexDirection: "row", paddingVertical: 9, borderBottomWidth: 0.25, borderBottomColor: C.borde, alignItems: "center" },
  tallaAltura: { flex: 1, fontFamily: SANS, fontSize: 10, color: C.txt },
  tallaTallaCell: { width: 90, alignItems: "flex-start" },
  tallaTallaChip: { backgroundColor: C.verde, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 3 },
  tallaTallaText: { fontFamily: SANS_BOLD, fontSize: 9.5, color: C.white },
  tallaCuadro: { width: 110, fontFamily: SANS, fontSize: 10, color: C.sec, textAlign: "right" },

  callout: { backgroundColor: C.amberL, borderRadius: 5, padding: 12, marginTop: 18 },
  calloutTitle: { fontFamily: SANS_BOLD, fontSize: 9, color: C.amberT, marginBottom: 4 },
  calloutText: { fontFamily: SANS, fontSize: 8.5, color: C.amberT, lineHeight: 1.45 },

  condItem: { marginBottom: 11 },
  condTitle: { fontFamily: SANS_BOLD, fontSize: 9.5, color: C.verde, marginBottom: 3 },
  condText: { fontFamily: SANS, fontSize: 8.5, color: C.txt, lineHeight: 1.5 },

  pasoRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  pasoBox: { flex: 1, borderWidth: 0.5, borderColor: C.borde, borderRadius: 6, padding: 12, backgroundColor: C.white },
  pasoNum: { fontFamily: SERIF, fontSize: 22, color: C.oroH, marginBottom: 4 },
  pasoTitle: { fontFamily: SANS_BOLD, fontSize: 9, color: C.verde, marginBottom: 4 },
  pasoText: { fontFamily: SANS, fontSize: 8, color: C.sec, lineHeight: 1.45 },

  ctaBox: { backgroundColor: C.verde, borderRadius: 8, padding: 22, marginBottom: 14 },
  ctaEyebrow: { fontFamily: SANS, fontSize: 8, color: C.oro, letterSpacing: 2, marginBottom: 6 },
  ctaTitle: { fontFamily: SERIF, fontSize: 20, color: C.white, marginBottom: 8 },
  ctaText: { fontFamily: SANS, fontSize: 9.5, color: "rgba(255,255,255,0.85)", marginBottom: 14, lineHeight: 1.5 },
  ctaContacts: { flexDirection: "row", gap: 30 },
  ctaContact: { flex: 1 },
  ctaContactLabel: { fontFamily: SANS, fontSize: 7, color: "rgba(255,255,255,0.6)", letterSpacing: 1, marginBottom: 4 },
  ctaContactValue: { fontFamily: SANS_BOLD, fontSize: 11, color: C.white },

  ctaAltBox: { backgroundColor: C.greenL, borderRadius: 8, padding: 18, borderWidth: 0.5, borderColor: C.borde },
  ctaAltEyebrow: { fontFamily: SANS, fontSize: 8, color: C.oroH, letterSpacing: 2, marginBottom: 6 },
  ctaAltTitle: { fontFamily: SERIF, fontSize: 16, color: C.verde, marginBottom: 6 },
  ctaAltText: { fontFamily: SANS, fontSize: 9, color: C.verdeM, marginBottom: 12, lineHeight: 1.5 },
  ctaAltContactLabel: { fontFamily: SANS, fontSize: 7, color: C.sec, letterSpacing: 1, marginBottom: 4 },
  ctaAltContactValue: { fontFamily: SANS_BOLD, fontSize: 11, color: C.verde },
});

/** Un estilo de `s`, para poder pasar variantes por prop sin caer en `any`. */
type EstiloRPDF = (typeof s)[keyof typeof s];

export type BikeCatalogPDFProps = {
  /** Flota activa, ya ordenada por `position`. */
  bikes: BikeRow[];
  /** Foto de portada (la misma de la cotización, src/lib/cover.jpg). */
  coverImage?: Buffer;
  /** slug de bici → buffer del jpg de `src/lib/bikes/`. */
  photos: Record<string, Buffer>;
};

/**
 * Condiciones del alquiler tal como se le cuentan al peregrino. El texto vive en
 * `CONDICIONES_ALQUILER` (data.ts) y no se duplica acá: acá solo se decide el orden y el
 * título de cada bloque, para que editar la condición en un solo lugar cambie el PDF.
 */
const CONDICIONES_ORDEN: Array<{ title: string; key: keyof typeof CONDICIONES_ALQUILER }> = [
  { title: "Fianza", key: "fianza" },
  { title: "Modelo y gama", key: "modelo" },
  { title: "Tu talla", key: "talla" },
  { title: "Casco", key: "casco" },
  { title: "Pedales", key: "pedales" },
  { title: "Entrega de la bicicleta", key: "entrega" },
  { title: "Devolución", key: "devolucion" },
  { title: "Antelación mínima", key: "antelacion" },
  { title: "Cancelación del alquiler", key: "cancelacion" },
  { title: "Seguro", key: "seguro" },
  { title: "Equipamiento extraviado", key: "equipamiento_extraviado" },
];

export function BikeCatalogPDF({ bikes, coverImage, photos }: BikeCatalogPDFProps) {
  const flota = [...bikes].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const hayElectricas = flota.some((b) => b.electric);

  return (
    <Document
      author="Camino Sacro"
      title="Catálogo de bicicletas — Camino Sacro"
      subject="El Camino de Santiago en bicicleta"
    >
      {/* ============ PORTADA ============ */}
      <Page size="A4" style={s.coverPage}>
        {coverImage && <Image src={coverImage as unknown as string} style={s.coverImg} />}
        <View style={s.coverImgTint} />
        <View style={s.coverTopTint} />
        <View style={s.coverGreenBlock} />

        <View style={s.coverTopHeader}>
          <View style={s.hLeft}>
            <Text style={s.coverBrand}>Camino Sacro</Text>
            <Text style={s.coverBrandSub}>Agencia del Camino de Santiago</Text>
            <Text style={s.coverBrandLink}>www.caminosacro.com</Text>
          </View>
          <View style={s.coverRight}>
            <Text style={s.coverRespaldo}>RESPALDADO POR</Text>
            <Text style={s.coverRespaldoName}>EL CAMINO CON NATY</Text>
            <Text style={s.coverBrandLink}>www.elcaminoconnaty.com</Text>
          </View>
        </View>

        <View style={s.coverContent}>
          <Text style={s.coverEyebrow}>CATÁLOGO DE BICICLETAS</Text>
          <Text style={s.coverSubtitle}>Camino de Santiago</Text>
          <Text style={s.coverTitle}>El Camino de Santiago{"\n"}en bicicleta</Text>
          {/* Una sola línea: el bloque verde de la portada mide 30 % y no da para más. */}
          <Text style={s.coverLead}>La flota completa, ficha por ficha, y todo lo que hay que saber antes de elegir.</Text>
          <View style={s.coverDivider} />
          <View style={s.coverInfoRow}>
            <View style={s.coverInfoCol}>
              <Text style={s.coverInfoLabel}>LA FLOTA</Text>
              <Text style={s.coverInfoValue}>{`${flota.length} modelos`}</Text>
              <Text style={s.coverInfoSub}>
                {hayElectricas ? "Montaña, gravel y eléctricas" : "Montaña y gravel"}
              </Text>
            </View>
            <View style={s.coverInfoCol}>
              <Text style={s.coverInfoLabel}>ENTREGA</Text>
              <Text style={s.coverInfoValue}>En tu alojamiento</Text>
              <Text style={s.coverInfoSub}>Montada y lista para rodar</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ============ UNA PÁGINA POR BICI ============ */}
      {flota.map((b) => (
        <BikePage key={b.id || b.slug} bike={b} photo={photos[b.slug]} />
      ))}

      {/* ============ EQUIPAMIENTO ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter />

        <Text style={s.detailEyebrow}>QUÉ VIENE CON TU BICI</Text>
        <Text style={s.h1}>Equipamiento</Text>
        <Text style={s.h1Sub}>
          Elijas la bici que elijas, sale del taller con todo lo de la primera columna sin costo
          extra. Lo demás se pide al contratar y depende de disponibilidad.
        </Text>

        <View style={s.equipRow}>
          <EquipBox
            title="Siempre incluido"
            subtitle="Va con cualquier bicicleta de la flota."
            items={[...EQUIPAMIENTO_INCLUIDO]}
            boxStyle={s.equipBoxIn}
            titleStyle={s.equipTitleIn}
            subStyle={s.equipSubIn}
            bulletColor={C.verdeM}
          />
          <EquipBox
            title="Opcional"
            subtitle="Siempre hay en stock: solo hay que pedirlo."
            items={[...EQUIPAMIENTO_OPCIONAL]}
            boxStyle={s.equipBoxOpt}
            titleStyle={s.equipTitleOpt}
            subStyle={s.equipSubOpt}
            bulletColor={C.sec}
          />
          <EquipBox
            title="Bajo petición"
            subtitle="Sujeto a disponibilidad para tus fechas."
            items={[...EQUIPAMIENTO_BAJO_PETICION]}
            boxStyle={s.equipBoxReq}
            titleStyle={s.equipTitleReq}
            subStyle={s.equipSubReq}
            bulletColor={C.amberT}
          />
        </View>

        <Text style={s.sectionLabel}>CUÁNTO EQUIPAJE ADMITE CADA MODELO</Text>
        {flota.map((b) => (
          <View key={`alf-${b.slug}`} style={s.alforjaRow} wrap={false}>
            <View style={s.alforjaName}>
              <Text style={s.alforjaModelo}>{b.name}</Text>
              <Text style={s.alforjaGama}>{b.category_label}</Text>
            </View>
            <Text style={s.alforjaCap}>{b.luggage || "—"}</Text>
          </View>
        ))}

        <View style={s.callout}>
          <Text style={s.calloutTitle}>El casco va aparte</Text>
          <Text style={s.calloutText}>{CONDICIONES_ALQUILER.casco}</Text>
        </View>

        <View style={[s.callout, { backgroundColor: C.greenL, marginTop: 10 }]}>
          <Text style={[s.calloutTitle, { color: C.verdeM }]}>Ruedas tubelizadas en toda la flota</Text>
          <Text style={[s.calloutText, { color: C.verdeM }]}>
            Todas las bicicletas llevan ruedas tubelizadas, así que los pinchazos son casi
            imposibles. Aun así viajás con kit de parches, cámara de repuesto y bomba, por si acaso.
          </Text>
        </View>
      </Page>

      {/* ============ TALLAS ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter />

        <Text style={s.detailEyebrow}>ANTES DE RESERVAR</Text>
        <Text style={s.h1}>¿Qué talla necesito?</Text>
        <Text style={s.h1Sub}>
          La talla se asigna por tu estatura. Buscá tu rango en la tabla y decinos cuánto medís: con
          ese dato reservamos la bici correcta para tus fechas.
        </Text>

        <View style={s.tallaHead}>
          <Text style={[s.tallaTH, { flex: 1 }]}>TU ESTATURA</Text>
          <Text style={[s.tallaTH, { width: 90 }]}>TALLA</Text>
          <Text style={[s.tallaTH, { width: 110, textAlign: "right" }]}>CUADRO</Text>
        </View>
        {TALLAS.map((t) => (
          <View key={t.talla} style={s.tallaRow} wrap={false}>
            <Text style={s.tallaAltura}>{t.altura}</Text>
            <View style={s.tallaTallaCell}>
              <View style={s.tallaTallaChip}>
                <Text style={s.tallaTallaText}>{t.talla}</Text>
              </View>
            </View>
            <Text style={s.tallaCuadro}>{t.cuadro}</Text>
          </View>
        ))}

        <View style={s.callout}>
          <Text style={s.calloutTitle}>Sin estatura no hay alquiler</Text>
          <Text style={s.calloutText}>{CONDICIONES_ALQUILER.talla}</Text>
        </View>

        <View style={[s.callout, { backgroundColor: C.gris, marginTop: 10 }]}>
          <Text style={[s.calloutTitle, { color: C.verde }]}>Si estás justo en el límite</Text>
          <Text style={[s.calloutText, { color: C.txt }]}>
            Cuando tu estatura cae entre dos tallas, contanos también tu entrepierna y si preferís
            una postura más cómoda o más deportiva. Con eso el taller define cuál te va mejor.
          </Text>
        </View>

        <View style={[s.callout, { backgroundColor: C.greenL, marginTop: 10 }]}>
          <Text style={[s.calloutTitle, { color: C.verdeM }]}>No todas las tallas están en todos los modelos</Text>
          <Text style={[s.calloutText, { color: C.verdeM }]}>
            Cada ficha indica las tallas disponibles de ese modelo. Si la tuya no está en la bici que
            te gustó, te ofrecemos una de gama equivalente que sí la tenga.
          </Text>
        </View>
      </Page>

      {/* ============ CONDICIONES ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter />

        <Text style={s.detailEyebrow}>LETRA CHICA, EN GRANDE</Text>
        <Text style={s.h1}>Condiciones del alquiler</Text>
        <Text style={s.h1Sub}>
          Todo esto te lo contamos antes de que reserves, no después. Si algo no te cuadra,
          preguntanos y lo resolvemos.
        </Text>

        {CONDICIONES_ORDEN.map((c) => (
          <View key={c.key} style={s.condItem} wrap={false}>
            <Text style={s.condTitle}>{c.title}</Text>
            <Text style={s.condText}>{CONDICIONES_ALQUILER[c.key]}</Text>
          </View>
        ))}
      </Page>

      {/* ============ CIERRE ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter />

        <Text style={s.detailEyebrow}>CÓMO SEGUIMOS</Text>
        <Text style={s.h1}>Reservar tu bici</Text>
        <Text style={s.h1Sub}>
          El alquiler se coordina junto con tu Camino: nosotros hablamos con el taller, vos solo
          elegís la gama y nos mandás tu estatura.
        </Text>

        <View style={s.pasoRow}>
          <View style={s.pasoBox}>
            <Text style={s.pasoNum}>1</Text>
            <Text style={s.pasoTitle}>Elegí la gama</Text>
            <Text style={s.pasoText}>
              Mirá las fichas y decinos cuál te late. Lo que se contrata es la gama; el modelo va
              como referencia.
            </Text>
          </View>
          <View style={s.pasoBox}>
            <Text style={s.pasoNum}>2</Text>
            <Text style={s.pasoTitle}>Mandanos tu estatura</Text>
            <Text style={s.pasoText}>
              Con la estatura de cada peregrino asignamos la talla y confirmamos disponibilidad para
              tus fechas.
            </Text>
          </View>
          <View style={s.pasoBox}>
            <Text style={s.pasoNum}>3</Text>
            <Text style={s.pasoTitle}>La recibís montada</Text>
            <Text style={s.pasoText}>
              Llega a tu primer alojamiento unas 48 horas antes. Ajustás manillar y sillín, y a
              rodar.
            </Text>
          </View>
        </View>

        <View style={s.ctaBox} wrap={false}>
          <Text style={s.ctaEyebrow}>SIGUIENTE PASO</Text>
          <Text style={s.ctaTitle}>¿Cuál te llevás?</Text>
          <Text style={s.ctaText}>
            Escribile a Nico con la gama que te gustó y tus fechas. Él confirma disponibilidad, te
            arma la cotización con el alquiler incluido y te acompaña hasta que estés pedaleando.
          </Text>
          <View style={s.ctaContacts}>
            <View style={s.ctaContact}>
              <Text style={s.ctaContactLabel}>WHATSAPP</Text>
              <Text style={s.ctaContactValue}>+57 300 491 0929</Text>
            </View>
            <View style={s.ctaContact}>
              <Text style={s.ctaContactLabel}>WEB</Text>
              <Text style={s.ctaContactValue}>caminosacro.com</Text>
            </View>
          </View>
        </View>

        <View style={s.ctaAltBox} wrap={false}>
          <Text style={s.ctaAltEyebrow}>OTRA FORMA DE VIVIRLO</Text>
          <Text style={s.ctaAltTitle}>¿Preferís hacerlo caminando y en grupo?</Text>
          <Text style={s.ctaAltText}>
            Naty organiza salidas grupales del Camino de Santiago con acompañamiento terapéutico
            durante toda la ruta: caminás acompañado, a tu ritmo y con un propósito.
          </Text>
          <View style={s.ctaContacts}>
            <View style={s.ctaContact}>
              <Text style={s.ctaAltContactLabel}>WEB</Text>
              <Text style={s.ctaAltContactValue}>elcaminoconnaty.com</Text>
            </View>
            <View style={s.ctaContact}>
              <Text style={s.ctaAltContactLabel}>WHATSAPP DE NATY</Text>
              <Text style={s.ctaAltContactValue}>+57 301 431 4296</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Ficha de una bici: siempre una página completa, sin `wrap`, para que nunca se parta. */
function BikePage({ bike, photo }: { bike: BikeRow; photo?: Buffer }) {
  // Dos columnas por corte a la mitad (no alternando): así se lee de arriba abajo en cada
  // columna, como una ficha técnica de catálogo y no como un zigzag.
  const mitad = Math.ceil(bike.specs.length / 2);
  const colIzq: BikeSpec[] = bike.specs.slice(0, mitad);
  const colDer: BikeSpec[] = bike.specs.slice(mitad);

  return (
    <Page size="A4" style={s.page}>
      <PageHeader />
      <PageFooter />

      <Text style={s.detailEyebrow}>{bike.category_label.toUpperCase()}</Text>
      <Text style={s.detailTitle}>{bike.name}</Text>
      {bike.tagline ? <Text style={s.detailTagline}>{bike.tagline}</Text> : null}

      {photo ? (
        <View style={s.photoCard}>
          <Image src={photo as unknown as string} style={s.photo} />
        </View>
      ) : null}

      {bike.description ? <Text style={s.bodyText}>{bike.description}</Text> : null}
      {bike.ideal_para ? (
        <View style={s.idealBox}>
          <Text style={s.idealText}>{bike.ideal_para}</Text>
        </View>
      ) : null}

      <View style={s.fichaRow}>
        <View style={s.fichaCol}>
          <Text style={s.fichaLabel}>TALLAS DISPONIBLES</Text>
          <View style={s.chipRow}>
            {bike.sizes.map((t) => (
              <View key={t} style={s.chip}>
                <Text style={s.chipText}>{t}</Text>
              </View>
            ))}
          </View>
          {bike.sizes_note ? <Text style={s.chipNote}>{bike.sizes_note}</Text> : null}
        </View>
        <View style={s.fichaCol}>
          <Text style={s.fichaLabel}>RUEDAS</Text>
          {bike.wheels.map((w, i) => (
            <Text key={i} style={i === 0 ? s.fichaValue : s.fichaValueSub}>{w}</Text>
          ))}
        </View>
        <View style={s.fichaCol}>
          <Text style={s.fichaLabel}>EQUIPAJE</Text>
          <Text style={s.fichaValue}>{bike.luggage || "—"}</Text>
        </View>
      </View>

      {bike.motor && (
        <View style={s.motorBox} wrap={false}>
          <View style={s.motorCol}>
            <View style={s.motorTitleRow}>
              <Text style={s.motorTitle}>ASISTENCIA ELÉCTRICA</Text>
            </View>
            <Text style={s.motorLabel}>MOTOR</Text>
            <Text style={s.motorValue}>{bike.motor.motor}</Text>
          </View>
          <View style={s.motorCol}>
            <View style={s.motorTitleRow}>
              <Text style={[s.motorTitle, { color: "transparent" }]}>·</Text>
            </View>
            <Text style={s.motorLabel}>PANTALLA</Text>
            <Text style={s.motorValue}>{bike.motor.pantalla}</Text>
          </View>
          <View style={s.motorCol}>
            <View style={s.motorTitleRow}>
              <Text style={[s.motorTitle, { color: "transparent" }]}>·</Text>
            </View>
            <Text style={s.motorLabel}>BATERÍA</Text>
            <Text style={s.motorValue}>{bike.motor.bateria}</Text>
          </View>
        </View>
      )}

      <Text style={s.sectionLabel}>FICHA TÉCNICA</Text>
      <View style={s.specsRow}>
        <View style={s.specsCol}>
          {colIzq.map((sp, i) => (
            <View key={i} style={s.specRow} wrap={false}>
              <Text style={s.specLabel}>{sp.label}</Text>
              <Text style={s.specValue}>{sp.value}</Text>
            </View>
          ))}
        </View>
        <View style={s.specsCol}>
          {colDer.map((sp, i) => (
            <View key={i} style={s.specRow} wrap={false}>
              <Text style={s.specLabel}>{sp.label}</Text>
              <Text style={s.specValue}>{sp.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={s.footnote}>{CONDICIONES_ALQUILER.modelo}</Text>
    </Page>
  );
}

function EquipBox({
  title, subtitle, items, boxStyle, titleStyle, subStyle, bulletColor,
}: {
  title: string;
  subtitle: string;
  items: string[];
  // El tipo se deriva de la propia hoja de estilos: react-pdf no exporta `Style` público.
  boxStyle: EstiloRPDF;
  titleStyle: EstiloRPDF;
  subStyle: EstiloRPDF;
  bulletColor: string;
}) {
  return (
    <View style={[s.equipBox, boxStyle]}>
      <Text style={[s.equipTitle, titleStyle]}>{title}</Text>
      <Text style={[s.equipSub, subStyle]}>{subtitle}</Text>
      {items.map((t, i) => (
        <View key={i} style={s.equipItem}>
          <Text style={[s.equipBullet, { color: bulletColor }]}>•</Text>
          <Text style={s.equipText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function PageHeader() {
  return (
    <View style={s.pageHeader} fixed>
      <View style={s.hLeft}>
        <Text style={s.hBrand}>Camino Sacro</Text>
        <Text style={s.hSub}>Agencia de peregrinaciones · Respaldado por El Camino con Naty</Text>
      </View>
      <Text
        style={s.hPage}
        render={({ pageNumber, totalPages }) => `Pág ${pageNumber} de ${totalPages}`}
      />
    </View>
  );
}

function PageFooter() {
  return (
    <View style={s.pageFooter} fixed>
      <Text style={s.pageFooterText}>Camino Sacro · Catálogo de bicicletas</Text>
      <Text style={s.pageFooterRight}>www.caminosacro.com</Text>
    </View>
  );
}
