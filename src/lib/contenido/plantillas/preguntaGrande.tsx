// Una pregunta enorme en Caladea y su respuesta corta abajo. Se alimenta de FAQS de
// estrategia.ts — no depende del catálogo de rutas: sirve para cualquier objeción.

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, FONDO_SIN_FOTO, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow, Filete } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "pregunta-grande",
  nombre: "Pregunta grande",
  descripcion: "Una pregunta enorme y su respuesta corta. Para resolver el miedo del día, sin catálogo de por medio.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: true,
  rol: "cuerpo",
  campos: [
    { id: "pregunta", etiqueta: "Pregunta", tipo: "textarea", requerido: true, maxLargo: 70, porDefecto: "¿Estoy muy mayor para el Camino?" },
    {
      id: "respuesta",
      etiqueta: "Respuesta",
      tipo: "textarea",
      maxLargo: 220,
      porDefecto:
        "No. Acompañamos peregrinos de 30 a 75 años. Vas a tu ritmo, con la maleta trasladada y hotel cada noche. La edad no decide: tú decides.",
    },
  ],
};

export function PreguntaGrande({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const zs = f.zonaSegura;
  const aj = resolverAjustes(f, slide.ajustes);
  const foto = slide.foto?.url ?? null;
  // Sobre foto se usa el mismo velo plano fuerte que el resto de las plantillas de
  // cuerpo: el degradado de marca por defecto deja el tercio de arriba casi sin tapar,
  // y aquí la pregunta ocupa justo esa zona.
  const veloPropio = slide.ajustes?.velo != null;
  const compacto = f.h < 700;

  return (
    <div style={{ display: "flex", position: "relative", width: f.w, height: f.h, backgroundColor: PALETA.bosque }}>
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
      ) : (
        <div style={{ position: "absolute", top: 0, left: 0, width: f.w, height: f.h, backgroundImage: FONDO_SIN_FOTO }} />
      )}
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
          <Cabecera w={w} />
          <Eyebrow w={w}>Nos preguntan mucho</Eyebrow>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: u(28, w) }}>
          <span
            style={{
              fontFamily: TIPO.display,
              fontWeight: 700,
              fontSize: aj.ut(compacto ? ESCALA.subtitulo : ESCALA.titularS),
              color: PALETA.dorado,
              lineHeight: 1.1,
            }}
          >
            {v.pregunta ?? ""}
          </span>
          <Filete w={w} ancho={160} color={PALETA.dorado} />
          {v.respuesta ? (
            <span
              style={{
                fontFamily: TIPO.cuerpo,
                fontSize: aj.ut(compacto ? ESCALA.cuerpoS : ESCALA.cuerpoXL),
                color: BLANCO.alto,
                lineHeight: 1.4,
              }}
            >
              {v.respuesta}
            </span>
          ) : null}
        </div>

        <Pie w={w} />
      </div>
    </div>
  );
}
