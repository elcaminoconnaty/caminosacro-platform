// Etapa a etapa: los km reales de cada jornada, leídos del catálogo.
// Es la plantilla que convierte las 281 filas de comercial.route_stages en contenido.

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow } from "./_lockups";
import { Barras, type Barra } from "../graficos/barras";

export const definicion: DefinicionPlantilla = {
  id: "etapas-ruta",
  nombre: "Etapas de la ruta",
  descripcion: "Barras con los kilómetros de cada etapa, tomados del catálogo. Se autollena al elegir la ruta.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: false,
  rol: "cuerpo",
  campos: [
    { id: "ruta", etiqueta: "Ruta del catálogo", tipo: "ruta", ayuda: "Al elegirla se traen las etapas y los km reales." },
    { id: "titular", etiqueta: "Titular", tipo: "texto", maxLargo: 45, porDefecto: "Etapa por etapa" },
    { id: "nota", etiqueta: "Nota al pie", tipo: "texto", maxLargo: 70, porDefecto: "Caminas a tu ritmo, con la maleta trasladada" },
  ],
};

/** Las etapas llegan dentro del slide (`etapas_json`) y no se leen de la base al dibujar:
 *  así el render es puro y una pieza publicada no cambia sola si mañana se edita el catálogo. */
function leerEtapas(json: string | undefined): Barra[] {
  if (!json) return [];
  try {
    const filas = JSON.parse(json) as Array<{ dia: number; desde: string; hasta: string; km: number }>;
    return filas.map((e) => ({
      etiqueta: e.hasta ? `${e.desde} — ${e.hasta}` : `Etapa ${e.dia}`,
      valor: Math.round(e.km),
      sufijo: " km",
    }));
  } catch {
    return [];
  }
}

export function EtapasRuta({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const zs = f.zonaSegura;

  const todas = leerEtapas(v.etapas_json);
  // Con más de ocho etapas los rótulos se apelmazan: se muestran las primeras y se dice
  // cuántas quedan, en vez de encoger todo hasta que no se lea.
  const tope = f.h > 1500 ? 9 : 7;
  const barras = todas.slice(0, tope);
  const resto = todas.length - barras.length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: f.w,
        height: f.h,
        backgroundColor: PALETA.bosque,
        paddingLeft: m,
        paddingRight: m,
        paddingTop: zs ? Math.max(m, zs.arriba) : m,
        paddingBottom: zs ? Math.max(m, zs.abajo) : m,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: u(10, w) }}>
        <Cabecera w={w} />
        {v.ruta_nombre ? <Eyebrow w={w}>{v.ruta_nombre}</Eyebrow> : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: u(28, w), width: "100%" }}>
        <span
          style={{
            fontFamily: TIPO.display,
            fontWeight: 700,
            fontSize: u(ESCALA.subtitulo, w),
            color: PALETA.blanco,
            lineHeight: 1.08,
          }}
        >
          {v.titular ?? ""}
        </span>
        <Barras datos={barras} w={w} />
        {resto > 0 && (
          <span style={{ fontFamily: TIPO.cuerpo, fontSize: u(24, w), color: BLANCO.bajo }}>
            {`y ${resto} ${resto === 1 ? "etapa más" : "etapas más"}`}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: u(14, w) }}>
        {v.nota ? (
          <span style={{ fontFamily: TIPO.cuerpo, fontSize: u(ESCALA.cuerpoS, w), color: BLANCO.medio }}>
            {v.nota}
          </span>
        ) : null}
        <Pie w={w} />
      </div>
    </div>
  );
}
