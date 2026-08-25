// Comparar dos precios NO es trabajo de un gráfico: son dos cifras, y la forma correcta
// para eso son dos tarjetas contrastadas (lo que la skill dataviz llama "stat tile").
// La maqueta es la misma de la página 2 del PDF de cotización: una caja crema con la
// cifra en verde y otra verde sólida con la cifra en blanco y el € en oro.

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "comparativa-precio",
  nombre: "Comparativa de precio",
  descripcion: "Dos precios enfrentados, con la maqueta de las cajas del PDF de cotización.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: false,
  rol: "cuerpo",
  campos: [
    { id: "ruta", etiqueta: "Ruta del catálogo", tipo: "ruta", ayuda: "Trae el nombre y el precio desde. Los dos importes se ajustan a mano." },
    { id: "titular", etiqueta: "Titular", tipo: "texto", maxLargo: 46, porDefecto: "Lo que cuesta de verdad" },
    { id: "etiqueta_a", etiqueta: "Etiqueta izquierda", tipo: "texto", maxLargo: 26, porDefecto: "En habitación doble" },
    { id: "precio_a", etiqueta: "Precio izquierdo", tipo: "texto", maxLargo: 10, porDefecto: "505" },
    { id: "etiqueta_b", etiqueta: "Etiqueta derecha", tipo: "texto", maxLargo: 26, porDefecto: "En habitación individual" },
    { id: "precio_b", etiqueta: "Precio derecho", tipo: "texto", maxLargo: 10, porDefecto: "665" },
    { id: "nota", etiqueta: "Nota al pie", tipo: "texto", maxLargo: 80, porDefecto: "Por persona, hotel con baño privado y maleta trasladada" },
  ],
};

function Tarjeta({
  w,
  etiqueta,
  precio,
  invertida,
}: {
  w: number;
  etiqueta: string;
  precio: string;
  invertida?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: u(10, w),
        flex: 1,
        borderRadius: u(MEDIDAS.radioCaja, w),
        backgroundColor: invertida ? PALETA.bosque : PALETA.crema,
        borderWidth: invertida ? 0 : u(2, w),
        borderStyle: "solid",
        borderColor: PALETA.taupe,
        padding: u(30, w),
      }}
    >
      <span
        style={{
          fontFamily: TIPO.cuerpo,
          fontSize: u(23, w),
          color: invertida ? PALETA.dorado : PALETA.muted,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {etiqueta}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: u(8, w) }}>
        <span
          style={{
            fontFamily: TIPO.display,
            fontWeight: 700,
            fontSize: u(76, w),
            color: invertida ? PALETA.blanco : PALETA.bosque,
            lineHeight: 1,
          }}
        >
          {precio}
        </span>
        <span
          style={{
            fontFamily: TIPO.display,
            fontWeight: 700,
            fontSize: u(38, w),
            color: PALETA.dorado,
          }}
        >
          €
        </span>
      </div>
    </div>
  );
}

export function ComparativaPrecio({ f, slide }: { f: Formato; slide: Slide }) {
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
        {v.ruta_nombre ? <Eyebrow w={w} color={PALETA.doradoOscuro}>{v.ruta_nombre}</Eyebrow> : <span />}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: u(28, w), width: "100%" }}>
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
        <div style={{ display: "flex", gap: u(18, w), width: "100%" }}>
          <Tarjeta w={w} etiqueta={v.etiqueta_a ?? ""} precio={v.precio_a ?? ""} />
          <Tarjeta w={w} etiqueta={v.etiqueta_b ?? ""} precio={v.precio_b ?? ""} invertida />
        </div>
        {v.nota ? (
          <span style={{ fontFamily: TIPO.cuerpo, fontSize: u(25, w), color: PALETA.muted }}>{v.nota}</span>
        ) : null}
      </div>

      <Pie w={w} sobreOscuro={false} />
    </div>
  );
}
