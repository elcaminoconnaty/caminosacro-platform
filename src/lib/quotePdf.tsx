import { Document, Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";
import fs from "node:fs";
import path from "node:path";
import { FIANZA_POR_BICI_EUR } from "@/lib/bikes/catalog";
// Las condiciones del alquiler se importan del archivo de seed a propósito, no se copian:
// son texto que va firmado al cliente y tiene que decir LO MISMO acá, en el catálogo público
// y en el dossier de Pilgrim del que salieron. `data.ts` es datos puros —cero imports, ni
// supabase ni node—, así que traerlo no arrastra nada raro al bundle del PDF.
import { CONDICIONES_ALQUILER } from "@/lib/bikes/data";

// Inter TTFs locales. Soporta Unicode amplio (flechas, símbolos) que las fuentes built-in
// de PDF (Adobe Standard Encoding) no incluyen.
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

// SERIF se mantiene en Times built-in (solo se usa para títulos/números, sin chars unicode raros).
const SERIF = "Times-Roman";
const SERIF_BOLD = "Times-Bold";
const SANS = "Inter";
const SANS_BOLD = "Inter-Bold";

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
  pinkL: "#fdf2f2",
  pinkT: "#9c2424",
};

const s = StyleSheet.create({
  // Layout base
  page: { fontFamily: SANS, fontSize: 9.5, color: C.txt, paddingTop: 70, paddingBottom: 44, paddingHorizontal: 32 },
  // Header en páginas 2+
  pageHeader: {
    position: "absolute", top: 24, left: 32, right: 32, flexDirection: "row",
    justifyContent: "space-between", alignItems: "flex-start",
  },
  hLeft: { flexDirection: "column" },
  hBrand: { fontFamily: SERIF_BOLD, fontSize: 11, color: C.verde },
  hSub: { fontFamily: SANS, fontSize: 6.5, color: C.sec, marginTop: 1.5 },
  hPage: { fontFamily: SANS, fontSize: 7, color: C.sec },

  // ===== COVER =====
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

  coverContent: { position: "absolute", left: 32, right: 32, bottom: 50 },
  coverEyebrow: { fontFamily: SANS, fontSize: 7, color: C.oro, letterSpacing: 3, marginBottom: 10 },
  coverSubtitle: { fontFamily: SANS, fontSize: 8, color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, marginBottom: 8, textTransform: "uppercase" },
  coverTitle: { fontFamily: SERIF, fontSize: 30, color: C.white, lineHeight: 1.15, marginBottom: 14 },
  coverDate: { fontFamily: SANS, fontSize: 11, color: C.oro, marginBottom: 14 },
  coverDivider: { width: 60, height: 0.5, backgroundColor: "rgba(255,255,255,0.3)", marginBottom: 14 },
  coverInfoRow: { flexDirection: "row" },
  coverInfoCol: { flex: 1 },
  coverInfoLabel: { fontFamily: SANS, fontSize: 7, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, marginBottom: 4 },
  coverInfoValue: { fontFamily: SERIF_BOLD, fontSize: 13, color: C.white },
  coverInfoSub: { fontFamily: SANS, fontSize: 8, color: "rgba(255,255,255,0.55)", marginTop: 3 },

  // ===== DETAIL =====
  detailEyebrow: { fontFamily: SANS, fontSize: 8, color: C.oroH, letterSpacing: 1.5, marginBottom: 6 },
  detailTitle: { fontFamily: SERIF, fontSize: 24, color: C.verde, marginBottom: 6 },
  detailSubtitle: { fontFamily: SANS, fontSize: 9.5, color: C.sec, marginBottom: 18 },

  statsGrid: { flexDirection: "row", gap: 6, marginBottom: 14 },
  statBox: { flex: 1, borderWidth: 0.5, borderColor: C.borde, borderRadius: 5, paddingTop: 12, paddingBottom: 10, alignItems: "center", backgroundColor: C.white },
  statValue: { fontFamily: SERIF, fontSize: 22, color: C.verde },
  statSuffix: { fontFamily: SANS, fontSize: 8, color: C.sec, marginLeft: 1 },
  statLabel: { fontFamily: SANS, fontSize: 7.5, color: C.sec, letterSpacing: 0.5, marginTop: 6 },

  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  badge: { borderRadius: 11, paddingHorizontal: 12, paddingVertical: 5 },
  badgeMochila: { backgroundColor: C.greenL },
  badgeMochilaText: { fontFamily: SANS, fontSize: 8, color: C.verdeM },
  badgeSeason: { backgroundColor: "#FFF3CD" },
  badgeSeasonText: { fontFamily: SANS, fontSize: 8, color: "#856404" },

  priceRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  priceCard: { flex: 1, borderRadius: 6, paddingVertical: 14, paddingHorizontal: 10, alignItems: "center" },
  priceCardLight: { backgroundColor: C.gris, borderWidth: 0.5, borderColor: C.borde },
  priceCardDark: { backgroundColor: C.verde },
  priceLabel: { fontFamily: SANS, fontSize: 8, letterSpacing: 1, marginBottom: 2 },
  priceLabelLight: { color: C.sec },
  priceLabelDark: { color: "rgba(255,255,255,0.85)" },
  priceSubLabel: { fontFamily: SANS, fontSize: 7.5, marginBottom: 8 },
  priceSubLabelLight: { color: C.sec },
  priceSubLabelDark: { color: "rgba(255,255,255,0.6)" },
  priceMain: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", marginBottom: 4 },
  priceNum: { fontFamily: SERIF, fontSize: 32 },
  priceNumLight: { color: C.verde },
  priceNumDark: { color: C.white },
  priceCurr: { fontFamily: SERIF, fontSize: 16, marginLeft: 2 },
  priceCurrLight: { color: C.oroH },
  priceCurrDark: { color: C.oro },
  priceFooter: { fontFamily: SANS, fontSize: 7.5 },
  priceFooterLight: { color: C.sec },
  priceFooterDark: { color: "rgba(255,255,255,0.7)" },

  seasonNote: { fontFamily: SANS, fontSize: 8, color: C.sec, fontStyle: "italic", marginBottom: 14, marginTop: 4 },

  infoRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  infoCol: { flex: 1, borderWidth: 0.5, borderColor: C.borde, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 8 },
  infoLabel: { fontFamily: SANS, fontSize: 7, color: C.sec, letterSpacing: 1, marginBottom: 3 },
  infoValue: { fontFamily: SANS_BOLD, fontSize: 9, color: C.txt },

  h2: { fontFamily: SERIF, fontSize: 18, color: C.verde, marginBottom: 8 },

  // Itinerario table
  itinTableHead: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.borde, paddingVertical: 6, marginBottom: 2 },
  itinTH: { fontFamily: SANS_BOLD, fontSize: 8, color: C.sec, letterSpacing: 0.5 },
  itinTHDay: { width: 30 },
  itinTHFecha: { width: 50 },
  itinTHEtapa: { flex: 1 },
  itinTHAloj: { width: 150, textAlign: "right" },
  itinRow: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.25, borderBottomColor: C.borde },
  itinDay: { width: 30, fontFamily: SANS_BOLD, fontSize: 9, color: C.oroH },
  itinFecha: { width: 50, fontFamily: SANS, fontSize: 8.5, color: C.sec },
  itinEtapa: { flex: 1, fontFamily: SANS, fontSize: 9, color: C.txt },
  itinAloj: { width: 150, fontFamily: SANS, fontSize: 9, color: C.sec, textAlign: "right" },

  // Servicios incluidos / no incluidos
  servicesRow: { flexDirection: "row", gap: 12, marginBottom: 18 },
  serviceBox: { flex: 1, borderRadius: 6, padding: 14 },
  serviceBoxIn: { backgroundColor: C.greenL },
  serviceBoxOut: { backgroundColor: C.pinkL },
  serviceTitle: { fontFamily: SANS_BOLD, fontSize: 9.5, marginBottom: 8 },
  serviceTitleIn: { color: C.verdeM },
  serviceTitleOut: { color: C.pinkT },
  serviceItem: { flexDirection: "row", marginBottom: 5 },
  serviceBullet: { width: 10, fontFamily: SANS, fontSize: 9 },
  serviceBulletIn: { color: C.verdeM },
  serviceBulletOut: { color: C.pinkT },
  serviceText: { flex: 1, fontFamily: SANS, fontSize: 8.5, lineHeight: 1.45 },

  // Opcionales
  optTable: { marginBottom: 14 },
  optGroupRow: { borderBottomWidth: 0.5, borderBottomColor: C.borde, paddingVertical: 5, marginTop: 4 },
  optGroupTitle: { fontFamily: SANS_BOLD, fontSize: 8, color: C.txt, letterSpacing: 0.5 },
  optRow: { flexDirection: "row", borderBottomWidth: 0.25, borderBottomColor: C.borde, paddingVertical: 4 },
  optName: { flex: 1, fontFamily: SANS, fontSize: 8.5 },
  optUnit: { width: 100, fontFamily: SANS, fontSize: 8.5, color: C.sec },
  optPrice: { width: 60, fontFamily: SANS_BOLD, fontSize: 9, textAlign: "right" },
  optHeadRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.borde, paddingVertical: 4 },
  optHead: { fontFamily: SANS_BOLD, fontSize: 7.5, color: C.sec, letterSpacing: 0.5 },

  // Alquiler de bicicletas (solo rutas en bici). Comparte la retícula de la tabla de
  // opcionales para que se lea como una sección más del mismo bloque, pero cada fila lleva
  // dos líneas por columna (gama/modelo, tallas/alforjas, precio/días).
  bikeIntro: { fontFamily: SANS, fontSize: 8.5, color: C.sec, lineHeight: 1.45, marginBottom: 8 },
  bikeRow: { flexDirection: "row", borderBottomWidth: 0.25, borderBottomColor: C.borde, paddingVertical: 5, alignItems: "flex-start" },
  bikeCat: { fontFamily: SANS_BOLD, fontSize: 8.5, color: C.txt },
  bikeModel: { fontFamily: SANS, fontSize: 7.5, color: C.sec, marginTop: 1.5, lineHeight: 1.35 },
  bikeSpec: { fontFamily: SANS, fontSize: 7.5, color: C.sec, lineHeight: 1.35 },
  bikePrice: { fontFamily: SANS_BOLD, fontSize: 9.5, color: C.verde, textAlign: "right" },
  bikeDays: { fontFamily: SANS, fontSize: 7, color: C.sec, textAlign: "right", marginTop: 1.5 },
  bikeChosen: { fontFamily: SANS_BOLD, fontSize: 7, color: C.verdeM, marginTop: 3 },
  bikeNoteBox: { backgroundColor: C.gris, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  bikeNoteTitle: { fontFamily: SANS_BOLD, fontSize: 8, color: C.txt, letterSpacing: 0.5, marginBottom: 6 },
  bikeNoteItem: { flexDirection: "row", marginBottom: 4 },
  bikeNoteBullet: { width: 9, fontFamily: SANS, fontSize: 7.5, color: C.oroH },
  bikeNoteText: { flex: 1, fontFamily: SANS, fontSize: 7.5, color: C.sec, lineHeight: 1.45 },

  // Fianza: va FUERA del recuadro del resumen, porque no es parte del total.
  fianzaBox: { backgroundColor: C.amberL, borderRadius: 5, padding: 10, marginBottom: 14 },
  fianzaTitle: { fontFamily: SANS_BOLD, fontSize: 9, color: C.amberT, marginBottom: 3 },
  fianzaText: { fontFamily: SANS, fontSize: 8.5, color: C.amberT, lineHeight: 1.4 },

  // Resumen
  resumenBox: { backgroundColor: C.gris, borderRadius: 6, padding: 16, marginBottom: 14 },
  resumenTable: { marginBottom: 8 },
  resumenHeadRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.borde, paddingBottom: 5, marginBottom: 5 },
  resumenHead: { fontFamily: SANS_BOLD, fontSize: 8, color: C.sec, letterSpacing: 0.5 },
  resumenConcept: { flex: 2 },
  resumenUnit: { width: 70, textAlign: "right" },
  resumenPpl: { width: 50, textAlign: "right" },
  resumenTotal: { width: 70, textAlign: "right" },
  resumenLine: { flexDirection: "row", paddingVertical: 6, alignItems: "flex-start" },
  resumenLineConcept: { flex: 2 },
  resumenLineConceptName: { fontFamily: SANS_BOLD, fontSize: 9.5, color: C.txt },
  resumenLineConceptSub: { fontFamily: SANS, fontSize: 7.5, color: C.sec, marginTop: 2 },
  resumenLineCell: { fontFamily: SANS, fontSize: 9, textAlign: "right" },
  resumenTotalBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.borde },
  resumenTotalLabel: { fontFamily: SANS_BOLD, fontSize: 11, color: C.txt },
  resumenTotalNum: { fontFamily: SERIF, fontSize: 30, color: C.verde },
  resumenTotalCurr: { fontFamily: SERIF, fontSize: 16, color: C.oroH },
  resumenNote: { fontFamily: SANS, fontSize: 7.5, color: C.sec, fontStyle: "italic", textAlign: "center", marginTop: 6 },

  // Condiciones
  condTitle: { fontFamily: SERIF, fontSize: 14, color: C.verde, marginTop: 14, marginBottom: 6, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: C.borde },
  condText: { fontFamily: SANS, fontSize: 8.5, color: C.txt, lineHeight: 1.5, marginBottom: 6 },
  condSubtitle: { fontFamily: SANS_BOLD, fontSize: 9, color: C.txt, marginTop: 6, marginBottom: 2 },

  // CTA
  ctaBox: { backgroundColor: C.verde, borderRadius: 8, padding: 22, marginTop: 14, marginBottom: 14 },
  ctaEyebrow: { fontFamily: SANS, fontSize: 8, color: C.oro, letterSpacing: 2, marginBottom: 6 },
  ctaTitle: { fontFamily: SERIF, fontSize: 20, color: C.white, marginBottom: 8 },
  ctaText: { fontFamily: SANS, fontSize: 9.5, color: "rgba(255,255,255,0.85)", marginBottom: 14 },
  ctaContacts: { flexDirection: "row", gap: 30 },
  ctaContact: { flex: 1 },
  ctaContactLabel: { fontFamily: SANS, fontSize: 7, color: "rgba(255,255,255,0.6)", letterSpacing: 1, marginBottom: 4 },
  ctaContactValue: { fontFamily: SANS_BOLD, fontSize: 11, color: C.white },

  // CTA secundario: salidas grupales con Naty (cierra todos los PDFs)
  ctaAltBox: { backgroundColor: C.greenL, borderRadius: 8, padding: 18, marginBottom: 14, borderWidth: 0.5, borderColor: C.borde },
  ctaAltEyebrow: { fontFamily: SANS, fontSize: 8, color: C.oroH, letterSpacing: 2, marginBottom: 6 },
  ctaAltTitle: { fontFamily: SERIF, fontSize: 16, color: C.verde, marginBottom: 6 },
  ctaAltText: { fontFamily: SANS, fontSize: 9, color: C.verdeM, marginBottom: 12, lineHeight: 1.5 },
  ctaAltContactLabel: { fontFamily: SANS, fontSize: 7, color: C.sec, letterSpacing: 1, marginBottom: 4 },
  ctaAltContactValue: { fontFamily: SANS_BOLD, fontSize: 11, color: C.verde },

  validityWarn: { backgroundColor: C.amberL, borderRadius: 5, padding: 10, marginBottom: 14 },
  validityWarnTitle: { fontFamily: SANS_BOLD, fontSize: 9, color: C.amberT, marginBottom: 3 },
  validityWarnText: { fontFamily: SANS, fontSize: 8.5, color: C.amberT, lineHeight: 1.4 },

  pageFooter: {
    position: "absolute", bottom: 18, left: 32, right: 32,
    flexDirection: "row", justifyContent: "space-between",
    paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.borde,
  },
  pageFooterText: { fontFamily: SANS_BOLD, fontSize: 8, color: C.txt },
  pageFooterRight: { fontFamily: SANS, fontSize: 8, color: C.sec },
});

// =============== TYPES ===============
export type QuotePDFProps = {
  quote: {
    code: string;
    client_name: string | null;
    client_phone: string | null;
    client_email: string | null;
    route_name: string | null;
    start_date: string | null;
    end_date: string | null;
    people: number | null;
    modality: string | null;
    total_eur: number;
    valid_until: string | null;
    notes: string | null;
  };
  route?: {
    days: number | null;
    nights: number | null;
    origin: string | null;
    destination: string | null;
    km: number | null;
    difficulty: string | null;
    modality: string | null;
  } | null;
  stages?: Array<{ day: number; from_place: string | null; to_place: string | null; km: number | null; accommodation: string | null }>;
  optionals?: Array<{ category: string; name: string; unit: string; price_cs: number }>;
  trm?: { eur_cop: number; date: string } | null;
  generatedAt?: Date;
  /** Buffer del cover photo (cargar con fs.readFileSync en server action) */
  coverImage?: Buffer | string;
  /** Suplementos para la nota debajo de los precios */
  seasonNote?: { high: number; easter: number };
  /**
   * Aclaración bajo las tarjetas de precio. La usa el cotizador público cuando la tarifa
   * es de un año anterior al de la salida ("precio de referencia, sujeto a confirmación").
   */
  priceNote?: string | null;
  /** Bloques de precio a mostrar (1 = solo pensión u hotel, 2 = ambos) */
  priceBlocks?: Array<{
    label: string;
    subLabel: string;
    pricePerPerson: number;
    isSelected: boolean;
  }>;
  /** Líneas de opcionales contratadas en esta cotización (van al resumen, sumadas al total) */
  selectedOptionals?: Array<{ description: string; quantity: number; unit_price: number; total: number }>;
  /**
   * Flota de alquiler a ofrecer en la página de opcionales (rutas en bici).
   * Solo llegan acá las bicis CON tarifa del año de salida: la que no tiene precio cargado
   * no se muestra, porque en un documento que va al cliente no se inventa una cifra.
   * Nada de esto suma al total; lo que se contrata viaja en `selectedBikes`.
   */
  bikeFleet?: Array<{
    bikeId: string;
    /** Gama: es lo que de verdad se contrata (el proveedor garantiza gama, no modelo). */
    categoryLabel: string;
    /** Modelo concreto, a título de referencia. */
    name: string;
    tagline: string | null;
    sizes: string[];
    sizesNote: string | null;
    luggage: string | null;
    /** Precio de venta Camino Sacro, por bicicleta y por toda la ruta. */
    priceCs: number;
    /** Días de alquiler que cubre esa tarifa. */
    days: number | null;
  }>;
  /**
   * Bicicletas ya contratadas en esta cotización (líneas `type='bike'`). Van al resumen de
   * inversión, sumadas al total igual que los opcionales, y disparan la nota de la fianza y
   * la política de cancelación propia del alquiler.
   * `categoryLabel`/`name` pueden venir en null si la bici salió del catálogo: ahí manda
   * `description`, que es el texto congelado en la línea al cotizar.
   */
  selectedBikes?: Array<{
    description: string;
    categoryLabel: string | null;
    name: string | null;
    days: number | null;
    quantity: number;
    unit_price: number;
    total: number;
    bikeId?: string | null;
  }>;
  /** Base = ruta + alojamiento (sin opcionales). Si no se pasa, se asume = total_eur */
  baseEur?: number;
  /** Suplemento de temporada aplicado (alta o Semana Santa). Aparece como línea propia en el resumen. */
  seasonSupplement?: { kind: "regular" | "high_season" | "easter"; total: number; perPerson: number };
  /**
   * Desglose de habitaciones para grupos con reparto mixto (cotizador web:
   * pares en doble + el impar en individual). Si viene, el resumen de inversión
   * pinta una línea por tipo de habitación en vez de la línea única por persona.
   * Tarifas por persona en EUR.
   */
  roomBreakdown?: {
    tipo: "pension" | "hotel";
    dobles: number;
    individuales: number;
    tarifa_doble: number;
    tarifa_single: number;
  } | null;
  /**
   * Extras contratados que personalizan el itinerario: noches extra en Santiago y tours.
   * Extienden el itinerario, el conteo de días/noches y el rango de fechas del PDF.
   */
  itineraryExtras?: {
    extraNights: number;
    extraNightTipo: "pension" | "hotel";
    tours: string[];
  } | null;
};

// =============== HELPERS ===============
const fmtEur = (n: number) =>
  new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n);

const MES_NUM_TO_ES: Record<number, string> = {
  1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
  7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
};

function fechaLargaCustom(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return `${dt.getDate()} de ${MES_NUM_TO_ES[dt.getMonth() + 1]} ${dt.getFullYear()}`;
}

function fechaCorta(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return `${String(dt.getDate()).padStart(2, "0")}`;
}

const MES_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Fecha del día N del itinerario (día 1 = fecha de inicio). Formato corto "28 sep".
function fechaDia(start: string | null, dayOffset: number): string {
  if (!start) return "";
  const d = new Date(start + "T00:00:00");
  d.setDate(d.getDate() + dayOffset);
  return `${d.getDate()} ${MES_ABBR[d.getMonth()]}`;
}

// Suma días a una fecha ISO y devuelve ISO (para el rango de portada con noches extra).
function sumarDiasIso(start: string | null, dias: number): string | null {
  if (!start) return null;
  const d = new Date(start + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function buildDateLine(start: string | null, end: string | null): string {
  if (!start) return "";
  const ds = new Date(start + "T00:00:00");
  if (!end) {
    return `${ds.getDate()} de ${MES_NUM_TO_ES[ds.getMonth() + 1]} ${ds.getFullYear()}`;
  }
  const de = new Date(end + "T00:00:00");
  if (ds.getMonth() === de.getMonth() && ds.getFullYear() === de.getFullYear()) {
    return `${ds.getDate()} – ${de.getDate()} de ${MES_NUM_TO_ES[ds.getMonth() + 1]} ${ds.getFullYear()}`;
  }
  if (ds.getFullYear() === de.getFullYear()) {
    return `${ds.getDate()} de ${MES_NUM_TO_ES[ds.getMonth() + 1]} – ${de.getDate()} de ${MES_NUM_TO_ES[de.getMonth() + 1]} ${ds.getFullYear()}`;
  }
  return `${fechaLargaCustom(start)} – ${fechaLargaCustom(end)}`;
}

function parseModality(modality: string | null): { tipoAlojamiento: string; habitacion: string; regimen: string; acomodacion: string } {
  const m = (modality || "").toLowerCase();
  let tipoAlojamiento = "Pensión";
  let habitacion = "Doble";
  if (m.includes("hotel")) tipoAlojamiento = "Hotel";
  if (m.includes("single") || m.includes("individual")) habitacion = "Individual";
  if (m.includes("triple")) habitacion = "Triple";
  return {
    tipoAlojamiento,
    habitacion,
    regimen: "Aloj. + Desayuno",
    acomodacion: "Privada",
  };
}

function buildItinerarioStages(
  stages: QuotePDFProps["stages"],
  tipoAlojamiento: string,
  origin: string,
  destination: string,
  startDate: string | null,
  extras: QuotePDFProps["itineraryExtras"],
): Array<{ day: number; fecha: string; etapa: string; alojamiento: string }> {
  if (!stages || stages.length === 0) return [];
  const walking = [...stages]
    .filter((st) => (Number(st.km) || 0) > 0)
    .sort((a, b) => a.day - b.day);
  if (walking.length === 0) return [];

  const firstOrigin = origin || walking[0].from_place || "—";
  const lastDest = destination || walking[walking.length - 1].to_place || "Santiago de Compostela";

  const rows: Array<{ day: number; fecha: string; etapa: string; alojamiento: string }> = [];
  const push = (day: number, etapa: string, alojamiento: string) =>
    rows.push({ day, fecha: fechaDia(startDate, day - 1), etapa, alojamiento });

  push(1, `Llegada a ${firstOrigin}`, `${tipoAlojamiento} ${firstOrigin}`);

  walking.forEach((st, idx) => {
    const km = Number(st.km) || 0;
    const tramo = st.from_place && st.to_place
      ? `${st.from_place} → ${st.to_place}`
      : (st.to_place || st.from_place || "—");
    push(
      idx + 2,
      `${tramo} (${Math.round(km)} km)`,
      st.accommodation || (st.to_place ? `${tipoAlojamiento} ${st.to_place}` : "—"),
    );
  });

  // Noches extra en Santiago: una fila por noche. Los tours contratados ocupan esos días
  // libres; si sobran tours, se agrupan en la última fila libre.
  const extraNights = extras?.extraNights ?? 0;
  const tours = extras?.tours ?? [];
  const extraLabel = extras?.extraNightTipo === "hotel" ? "Hotel" : "Pensión";
  const destCorto = destination || lastDest;
  for (let i = 0; i < extraNights; i++) {
    let etapa: string;
    if (i < extraNights - 1) {
      etapa = tours[i] || `Día libre en ${destCorto}`;
    } else {
      const resto = tours.slice(i);
      etapa = resto.length > 0 ? resto.join(" · ") : `Día libre en ${destCorto}`;
    }
    push(walking.length + 2 + i, etapa, `${extraLabel} ${destCorto}`);
  }

  // Fin de servicios. Si hay tours pero ninguna noche extra (0 días libres), se anexan
  // al texto del Fin para no inventar días de estadía.
  const finDay = walking.length + 2 + extraNights;
  const finEtapa = extraNights === 0 && tours.length > 0
    ? `Fin de servicios en ${lastDest} · ${tours.join(" · ")}`
    : `Fin de servicios en ${lastDest}`;
  push(finDay, finEtapa, "—");

  return rows;
}

const INCLUIDO_DEFAULT = (n: number) => [
  `${n} noches en acomodación privada con baño privado (doble o individual según opción)`,
  `${n} desayunos incluidos`,
  "Traslado de mochilas entre etapas — máx. 15 kg por persona, exclusivamente en las etapas del itinerario",
  "Credencial del peregrino",
  "Asistencia telefónica 24h durante el Camino",
  "Seguro de viaje — coberturas médicas y de responsabilidad civil",
  "Guía del Camino en PDF y mapas",
  "Guía del peregrino",
];
const NO_INCLUIDO_DEFAULT = [
  "Traslado desde y hasta tu lugar de origen",
  "Traslado hasta el punto de inicio del Camino",
  "Cualquier servicio no especificado en servicios incluidos",
  "Tasas turísticas vigentes — pago directo en el alojamiento según población y categoría",
];

const CAT_TITLE: Record<string, string> = {
  seguro: "SEGUROS",
  noche_extra: "ALOJAMIENTO EXTRA EN SANTIAGO",
  meal: "COMIDAS",
  transfer: "TRASLADOS PRIVADOS DESDE SANTIAGO (HASTA 4 PAX)",
  tour: "TOURS Y EXPERIENCIAS",
  gift: "RECUERDOS Y EXPERIENCIAS GASTRONÓMICAS",
};
const CAT_ORDER = ["seguro", "noche_extra", "meal", "transfer", "tour", "gift"];

// =============== COMPONENT ===============
export function QuotePDF({ quote, route, stages, optionals, trm, generatedAt = new Date(), coverImage, seasonNote, priceNote, priceBlocks, selectedOptionals, bikeFleet, selectedBikes, baseEur, seasonSupplement, roomBreakdown, itineraryExtras }: QuotePDFProps) {
  const total = Number(quote.total_eur) || 0;
  const base = Number(baseEur) || total;
  const people = quote.people || 1;
  const perPerson = base / Math.max(1, people); // unitario de la ruta sin opcionales
  const modInfo = parseModality(quote.modality);
  const optionalsLines = selectedOptionals || [];
  const optionalsSum = optionalsLines.reduce((s, l) => s + (Number(l.total) || 0), 0);

  // Bicis: la flota que se ofrece y las que ya se contrataron.
  const fleet = bikeFleet || [];
  const bikeLines = selectedBikes || [];
  const bikesSum = bikeLines.reduce((s, l) => s + (Number(l.total) || 0), 0);
  // Unidades de bici = fianzas. La fianza es POR BICICLETA, no por línea ni por persona.
  const bikeUnits = bikeLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const fianzaTotal = bikeUnits * FIANZA_POR_BICI_EUR;
  const chosenBikeIds = new Set(bikeLines.map((l) => l.bikeId).filter(Boolean) as string[]);
  // Cualquier rastro de bici (flota ofrecida o contratada) enciende las condiciones del
  // alquiler en la última página: quien todavía está eligiendo también necesita conocerlas
  // antes de decidir, porque la cancelación del alquiler no la cubre el seguro de anulación.
  const conBici = fleet.length > 0 || bikeLines.length > 0;

  const origin = route?.origin || "";
  const destination = route?.destination || "Santiago de Compostela";
  // Etapas caminadas = filas con km > 0 (excluye filas Llegada/Fin que pudieran estar en DB)
  const stagesCount = (stages || []).filter((s) => (Number(s.km) || 0) > 0).length;
  // El itinerario mostrado tiene N+2 filas (Llegada + N etapas + Fin). DÍAS y NOCHES se calculan
  // desde stagesCount para que el cuadro de stats coincida con la tabla de itinerario del PDF.
  // Las noches extra en Santiago suman a ambos conteos.
  const extraNights = itineraryExtras?.extraNights ?? 0;
  const days = (stagesCount > 0 ? stagesCount + 2 : (route?.days ?? 0)) + extraNights;
  const nights = (stagesCount > 0 ? stagesCount + 1 : (route?.nights ?? 0)) + extraNights;
  const km = route?.km || (stages || []).reduce((a, b) => a + (Number(b.km) || 0), 0);
  const difficulty = route?.difficulty || "Media";
  const modalityKind = (route?.modality === "bici") ? "EN BICI" : "A PIE";

  // El rango de fechas se calcula desde la duración mostrada (con noches extra), no desde
  // la end_date guardada, que no incluye las noches extra. No muta el dato en la BD.
  const displayEndDate = quote.start_date && days > 0
    ? sumarDiasIso(quote.start_date, days - 1)
    : quote.end_date;
  const dateLine = buildDateLine(quote.start_date, displayEndDate);
  const subtituloRuta = "CAMINO DE SANTIAGO";

  // Desglose mixto solo cuando de verdad hay dobles E individuales; con un solo
  // tipo de habitación la línea única de siempre dice exactamente lo mismo.
  const mixto = roomBreakdown && roomBreakdown.dobles > 0 && roomBreakdown.individuales > 0 ? roomBreakdown : null;
  const tipoAlojMixto = mixto?.tipo === "hotel" ? "hotel" : "pensión";

  const itin = buildItinerarioStages(stages, modInfo.tipoAlojamiento, origin, destination, quote.start_date, itineraryExtras);

  // Optionals agrupados
  const optsByCat = new Map<string, NonNullable<typeof optionals>>();
  for (const o of optionals || []) {
    if (!optsByCat.has(o.category)) optsByCat.set(o.category, []);
    optsByCat.get(o.category)!.push(o);
  }

  const validezTexto = fechaLargaCustom(quote.valid_until);

  return (
    <Document author="Camino Sacro" title={`Cotización ${quote.code}`} subject={quote.route_name || "Camino de Santiago"}>
      {/* ============ COVER ============ */}
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
          <Text style={s.coverEyebrow}>{`COTIZACIÓN DE VIAJE · ${quote.code}`}</Text>
          <Text style={s.coverSubtitle}>{subtituloRuta}</Text>
          <Text style={s.coverTitle}>{quote.route_name || "Camino de Santiago"}</Text>
          {dateLine ? <Text style={s.coverDate}>{dateLine}</Text> : null}
          <View style={s.coverDivider} />
          <View style={s.coverInfoRow}>
            <View style={s.coverInfoCol}>
              <Text style={s.coverInfoLabel}>PEREGRINO</Text>
              <Text style={s.coverInfoValue}>{quote.client_name || "—"}</Text>
              {quote.client_phone ? <Text style={s.coverInfoSub}>{quote.client_phone}</Text> : null}
            </View>
            <View style={s.coverInfoCol}>
              <Text style={s.coverInfoLabel}>VÁLIDA HASTA</Text>
              <Text style={s.coverInfoValue}>{validezTexto}</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ============ DETAIL ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter quoteCode={quote.code} />

        <Text style={s.detailEyebrow}>{subtituloRuta}</Text>
        <Text style={s.detailTitle}>{quote.route_name}</Text>
        <Text style={s.detailSubtitle}>
          {origin && destination ? `${origin} → ${destination}` : (quote.route_name || "")}
          {dateLine ? `  ·  ${dateLine}` : ""}
        </Text>

        {/* Stats grid */}
        <View style={s.statsGrid}>
          <Stat value={String(days || "—")} suffix="días" label={`${nights} NOCHES`} />
          <Stat value={km ? String(Math.round(km)) : "—"} suffix="km" label={modalityKind} />
          <Stat value={String(stagesCount || "—")} label="ETAPAS" />
          <Stat value={difficulty} label="DIFICULTAD" />
        </View>

        <View style={s.badgeRow}>
          <View style={[s.badge, s.badgeMochila]}>
            <Text style={s.badgeMochilaText}>{"✓  TRASLADO MOCHILA"}</Text>
          </View>
        </View>

        {/* Price boxes — dinámicos: 1 o 2 según haya en catálogo. El elegido va en verde. */}
        {priceBlocks && priceBlocks.length > 0 && (
          <View style={s.priceRow}>
            {/* Bloque único: espaciadores flex a los lados centran la tarjeta al ~60%.
                (Usar width:"%" sobre un hijo flex rompe el layout de react-pdf y corrompe
                los recuadros de stats/info de esta página.) */}
            {priceBlocks.length === 1 && <View style={{ flex: 1 }} />}
            {priceBlocks.map((b, i) => {
              const isDark = b.isSelected;
              const cardStyle = [
                s.priceCard,
                isDark ? s.priceCardDark : s.priceCardLight,
                ...(priceBlocks.length === 1 ? [{ flex: 3 }] : []),
              ];
              return (
                <View key={i} style={cardStyle}>
                  <Text style={[s.priceLabel, isDark ? s.priceLabelDark : s.priceLabelLight]}>{b.label}</Text>
                  <Text style={[s.priceSubLabel, isDark ? s.priceSubLabelDark : s.priceSubLabelLight]}>{b.subLabel}</Text>
                  <View style={s.priceMain}>
                    <Text style={[s.priceNum, isDark ? s.priceNumDark : s.priceNumLight]}>{fmtEur(b.pricePerPerson)}</Text>
                    <Text style={[s.priceCurr, isDark ? s.priceCurrDark : s.priceCurrLight]}>€</Text>
                  </View>
                  <Text style={[s.priceFooter, isDark ? s.priceFooterDark : s.priceFooterLight]}>precio por persona</Text>
                </View>
              );
            })}
            {priceBlocks.length === 1 && <View style={{ flex: 1 }} />}
          </View>
        )}

        {priceNote && <Text style={s.seasonNote}>{priceNote}</Text>}

        {seasonNote && (
          <Text style={s.seasonNote}>
            En caso de viajar en julio, agosto o septiembre se aplica un suplemento de +{seasonNote.high} €/persona. En Semana Santa: +{seasonNote.easter} €/persona.
          </Text>
        )}

        {/* Info row */}
        <View style={s.infoRow}>
          <View style={s.infoCol}><Text style={s.infoLabel}>ALOJAMIENTO</Text><Text style={s.infoValue}>{modInfo.tipoAlojamiento}</Text></View>
          <View style={s.infoCol}><Text style={s.infoLabel}>RÉGIMEN</Text><Text style={s.infoValue}>{modInfo.regimen}</Text></View>
          <View style={s.infoCol}><Text style={s.infoLabel}>ACOMODACIÓN</Text><Text style={s.infoValue}>{modInfo.acomodacion}</Text></View>
          <View style={s.infoCol}><Text style={s.infoLabel}>PERSONAS</Text><Text style={s.infoValue}>{people}</Text></View>
        </View>

        {/* Itinerario */}
        <Text style={s.h2}>Itinerario</Text>
        {itin.length > 0 ? (
          <>
            <View style={s.itinTableHead}>
              <Text style={[s.itinTH, s.itinTHDay]}>DÍA</Text>
              <Text style={[s.itinTH, s.itinTHFecha]}>FECHA</Text>
              <Text style={[s.itinTH, s.itinTHEtapa]}>ETAPA</Text>
              <Text style={[s.itinTH, s.itinTHAloj]}>ALOJAMIENTO</Text>
            </View>
            {itin.map((row) => (
              <View key={row.day} style={s.itinRow} wrap={false}>
                <Text style={s.itinDay}>{row.day}</Text>
                <Text style={s.itinFecha}>{row.fecha}</Text>
                <Text style={s.itinEtapa}>{row.etapa}</Text>
                <Text style={s.itinAloj}>{row.alojamiento}</Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={s.seasonNote}>Itinerario detallado en preparación. Te lo enviamos confirmado al reservar.</Text>
        )}
        <Text style={[s.seasonNote, { marginTop: 8 }]}>
          <Text style={{ fontFamily: SANS_BOLD, fontStyle: "normal" }}>Nota:</Text> esta cotización es informativa. Las etapas pueden ajustarse al momento de la reserva según la disponibilidad de alojamientos en cada localidad.
        </Text>
      </Page>

      {/* ============ SERVICIOS + RESUMEN + CONDICIONES ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter quoteCode={quote.code} />

        <Text style={s.h2}>Servicios incluidos y no incluidos</Text>
        <View style={s.servicesRow} wrap={false}>
          <View style={[s.serviceBox, s.serviceBoxIn]}>
            <Text style={[s.serviceTitle, s.serviceTitleIn]}>{`✓ ${nights} INCLUIDO`}</Text>
            {INCLUIDO_DEFAULT(nights).map((t, i) => (
              <View key={i} style={s.serviceItem}>
                <Text style={[s.serviceBullet, s.serviceBulletIn]}>•</Text>
                <Text style={s.serviceText}>{t}</Text>
              </View>
            ))}
          </View>
          <View style={[s.serviceBox, s.serviceBoxOut]}>
            <Text style={[s.serviceTitle, s.serviceTitleOut]}>✗ NO INCLUIDO</Text>
            {NO_INCLUIDO_DEFAULT.map((t, i) => (
              <View key={i} style={s.serviceItem}>
                <Text style={[s.serviceBullet, s.serviceBulletOut]}>•</Text>
                <Text style={s.serviceText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Alquiler de bicicletas ANTES de la tabla de opcionales genérica: en una ruta en bici
            es la única decisión que el peregrino tiene que tomar sí o sí, y la que más mueve el
            total. Detrás de seis categorías de seguros, tours y traslados se perdería. Además
            así la nota de cierre de los opcionales ("indícanos cuáles deseas al confirmar")
            queda al final cubriendo también a las bicis. */}
        {fleet.length > 0 && (
          <>
            <Text style={s.h2}>Alquiler de bicicletas</Text>
            <Text style={s.bikeIntro}>
              {bikeLines.length > 0
                ? "El precio es por bicicleta y cubre toda la ruta, con el equipamiento completo: portabultos, alforjas impermeables, kit de herramientas, bomba, cámara de repuesto y candado. La gama que ya contrataste aparece marcada y sumada en el resumen de inversión; el resto de la flota queda como referencia por si prefieres cambiarla antes de confirmar."
                : "El precio es por bicicleta y cubre toda la ruta, con el equipamiento completo: portabultos, alforjas impermeables, kit de herramientas, bomba, cámara de repuesto y candado. No está incluido en el total de esta cotización: indícanos la gama que prefieres al confirmar el viaje y te enviamos la cotización definitiva."}
            </Text>
            <View style={s.optTable}>
              <View style={s.optHeadRow}>
                <Text style={[s.optHead, { flex: 1 }]}>GAMA Y MODELO</Text>
                <Text style={[s.optHead, { width: 130 }]}>TALLAS · EQUIPAJE</Text>
                <Text style={[s.optHead, { width: 70, textAlign: "right" }]}>PRECIO</Text>
              </View>
              {fleet.map((b) => {
                const elegida = chosenBikeIds.has(b.bikeId);
                return (
                  <View key={b.bikeId} style={s.bikeRow} wrap={false}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={s.bikeCat}>{b.categoryLabel}</Text>
                      <Text style={s.bikeModel}>{b.tagline ? `${b.name} · ${b.tagline}` : b.name}</Text>
                      {elegida ? <Text style={s.bikeChosen}>✓ GAMA CONTRATADA EN ESTA COTIZACIÓN</Text> : null}
                    </View>
                    <View style={{ width: 130, paddingRight: 8 }}>
                      <Text style={s.bikeSpec}>
                        {b.sizes.length > 0 ? `Tallas ${b.sizes.join(" · ")}` : "Tallas según disponibilidad"}
                        {b.sizesNote ? ` (${b.sizesNote})` : ""}
                      </Text>
                      {b.luggage ? <Text style={s.bikeSpec}>{b.luggage}</Text> : null}
                    </View>
                    <View style={{ width: 70 }}>
                      <Text style={s.bikePrice}>{fmtEur(b.priceCs)} €</Text>
                      <Text style={s.bikeDays}>{b.days && b.days > 0 ? `${b.days} días de alquiler` : "por bicicleta"}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Estas cinco condiciones no son decorativas: la fianza es plata que el peregrino
                tiene que anticipar, y talla/casco/pedales cambian lo que recibe. Los textos
                salen de CONDICIONES_ALQUILER (dossier de Pilgrim), no se reescriben acá. */}
            {/* `wrap={false}`: sin esto la caja se parte al final de la página y el resto cae
                en la siguiente sin el título y con el fondo gris cortado, flotando encima de
                "Servicios opcionales". Prefiero un hueco al pie antes que una caja rota. */}
            <View style={s.bikeNoteBox} wrap={false}>
              <Text style={s.bikeNoteTitle}>CONDICIONES DEL ALQUILER</Text>
              {[
                CONDICIONES_ALQUILER.fianza,
                CONDICIONES_ALQUILER.casco,
                CONDICIONES_ALQUILER.talla,
                CONDICIONES_ALQUILER.modelo,
                CONDICIONES_ALQUILER.pedales,
              ].map((t, i) => (
                <View key={i} style={s.bikeNoteItem}>
                  <Text style={s.bikeNoteBullet}>•</Text>
                  <Text style={s.bikeNoteText}>{t}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {(optionals && optionals.length > 0) && (
          <>
            <Text style={s.h2}>Servicios opcionales</Text>
            <View style={s.optTable}>
              <View style={s.optHeadRow}>
                <Text style={[s.optHead, { flex: 1 }]}>SERVICIO</Text>
                <Text style={[s.optHead, { width: 100 }]}>UNIDAD</Text>
                <Text style={[s.optHead, { width: 60, textAlign: "right" }]}>PRECIO</Text>
              </View>
              {CAT_ORDER.map((cat) => {
                const items = optsByCat.get(cat);
                if (!items || items.length === 0) return null;
                return (
                  <View key={cat} wrap={false}>
                    <View style={s.optGroupRow}>
                      <Text style={s.optGroupTitle}>{CAT_TITLE[cat] || cat.toUpperCase()}</Text>
                    </View>
                    {items.map((it, idx) => (
                      <View key={idx} style={s.optRow}>
                        <Text style={s.optName}>{it.name}</Text>
                        <Text style={s.optUnit}>{it.unit}</Text>
                        <Text style={s.optPrice}>{fmtEur(Number(it.price_cs) || 0)} €</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
            <Text style={s.resumenNote}>Los servicios opcionales no están incluidos por defecto. Indícanos cuáles deseas al confirmar el viaje.</Text>
          </>
        )}

        {/* Resumen de inversión */}
        <Text style={s.h2}>Resumen de inversión</Text>
        <View style={s.resumenBox}>
          <View style={s.resumenTable}>
            <View style={s.resumenHeadRow}>
              <Text style={[s.resumenHead, s.resumenConcept]}>Concepto</Text>
              <Text style={[s.resumenHead, s.resumenUnit]}>Precio unit.</Text>
              <Text style={[s.resumenHead, s.resumenPpl]}>Cant.</Text>
              <Text style={[s.resumenHead, s.resumenTotal]}>Total</Text>
            </View>
            {mixto ? (
              <>
                {/* Reparto mixto (cotizador web): una línea por tipo de habitación. */}
                <View style={s.resumenLine}>
                  <View style={s.resumenLineConcept}>
                    <Text style={s.resumenLineConceptName}>{quote.route_name}</Text>
                    <Text style={s.resumenLineConceptSub}>
                      {mixto.dobles} hab. {mixto.dobles === 1 ? "doble" : "dobles"} {tipoAlojMixto} ({mixto.dobles * 2} personas) · {modInfo.regimen}
                    </Text>
                  </View>
                  <Text style={[s.resumenLineCell, s.resumenUnit]}>{fmtEur(mixto.tarifa_doble)} €</Text>
                  <Text style={[s.resumenLineCell, s.resumenPpl]}>×{mixto.dobles * 2}</Text>
                  <Text style={[s.resumenLineCell, s.resumenTotal, { fontFamily: SANS_BOLD }]}>{fmtEur(mixto.dobles * 2 * mixto.tarifa_doble)} €</Text>
                </View>
                <View style={s.resumenLine}>
                  <View style={s.resumenLineConcept}>
                    <Text style={s.resumenLineConceptName}>Habitación individual</Text>
                    <Text style={s.resumenLineConceptSub}>
                      {mixto.individuales} hab. individual {tipoAlojMixto} · {modInfo.regimen}
                    </Text>
                  </View>
                  <Text style={[s.resumenLineCell, s.resumenUnit]}>{fmtEur(mixto.tarifa_single)} €</Text>
                  <Text style={[s.resumenLineCell, s.resumenPpl]}>×{mixto.individuales}</Text>
                  <Text style={[s.resumenLineCell, s.resumenTotal, { fontFamily: SANS_BOLD }]}>{fmtEur(mixto.individuales * mixto.tarifa_single)} €</Text>
                </View>
              </>
            ) : (
              <View style={s.resumenLine}>
                <View style={s.resumenLineConcept}>
                  <Text style={s.resumenLineConceptName}>{quote.route_name}</Text>
                  <Text style={s.resumenLineConceptSub}>
                    Hab. {modInfo.habitacion.toLowerCase()} {modInfo.tipoAlojamiento.toLowerCase()} · {modInfo.regimen}
                  </Text>
                </View>
                <Text style={[s.resumenLineCell, s.resumenUnit]}>{fmtEur(perPerson)} €</Text>
                <Text style={[s.resumenLineCell, s.resumenPpl]}>×{people}</Text>
                <Text style={[s.resumenLineCell, s.resumenTotal, { fontFamily: SANS_BOLD }]}>{fmtEur(base)} €</Text>
              </View>
            )}
            {seasonSupplement && seasonSupplement.kind !== "regular" && seasonSupplement.total > 0 && (
              <View style={s.resumenLine}>
                <View style={s.resumenLineConcept}>
                  <Text style={s.resumenLineConceptName}>
                    {seasonSupplement.kind === "easter" ? "Suplemento Semana Santa" : "Suplemento temporada alta"}
                  </Text>
                  <Text style={s.resumenLineConceptSub}>
                    {seasonSupplement.kind === "easter" ? "Domingo de Ramos a Lunes de Pascua" : "Julio · Agosto · Septiembre"}
                  </Text>
                </View>
                <Text style={[s.resumenLineCell, s.resumenUnit]}>{fmtEur(seasonSupplement.perPerson)} €</Text>
                <Text style={[s.resumenLineCell, s.resumenPpl]}>×{people}</Text>
                <Text style={[s.resumenLineCell, s.resumenTotal, { fontFamily: SANS_BOLD }]}>{fmtEur(seasonSupplement.total)} €</Text>
              </View>
            )}
            {/* Bicis antes que los opcionales: es el servicio grande de una ruta en bici, no un
                extra menor. El subtítulo dice "Bicicleta seleccionada" y no "Servicio opcional"
                para que quede claro que ESA es la que se contrató y ya está dentro del total. */}
            {bikeLines.map((l, i) => (
              <View key={`bike-${i}`} style={s.resumenLine}>
                <View style={s.resumenLineConcept}>
                  <Text style={s.resumenLineConceptName}>
                    {l.categoryLabel ? `${l.categoryLabel} — ${l.name || ""}`.replace(/ — $/, "") : l.description}
                  </Text>
                  <Text style={s.resumenLineConceptSub}>
                    Bicicleta seleccionada{l.days && l.days > 0 ? ` · ${l.days} días de alquiler` : ""} · equipamiento incluido
                  </Text>
                </View>
                <Text style={[s.resumenLineCell, s.resumenUnit]}>{fmtEur(Number(l.unit_price) || 0)} €</Text>
                <Text style={[s.resumenLineCell, s.resumenPpl]}>×{Number(l.quantity) || 1}</Text>
                <Text style={[s.resumenLineCell, s.resumenTotal, { fontFamily: SANS_BOLD }]}>{fmtEur(Number(l.total) || 0)} €</Text>
              </View>
            ))}
            {optionalsLines.map((l, i) => (
              <View key={i} style={s.resumenLine}>
                <View style={s.resumenLineConcept}>
                  <Text style={s.resumenLineConceptName}>{l.description}</Text>
                  <Text style={s.resumenLineConceptSub}>Servicio opcional</Text>
                </View>
                <Text style={[s.resumenLineCell, s.resumenUnit]}>{fmtEur(Number(l.unit_price) || 0)} €</Text>
                <Text style={[s.resumenLineCell, s.resumenPpl]}>×{Number(l.quantity) || 1}</Text>
                <Text style={[s.resumenLineCell, s.resumenTotal, { fontFamily: SANS_BOLD }]}>{fmtEur(Number(l.total) || 0)} €</Text>
              </View>
            ))}
          </View>
          <View style={s.resumenTotalBlock}>
            <Text style={s.resumenTotalLabel}>Total cotización</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={s.resumenTotalNum}>{fmtEur(total)}</Text>
              <Text style={s.resumenTotalCurr}> €</Text>
            </View>
          </View>
          {/* La nota enumera lo que se agregó al total. Con bicis y opcionales a la vez se
              listan los dos conceptos ("Total incluye 2 bicicletas por X € y 3 servicios
              opcionales por Y €") en vez de mentir contando solo los opcionales. */}
          {bikeLines.length === 0 && optionalsLines.length === 0 ? (
            <Text style={s.resumenNote}>Los servicios opcionales no están incluidos. Indícanos cuáles deseas al confirmar.</Text>
          ) : (
            <Text style={s.resumenNote}>
              Total incluye {[
                bikeUnits > 0 ? `${bikeUnits} ${bikeUnits === 1 ? "bicicleta" : "bicicletas"} de alquiler por ${fmtEur(bikesSum)} €` : null,
                optionalsLines.length > 0 ? `${optionalsLines.length} ${optionalsLines.length === 1 ? "servicio opcional" : "servicios opcionales"} por ${fmtEur(optionalsSum)} €` : null,
              ].filter(Boolean).join(" y ")}.
            </Text>
          )}
        </View>

        {/* La fianza va FUERA del recuadro del total y con fondo ámbar: es plata que el
            peregrino tiene que anticipar pero que NO es parte del precio del viaje. Meterla
            dentro del total sería cobrarle de más; no avisarla sería una sorpresa en la salida. */}
        {bikeUnits > 0 && (
          <View style={s.fianzaBox} wrap={false}>
            <Text style={s.fianzaTitle}>
              Fianza del alquiler: {bikeUnits} × {fmtEur(FIANZA_POR_BICI_EUR)} € = {fmtEur(fianzaTotal)} € — adicional al total y reembolsable
            </Text>
            <Text style={s.fianzaText}>{CONDICIONES_ALQUILER.fianza}</Text>
          </View>
        )}

        {/* Condiciones */}
        <Text style={s.condTitle}>Condiciones generales</Text>
        <Text style={s.condText}>La reserva y contratación de cualquiera de los viajes ofrecidos por CAMINO SACRO supone la aceptación total de las condiciones generales de contratación.</Text>
        <Text style={s.condText}>La validez de los presupuestos realizados a los clientes es de 30 días desde la fecha de envío de la cotización, excepto en promociones temporales con fechas de finalización especificadas a través de la propia cotización, email o por vía telefónica, o en aquellas cotizaciones especiales donde se indique lo contrario por cuestiones de disponibilidad de alojamientos o de alguno de los servicios solicitados.</Text>
        <Text style={s.condText}>Los servicios opcionales no se incluyen por defecto en el precio total indicado, y será el cliente quien deba indicar expresamente los que desea contratar a la hora de confirmar el viaje.</Text>
        <Text style={s.condText}>Tras haber realizado todas las gestiones necesarias para su ruta, le enviaremos su documentación de viaje por email acompañada de su póliza de seguro de viaje. El período estimado para el envío de su documentación es de 30 días antes de la salida de su viaje. Hasta que haya sido confirmado el 100% del pago de su reserva (en el caso de pago fraccionado, hasta que recibamos el abono del 70% correspondiente a la segunda cuota), no recibirá en su email la documentación de viaje.</Text>
      </Page>

      {/* ============ CONDICIONES (cont) + CTA ============ */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <PageFooter quoteCode={quote.code} />

        <Text style={s.condTitle}>Confirmación y gestión de la reserva</Text>
        <Text style={s.condText}>En el momento de planificación del viaje no se gestionan reservas con los alojamientos; quedan sujetos a disponibilidad hasta que se realice el pago inicial.</Text>
        <Text style={s.condText}>Para confirmar el viaje es necesario abonar el 30% de la reserva (mínimo 150€ por persona — no reembolsables) en un plazo máximo de 7 días desde la confirmación. El importe restante deberá estar abonado 60 días antes de la fecha de inicio.</Text>
        <Text style={s.condText}>El titular deberá aportar los siguientes documentos de cada integrante del viaje: foto o copia del pasaporte, nombre completo, número de identidad y número de teléfono de contacto.</Text>

        <Text style={s.condTitle}>Modificación de la reserva</Text>
        <Text style={s.condText}>Cualquier modificación que altere el itinerario o las fechas una vez formalizada la reserva tendrá un coste de 100€ por persona en concepto de gastos de gestión, más la diferencia de precio entre la reserva original y la nueva opción.</Text>

        <Text style={s.condTitle}>Política de cancelación</Text>
        <Text style={[s.condText, { fontFamily: SANS_BOLD }]}>Con 60 o más días de antelación: reembolso excepto gastos de gestión de 150€ por persona (IVA incluido).</Text>
        <Text style={s.condText}>Sin cobertura de anulación contratada:</Text>
        <Text style={s.condText}>· 5% si la anulación es con más de 16 días de antelación</Text>
        <Text style={s.condText}>· 30% entre 15 y 11 días previos</Text>
        <Text style={s.condText}>· 50% entre 10 y 6 días previos</Text>
        <Text style={s.condText}>· Sin devolución dentro de los 5 días anteriores al inicio</Text>
        <Text style={s.condText}>· Sin devolución por no presentación o abandono durante el viaje</Text>

        {/* El alquiler de bici cancela con SUS plazos y el seguro de anulación no lo cubre.
            Va pegado a la política de cancelación del viaje para que se lea la diferencia, y
            solo cuando hay bici de por medio (ofrecida o contratada). */}
        {conBici && (
          <>
            <Text style={s.condSubtitle}>Cancelación del alquiler de bicicleta</Text>
            <Text style={s.condText}>{CONDICIONES_ALQUILER.cancelacion}</Text>
          </>
        )}

        <Text style={s.condTitle}>Plazos de pago según antelación de reserva</Text>
        <Text style={s.condSubtitle}>Más de 30 días antes del inicio:</Text>
        <Text style={s.condText}>30% del importe en un plazo máximo de 7 días desde la confirmación de reserva, y el 70% restante antes de los 30 días previos a la salida del viaje.</Text>
        <Text style={s.condSubtitle}>Entre 30 y 11 días de antelación:</Text>
        <Text style={s.condText}>100% del importe en las siguientes 72 horas al envío de la confirmación.</Text>
        <Text style={s.condSubtitle}>Entre 10 y 4 días antes del inicio:</Text>
        <Text style={s.condText}>Pago total obligatorio mediante tarjeta de crédito, débito o PayPal en las siguientes 24 horas al envío de la confirmación.</Text>
        <Text style={s.condSubtitle}>Reservas con menos de 72 horas:</Text>
        <Text style={s.condText}>Se contemplan como reservas de última hora, sujetas a disponibilidad y a las condiciones estipuladas para este supuesto.</Text>

        {/* CTA */}
        <View style={s.ctaBox} wrap={false}>
          <Text style={s.ctaEyebrow}>SIGUIENTE PASO</Text>
          <Text style={s.ctaTitle}>¿Listo para confirmar tu Camino?</Text>
          <Text style={s.ctaText}>Escríbele a Nico directamente — él confirma disponibilidad y te guía.</Text>
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

        <View style={s.validityWarn} wrap={false}>
          <Text style={s.validityWarnTitle}>Validez de esta cotización: hasta el {validezTexto}</Text>
          <Text style={s.validityWarnText}>Pasada esa fecha los precios pueden cambiar según disponibilidad. Te enviaremos la documentación de viaje y la póliza de seguro aproximadamente 30 días antes de la salida, una vez confirmado el 100% del pago.</Text>
          <Text style={[s.validityWarnText, { marginTop: 4 }]}>La asignación definitiva de alojamientos se entrega aproximadamente 1 mes antes de la fecha de inicio del viaje.</Text>
        </View>

        {/* CTA de cierre: salidas grupales con Naty */}
        <View style={s.ctaAltBox} wrap={false}>
          <Text style={s.ctaAltEyebrow}>OTRA FORMA DE VIVIRLO</Text>
          <Text style={s.ctaAltTitle}>¿Quieres hacerlo en grupo y con guía terapéutica?</Text>
          <Text style={s.ctaAltText}>Naty organiza salidas grupales del Camino de Santiago con acompañamiento terapéutico durante toda la ruta: caminas acompañado, a tu ritmo y con un propósito.</Text>
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

function PageFooter({ quoteCode }: { quoteCode: string }) {
  return (
    <View style={s.pageFooter} fixed>
      <Text style={s.pageFooterText}>Camino Sacro · {quoteCode}</Text>
      <Text style={s.pageFooterRight}>Respaldado por El Camino con Naty</Text>
    </View>
  );
}

function Stat({ value, suffix, label }: { value: string; suffix?: string; label: string }) {
  return (
    <View style={s.statBox}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={s.statValue}>{value}</Text>
        {suffix ? <Text style={s.statSuffix}> {suffix}</Text> : null}
      </View>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}
