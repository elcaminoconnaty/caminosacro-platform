// Cierre: el último slide de todo carrusel.
//
// El CTA es fijo de marca a propósito. La voz de Camino Sacro pide "un CTA accionable y
// CON MOTIVO, en una sola línea y sin signos de exclamación", invitando a escribirle a
// Clara — no un "más información" genérico. Dejarlo editable era invitar a que se
// perdiera esa regla pieza a pieza.

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Concha, Pie, Eyebrow, Filete } from "./_lockups";

const WHATSAPP_CLARA = "+57 304 663 7964";

export const definicion: DefinicionPlantilla = {
  id: "cierre-cta",
  nombre: "Cierre con CTA",
  descripcion: "El último slide. Concha grande, titular y la invitación a escribirle a Clara.",
  formatos: ["4x5", "1x1", "1.91x1", "9x16", "reel"],
  usaFoto: false,
  rol: "cierre",
  campos: [
    {
      id: "titular",
      etiqueta: "Titular de cierre",
      tipo: "textarea",
      maxLargo: 60,
      porDefecto: "Deja de investigar.\nEmpieza a caminar.",
      ayuda: "El eslogan por defecto. Cámbialo solo si la pieza pide otra cosa.",
    },
    {
      id: "motivo",
      etiqueta: "Para qué escribirle",
      tipo: "texto",
      maxLargo: 90,
      porDefecto: "En 4 preguntas te dice cuál es tu Camino y cuánto cuesta",
      ayuda: "El CTA siempre lleva motivo. Sin motivo, no es un CTA: es un adorno.",
    },
  ],
};

export function CierreCta({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const compacto = f.h < 700;

  const zs = f.zonaSegura;
  const padTop = zs ? Math.max(m, zs.arriba) : m;
  const padBottom = zs ? Math.max(m, zs.abajo) : m;

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
        paddingTop: padTop,
        paddingBottom: padBottom,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow w={w}>Siguiente paso</Eyebrow>
        <Concha size={u(compacto ? 54 : 86, w)} color={PALETA.dorado} colorSurcos={PALETA.bosque} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: u(22, w) }}>
        <span
          style={{
            fontFamily: TIPO.display,
            fontWeight: 700,
            fontSize: u(compacto ? ESCALA.subtitulo : ESCALA.titular, w),
            color: PALETA.blanco,
            lineHeight: 1.06,
            whiteSpace: "pre-wrap",
          }}
        >
          {v.titular ?? ""}
        </span>
        <Filete w={w} ancho={200} color={PALETA.dorado} />
        {v.motivo ? (
          <span
            style={{
              fontFamily: TIPO.cuerpo,
              fontSize: u(compacto ? ESCALA.cuerpoS : ESCALA.cuerpoXL, w),
              color: BLANCO.alto,
              lineHeight: 1.35,
            }}
          >
            {v.motivo}
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: u(16, w) }}>
        <div style={{ display: "flex", alignItems: "center", gap: u(12, w) }}>
          <span
            style={{
              fontFamily: TIPO.cuerpo,
              fontWeight: 700,
              fontSize: u(compacto ? ESCALA.cuerpoS : ESCALA.cuerpo, w),
              color: PALETA.dorado,
            }}
          >
            {`Escríbele a Clara · WhatsApp ${WHATSAPP_CLARA}`}
          </span>
        </div>
        <Pie w={w} />
      </div>
    </div>
  );
}
