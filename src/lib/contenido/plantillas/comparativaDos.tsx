// Dos columnas genéricas enfrentadas: NO precios (eso ya lo hace comparativa-precio),
// sino cualquier disyuntiva del Camino — albergue vs hotel, mochila vs maleta, verano vs
// otoño. Reusa la maqueta bicromía de mito-realidad (rosa/verde del PDF de cotización)
// pero en horizontal y con texto libre en las dos mitades, no una etiqueta fija.

import { PALETA, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow } from "./_lockups";

// Los mismos valores que quotePdf.tsx / mito-realidad para incluido / no incluido.
const ROSA_FONDO = "#fdf2f2";
const ROSA_TEXTO = "#9c2424";
const VERDE_FONDO = "#eef3eb";
const VERDE_TEXTO = "#27500A";

export const definicion: DefinicionPlantilla = {
  id: "comparativa-dos",
  nombre: "Comparativa (dos opciones)",
  descripcion: "Dos opciones enfrentadas, sin precios: albergue vs hotel, mochila vs maleta, verano vs otoño.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: true,
  rol: "cuerpo",
  campos: [
    { id: "titular", etiqueta: "Titular", tipo: "texto", maxLargo: 46, porDefecto: "Albergue vs hotel" },
    { id: "etiqueta_a", etiqueta: "Etiqueta A", tipo: "texto", requerido: true, maxLargo: 24, porDefecto: "Albergue compartido" },
    {
      id: "texto_a",
      etiqueta: "Texto A",
      tipo: "textarea",
      maxLargo: 140,
      porDefecto: "Literas compartidas, horarios fijos y sin garantía de descansar bien tras una etapa larga.",
    },
    { id: "etiqueta_b", etiqueta: "Etiqueta B", tipo: "texto", requerido: true, maxLargo: 24, porDefecto: "Hotel con nosotros" },
    {
      id: "texto_b",
      etiqueta: "Texto B",
      tipo: "textarea",
      maxLargo: 140,
      porDefecto: "Baño privado cada noche, tu maleta ya esperándote y comer rico. El mismo Camino, descansando de verdad.",
    },
  ],
};

function Columna({
  w,
  ut,
  etiqueta,
  texto,
  fondo,
  colorEtiqueta,
  apilada,
}: {
  w: number;
  ut: (n: number) => number;
  etiqueta: string;
  texto: string;
  fondo: string;
  colorEtiqueta: string;
  /** Apilada (columna): alto natural, según el contenido. Lado a lado: mismo ancho. */
  apilada: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: u(16, w),
        // En fila, flex:1 reparte el ancho por igual. Apiladas, flex:1 forzaría a las dos
        // cajas a la MISMA altura (partiendo el alto disponible) aunque el texto de cada
        // una mida distinto, y el sobrante se desborda fuera de la caja — el bug que
        // apareció al probar "verano vs otoño" con textos de largo distinto. Apiladas van
        // sin flex, con alto natural.
        ...(apilada ? { width: "100%" } : { flex: 1 }),
        borderRadius: u(MEDIDAS.radioCaja, w),
        backgroundColor: fondo,
        padding: u(30, w),
      }}
    >
      <span
        style={{
          fontFamily: TIPO.cuerpo,
          fontWeight: 700,
          fontSize: ut(ESCALA.eyebrow),
          color: colorEtiqueta,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {etiqueta}
      </span>
      <span
        style={{
          fontFamily: TIPO.cuerpo,
          fontSize: ut(ESCALA.cuerpoS),
          color: PALETA.tinta,
          lineHeight: 1.4,
        }}
      >
        {texto}
      </span>
    </div>
  );
}

export function ComparativaDos({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const zs = f.zonaSegura;
  const aj = resolverAjustes(f, slide.ajustes);
  const foto = slide.foto?.url ?? null;
  const veloPropio = slide.ajustes?.velo != null;
  // En vertical las dos columnas apiladas se leen mejor que apretadas lado a lado.
  const apilar = f.h > f.w * 1.2;

  return (
    <div style={{ display: "flex", position: "relative", width: f.w, height: f.h, backgroundColor: PALETA.blanco }}>
      {foto ? (
        <img
          src={foto}
          width={f.w}
          height={f.h}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: f.w,
            height: f.h,
            objectFit: "cover",
            objectPosition: aj.posicionFoto,
            ...(aj.zoomFoto ? { transform: aj.zoomFoto } : {}),
          }}
        />
      ) : null}
      {foto ? (
        // Las dos columnas ya tapan la foto donde va el texto; el velo se ve en la
        // cabecera, el titular y el pie, que sí van directos sobre la imagen.
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: f.w,
            height: f.h,
            ...(veloPropio ? { backgroundImage: aj.overlay } : { backgroundColor: "rgba(26,58,42,0.72)" }),
          }}
        />
      ) : null}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          width: f.w,
          height: f.h,
          paddingLeft: m,
          paddingRight: m,
          paddingTop: zs ? Math.max(m, u(zs.arriba, w)) : m,
          paddingBottom: zs ? Math.max(m, u(zs.abajo, w)) : m,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Cabecera w={w} sobreOscuro={!!foto} />
          <Eyebrow w={w} color={foto ? undefined : PALETA.bosqueMedio}>Dos formas de vivirlo</Eyebrow>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: u(24, w), width: "100%" }}>
          {v.titular ? (
            <span
              style={{
                fontFamily: TIPO.display,
                fontWeight: 700,
                fontSize: aj.ut(ESCALA.subtitulo),
                color: foto ? PALETA.blanco : PALETA.bosque,
                lineHeight: 1.1,
              }}
            >
              {v.titular}
            </span>
          ) : null}
          <div style={{ display: "flex", flexDirection: apilar ? "column" : "row", gap: u(18, w), width: "100%" }}>
            <Columna w={w} ut={aj.ut} etiqueta={v.etiqueta_a ?? ""} texto={v.texto_a ?? ""} fondo={ROSA_FONDO} colorEtiqueta={ROSA_TEXTO} apilada={apilar} />
            <Columna w={w} ut={aj.ut} etiqueta={v.etiqueta_b ?? ""} texto={v.texto_b ?? ""} fondo={VERDE_FONDO} colorEtiqueta={VERDE_TEXTO} apilada={apilar} />
          </div>
        </div>

        <Pie w={w} sobreOscuro={!!foto} />
      </div>
    </div>
  );
}
