// Barras horizontales de magnitud, hechas con DIVS y no con SVG.
//
// Por qué divs: Satori rasteriza un <svg> anidado con la base de fuentes de resvg, no con
// las que le pasamos, así que cualquier <text> dentro saldría con una tipografía ajena a
// la marca. Con flexbox el problema no existe y los rótulos son texto de Satori normal.
//
// Decisiones de visualización (validadas con el validador de paleta de la skill dataviz):
//   - UNA sola serie ⇒ un solo tono. La magnitud ya la codifica el largo de la barra;
//     pintar cada barra de un color distinto sería inventar categorías que no existen.
//   - El tono es dorado sobre bosque. El verde claro #3d7a52 quedó DESCARTADO: contra el
//     fondo bosque da 2.44:1 de contraste y "lee gris" (falla el piso de croma).
//   - Rótulo directo en todas las barras: esto es una imagen fija de Instagram, no hay
//     hover posible, y son pocas barras.
//   - Sin rejilla ni ejes: en una pieza social son ruido; el valor va escrito.

import { PALETA, BLANCO, TIPO, u } from "../marca";

export type Barra = { etiqueta: string; valor: number; sufijo?: string };

export function Barras({
  datos,
  w,
  ut,
  altoBarra = 30,
  separacion = 14,
}: {
  datos: Barra[];
  w: number;
  /**
   * Tamaño de letra ya escalado por la perilla `escalaTexto` del slide (ver
   * `resolverAjustes` en `ajustes.ts`). Opcional y con `u(·, w)` de respaldo para que
   * nada rompa si algún día hay una segunda llamada sin ajustes a mano (hoy solo la
   * usa etapas-ruta.tsx, que sí lo pasa) — pero SIN esto la perilla "tamaño del texto"
   * no tenía ningún efecto sobre los rótulos del gráfico, solo sobre el resto del slide.
   */
  ut?: (n: number) => number;
  altoBarra?: number;
  separacion?: number;
}) {
  const escala = ut ?? ((n: number) => u(n, w));

  if (datos.length === 0) {
    return (
      <span style={{ fontFamily: TIPO.cuerpo, fontSize: escala(24), color: BLANCO.bajo }}>
        Esta ruta todavía no tiene etapas cargadas en el catálogo.
      </span>
    );
  }

  const max = Math.max(...datos.map((d) => d.valor)) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: u(separacion, w), width: "100%" }}>
      {datos.map((d, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: u(6, w), width: "100%" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", width: "100%" }}>
            <span
              style={{
                fontFamily: TIPO.cuerpo,
                fontSize: escala(25),
                color: BLANCO.alto,
              }}
            >
              {d.etiqueta}
            </span>
            <span
              style={{
                fontFamily: TIPO.cuerpo,
                fontWeight: 700,
                fontSize: escala(25),
                color: PALETA.dorado,
              }}
            >
              {`${d.valor}${d.sufijo ?? ""}`}
            </span>
          </div>

          {/* Carril: blanco muy bajo. No verde claro, que contra el bosque lee gris. */}
          <div
            style={{
              display: "flex",
              width: "100%",
              height: u(altoBarra, w),
              borderRadius: u(4, w),
              backgroundColor: "rgba(255,255,255,0.10)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: `${Math.max(3, (d.valor / max) * 100)}%`,
                height: "100%",
                borderRadius: u(4, w),
                backgroundColor: PALETA.dorado,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
