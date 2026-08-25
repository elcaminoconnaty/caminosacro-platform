// Un número que para el scroll. La forma correcta para un solo dato no es un gráfico:
// es el número escrito grande (lo que la skill dataviz llama "hero number").

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow, Filete } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "dato-grande",
  nombre: "Dato grande",
  descripcion: "Un número enorme y su explicación. Para cifras que valen por sí solas.",
  formatos: ["4x5", "1x1", "1.91x1", "9x16"],
  usaFoto: true,
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
  const aj = resolverAjustes(f, slide.ajustes);
  const foto = slide.foto?.url ?? null;

  return (
    <div style={{ display: "flex", position: "relative", width: f.w, height: f.h, backgroundColor: PALETA.crema }}>
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
        <div style={{ position: "absolute", top: 0, left: 0, width: f.w, height: f.h, backgroundImage: aj.overlay }} />
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
          paddingTop: zs ? Math.max(m, zs.arriba) : m,
          paddingBottom: zs ? Math.max(m, zs.abajo) : m,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Cabecera w={w} sobreOscuro={!!foto} />
          {v.eyebrow ? (
            <Eyebrow w={w} color={foto ? undefined : PALETA.doradoOscuro}>
              {v.eyebrow}
            </Eyebrow>
          ) : (
            <span />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: u(18, w) }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: u(14, w) }}>
            <span
              style={{
                fontFamily: TIPO.display,
                fontWeight: 700,
                fontSize: aj.ut(compacto ? 150 : ESCALA.numeroGigante),
                color: foto ? PALETA.blanco : PALETA.bosque,
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
                  fontSize: aj.ut(compacto ? 46 : 66),
                  color: foto ? PALETA.dorado : PALETA.doradoOscuro,
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
                fontSize: aj.ut(compacto ? ESCALA.cuerpoS : ESCALA.cuerpoXL),
                color: foto ? BLANCO.alto : PALETA.tinta,
                lineHeight: 1.35,
              }}
            >
              {v.bajada}
            </span>
          ) : null}
        </div>

        <Pie w={w} sobreOscuro={!!foto} />
      </div>
    </div>
  );
}
