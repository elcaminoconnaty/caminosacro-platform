// Objeción en dos mitades. La bicromía sale del PDF de cotización: la caja rosa del
// "no incluido" y la verde del "incluido". Acá el rosa es el mito y el verde la realidad.

import { PALETA, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import { resolverAjustes } from "../ajustes";
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
  usaFoto: true,
  rol: "cuerpo",
  campos: [
    { id: "mito", etiqueta: "Lo que se cree", tipo: "textarea", requerido: true, maxLargo: 110, porDefecto: "En el Camino hay que dormir en albergues compartidos." },
    { id: "realidad", etiqueta: "Lo que es", tipo: "textarea", requerido: true, maxLargo: 180, porDefecto: "Con nosotros duermes en hotel con baño privado cada noche y comes rico. El mismo Camino, descansando de verdad." },
  ],
};

// Las cajas de "Lo que se cree" / "Lo que es" son sólidas a propósito: aunque el slide
// lleve foto de fondo, estas cajas la tapan por completo y su contraste no cambia. Solo
// `ut` (el tamaño de letra) responde a los ajustes; el resto de la maqueta es fija.
function Mitad({
  w,
  ut,
  rotulo,
  texto,
  fondo,
  colorRotulo,
  grande,
}: {
  w: number;
  ut: (n: number) => number;
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
          fontSize: ut(ESCALA.eyebrow),
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
          fontSize: ut(grande ? 42 : ESCALA.cuerpo),
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
  const aj = resolverAjustes(f, slide.ajustes);
  const foto = slide.foto?.url ?? null;
  const veloPropio = slide.ajustes?.velo != null;

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
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: f.w,
            height: f.h,
            // Las cajas rosa/verde ya tapan la foto donde importa; esto solo se ve en la
            // cabecera, el pie y los huecos entre cajas. Mismo criterio que las demás:
            // velo plano fuerte por defecto, degradado de marca solo si Nico lo pidió.
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
          <Eyebrow w={w} color={foto ? undefined : PALETA.bosqueMedio}>Se dice por ahí</Eyebrow>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: u(20, w), width: "100%" }}>
          <Mitad w={w} ut={aj.ut} rotulo="Lo que se cree" texto={v.mito ?? ""} fondo={ROSA_FONDO} colorRotulo={ROSA_TEXTO} />
          <Mitad w={w} ut={aj.ut} rotulo="Lo que es" texto={v.realidad ?? ""} fondo={VERDE_FONDO} colorRotulo={VERDE_TEXTO} grande />
        </div>

        <Pie w={w} sobreOscuro={!!foto} />
      </div>
    </div>
  );
}
