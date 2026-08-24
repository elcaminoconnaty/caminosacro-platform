// Un número que para el scroll. La forma correcta para un solo dato no es un gráfico:
// es el número escrito grande (lo que la skill dataviz llama "hero number").

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow, Filete } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "dato-grande",
  nombre: "Dato grande",
  descripcion: "Un número enorme y su explicación. Para cifras que valen por sí solas.",
  formatos: ["4x5", "1x1", "1.91x1", "9x16"],
  usaFoto: false,
  rol: "cuerpo",
  campos: [
    { id: "eyebrow", etiqueta: "Antetítulo", tipo: "texto", maxLargo: 30, porDefecto: "El dato" },
    { id: "numero", etiqueta: "Número", tipo: "texto", requerido: true, maxLargo: 8, porDefecto: "100" },
    { id: "unidad", etiqueta: "Unidad", tipo: "texto", maxLargo: 12, porDefecto: "km" },
    {
      id: "bajada",
      etiqueta: "Explicación",
      tipo: "textarea",
      maxLargo: 130,
      porDefecto: "Es lo mínimo que hay que caminar para recibir la Compostela en Santiago.",
    },
  ],
};

export function DatoGrande({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const zs = f.zonaSegura;
  const compacto = f.h < 700;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: f.w,
        height: f.h,
        backgroundColor: PALETA.crema,
        paddingLeft: m,
        paddingRight: m,
        paddingTop: zs ? Math.max(m, zs.arriba) : m,
        paddingBottom: zs ? Math.max(m, zs.abajo) : m,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Cabecera w={w} sobreOscuro={false} />
        {v.eyebrow ? <Eyebrow w={w} color={PALETA.doradoOscuro}>{v.eyebrow}</Eyebrow> : <span />}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: u(18, w) }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: u(14, w) }}>
          <span
            style={{
              fontFamily: TIPO.display,
              fontWeight: 700,
              fontSize: u(compacto ? 150 : ESCALA.numeroGigante, w),
              color: PALETA.bosque,
              lineHeight: 0.86,
            }}
          >
            {v.numero ?? ""}
          </span>
          {v.unidad ? (
            <span
              style={{
                fontFamily: TIPO.display,
                fontWeight: 700,
                fontSize: u(compacto ? 46 : 66, w),
                color: PALETA.doradoOscuro,
              }}
            >
              {v.unidad}
            </span>
          ) : null}
        </div>
        <Filete w={w} ancho={200} color={PALETA.dorado} />
        {v.bajada ? (
          <span
            style={{
              fontFamily: TIPO.cuerpo,
              fontSize: u(compacto ? ESCALA.cuerpoS : ESCALA.cuerpoXL, w),
              color: PALETA.tinta,
              lineHeight: 1.35,
            }}
          >
            {v.bajada}
          </span>
        ) : null}
      </div>

      <Pie w={w} sobreOscuro={false} />
    </div>
  );
}
