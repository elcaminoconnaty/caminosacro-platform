// El pilar estrella de la estrategia: un consejo útil y concreto.
// La voz pide que el VALOR vaya primero y que la autoridad se muestre, no se diga.

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "tip-numerado",
  nombre: "Consejo numerado",
  descripcion: "Un consejo práctico del Camino, con su número. El slide de cuerpo más usado.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: false,
  rol: "cuerpo",
  campos: [
    { id: "numero", etiqueta: "Número", tipo: "texto", maxLargo: 2, porDefecto: "1" },
    { id: "titular", etiqueta: "Titular", tipo: "texto", requerido: true, maxLargo: 48, porDefecto: "Nunca estrenes el calzado" },
    {
      id: "cuerpo",
      etiqueta: "Consejo",
      tipo: "textarea",
      maxLargo: 260,
      porDefecto:
        "El 90% de las molestias del Camino son ampollas. Calzado ya domado, calcetines sin costuras y secar bien los pies en cada parada: es lo que más se agradece al cuarto día.",
    },
  ],
};

export function TipNumerado({ f, slide }: { f: Formato; slide: Slide }) {
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
        backgroundColor: PALETA.crema,
        paddingLeft: m,
        paddingRight: m,
        paddingTop: zs ? Math.max(m, zs.arriba) : m,
        paddingBottom: zs ? Math.max(m, zs.abajo) : m,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Cabecera w={w} sobreOscuro={false} />
        <Eyebrow w={w} color={PALETA.doradoOscuro}>Consejo</Eyebrow>
      </div>

      <div style={{ display: "flex", gap: u(28, w), alignItems: "flex-start" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: u(88, w),
            height: u(88, w),
            borderRadius: u(44, w),
            backgroundColor: PALETA.bosque,
          }}
        >
          <span
            style={{
              fontFamily: TIPO.display,
              fontWeight: 700,
              fontSize: u(48, w),
              color: PALETA.dorado,
            }}
          >
            {v.numero ?? ""}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: u(16, w), flex: 1 }}>
          <span
            style={{
              fontFamily: TIPO.display,
              fontWeight: 700,
              fontSize: u(ESCALA.subtitulo, w),
              color: PALETA.bosque,
              lineHeight: 1.1,
            }}
          >
            {v.titular ?? ""}
          </span>
          <span
            style={{
              fontFamily: TIPO.cuerpo,
              fontSize: u(ESCALA.cuerpo, w),
              color: PALETA.tinta,
              lineHeight: 1.45,
            }}
          >
            {v.cuerpo ?? ""}
          </span>
        </div>
      </div>

      <Pie w={w} sobreOscuro={false} />
    </div>
  );
}
