// Prueba social. La voz pide un número o una micro-historia con país que haga pensar
// "ese soy yo" — y prohíbe inventar nombres propios o cifras distintas a "+200".

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, FONDO_SIN_FOTO, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Filete } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "testimonio",
  nombre: "Testimonio",
  descripcion: "Una cita de peregrino sobre foto. Prueba social sin inventar nombres.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: true,
  rol: "cuerpo",
  campos: [
    { id: "cita", etiqueta: "La cita", tipo: "textarea", requerido: true, maxLargo: 200, porDefecto: "Llevaba ocho años diciendo que algún día. Lo hice a los 61 y volvería mañana." },
    { id: "quien", etiqueta: "Quién", tipo: "texto", maxLargo: 40, porDefecto: "Peregrina de Medellín" },
    { id: "ruta", etiqueta: "Qué caminó", tipo: "texto", maxLargo: 40, porDefecto: "Francés desde Sarria · 2026" },
  ],
};

export function Testimonio({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const foto = slide.foto?.url ?? null;
  const zs = f.zonaSegura;
  const aj = resolverAjustes(f, slide.ajustes);
  // El texto va directo sobre la foto: por defecto se tapa con un velo plano fuerte (no
  // el degradado de marca, que deja el tercio de arriba casi sin tapar). Si Nico mueve la
  // perilla del velo, se respeta `aj.overlay` con su valor.
  const veloPropio = slide.ajustes?.velo != null;

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
      {/* Sobre un testimonio la foto va más apagada que en la portada: manda el texto. */}
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
          paddingTop: zs ? Math.max(m, u(zs.arriba, w)) : m,
          paddingBottom: zs ? Math.max(m, u(zs.abajo, w)) : m,
        }}
      >
        <Cabecera w={w} />

        <div style={{ display: "flex", flexDirection: "column", gap: u(24, w) }}>
          {/* Las comillas van como carácter tipográfico, no como icono: es una cita. */}
          <span
            style={{
              fontFamily: TIPO.display,
              fontWeight: 700,
              fontSize: aj.ut(120),
              color: PALETA.dorado,
              lineHeight: 0.7,
              height: u(64, w),
            }}
          >
            “
          </span>
          <span
            style={{
              fontFamily: TIPO.display,
              fontSize: aj.ut(48),
              color: PALETA.blanco,
              lineHeight: 1.25,
            }}
          >
            {v.cita ?? ""}
          </span>
          <Filete w={w} ancho={160} color={PALETA.dorado} />
          <div style={{ display: "flex", flexDirection: "column", gap: u(4, w) }}>
            {v.quien ? (
              <span style={{ fontFamily: TIPO.cuerpo, fontWeight: 700, fontSize: aj.ut(ESCALA.cuerpoS), color: PALETA.dorado }}>
                {v.quien}
              </span>
            ) : null}
            {v.ruta ? (
              <span style={{ fontFamily: TIPO.cuerpo, fontSize: aj.ut(25), color: BLANCO.medio }}>{v.ruta}</span>
            ) : null}
          </div>
        </div>

        <Pie w={w} />
      </div>
    </div>
  );
}
