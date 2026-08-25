// Cierre: el último slide de todo carrusel.
//
// El CTA es fijo de marca a propósito. La voz de Camino Sacro pide "un CTA accionable y
// CON MOTIVO, en una sola línea y sin signos de exclamación", invitando a escribirle a
// Clara — no un "más información" genérico. Dejarlo editable era invitar a que se
// perdiera esa regla pieza a pieza.

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import { esApaisado, type Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Concha, Pie, Eyebrow, Filete } from "./_lockups";

const WHATSAPP_CLARA = "+57 304 663 7964";

export const definicion: DefinicionPlantilla = {
  id: "cierre-cta",
  nombre: "Cierre con CTA",
  descripcion: "El último slide. Concha grande, titular y la invitación a escribirle a Clara.",
  formatos: ["4x5", "1x1", "1.91x1", "9x16", "reel"],
  usaFoto: true,
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
  const compacto = esApaisado(f);
  const aj = resolverAjustes(f, slide.ajustes);
  const foto = slide.foto?.url ?? null;
  // El titular y el motivo van directo sobre la foto (sin bloque sólido detrás): con el
  // degradado de marca por defecto el tercio de arriba queda casi sin tapar y compite con
  // el titular. Mientras Nico no toque la perilla del velo, se usa un velo plano fuerte.
  const veloPropio = slide.ajustes?.velo != null;

  const zs = f.zonaSegura;
  const padTop = zs ? Math.max(m, u(zs.arriba, w)) : m;
  const padBottom = zs ? Math.max(m, u(zs.abajo, w)) : m;

  return (
    <div style={{ display: "flex", position: "relative", width: f.w, height: f.h, backgroundColor: PALETA.bosque }}>
      {/* El cierre ya vive sobre bosque sólido: con foto, la misma franja se vuelve una
          foto a sangre con velo verde. El texto ya es claro y no cambia. */}
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
              fontSize: aj.ut(compacto ? ESCALA.subtitulo : ESCALA.titular),
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
                fontSize: aj.ut(compacto ? ESCALA.cuerpoS : ESCALA.cuerpoXL),
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
                fontSize: aj.ut(compacto ? ESCALA.cuerpoS : ESCALA.cuerpo),
                color: PALETA.dorado,
              }}
            >
              {`Escríbele a Clara · WhatsApp ${WHATSAPP_CLARA}`}
            </span>
          </div>
          <Pie w={w} />
        </div>
      </div>
    </div>
  );
}
