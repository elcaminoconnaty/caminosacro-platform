// Objeción en dos mitades. La bicromía sale del PDF de cotización: la caja rosa del
// "no incluido" y la verde del "incluido". Acá el rosa es el mito y el verde la realidad.

import { PALETA, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow } from "./_lockups";

// Los mismos valores que usa src/lib/quotePdf.tsx para incluido / no incluido.
const ROSA_FONDO = "#fdf2f2";
const ROSA_TEXTO = "#9c2424";
const VERDE_FONDO = "#eef3eb";
const VERDE_TEXTO = "#27500A";

export const definicion: DefinicionPlantilla = {
  id: "mito-realidad",
  nombre: "Mito y realidad",
  descripcion: "Una objeción y su respuesta, en dos mitades. Para las preguntas que más se repiten.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: false,
  rol: "cuerpo",
  campos: [
    { id: "mito", etiqueta: "Lo que se cree", tipo: "textarea", requerido: true, maxLargo: 110, porDefecto: "En el Camino hay que dormir en albergues compartidos." },
    { id: "realidad", etiqueta: "Lo que es", tipo: "textarea", requerido: true, maxLargo: 180, porDefecto: "Con nosotros duermes en hotel con baño privado cada noche y comes rico. El mismo Camino, descansando de verdad." },
  ],
};

function Mitad({
  w,
  rotulo,
  texto,
  fondo,
  colorRotulo,
  grande,
}: {
  w: number;
  rotulo: string;
  texto: string;
  fondo: string;
  colorRotulo: string;
  grande?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: u(14, w),
        width: "100%",
        borderRadius: u(MEDIDAS.radioCaja, w),
        backgroundColor: fondo,
        padding: u(34, w),
      }}
    >
      <span
        style={{
          fontFamily: TIPO.cuerpo,
          fontWeight: 700,
          fontSize: u(ESCALA.eyebrow, w),
          color: colorRotulo,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        {rotulo}
      </span>
      <span
        style={{
          fontFamily: grande ? TIPO.display : TIPO.cuerpo,
          fontWeight: grande ? 700 : 400,
          fontSize: u(grande ? 42 : ESCALA.cuerpo, w),
          color: PALETA.tinta,
          lineHeight: grande ? 1.15 : 1.45,
        }}
      >
        {texto}
      </span>
    </div>
  );
}

export function MitoRealidad({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const zs = f.zonaSegura;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: f.w,
        height: f.h,
        backgroundColor: PALETA.blanco,
        paddingLeft: m,
        paddingRight: m,
        paddingTop: zs ? Math.max(m, zs.arriba) : m,
        paddingBottom: zs ? Math.max(m, zs.abajo) : m,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Cabecera w={w} sobreOscuro={false} />
        <Eyebrow w={w} color={PALETA.doradoOscuro}>Se dice por ahí</Eyebrow>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: u(20, w), width: "100%" }}>
        <Mitad w={w} rotulo="Lo que se cree" texto={v.mito ?? ""} fondo={ROSA_FONDO} colorRotulo={ROSA_TEXTO} />
        <Mitad w={w} rotulo="Lo que es" texto={v.realidad ?? ""} fondo={VERDE_FONDO} colorRotulo={VERDE_TEXTO} grande />
      </div>

      <Pie w={w} sobreOscuro={false} />
    </div>
  );
}
