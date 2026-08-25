// 3 o 4 pasos numerados en vertical, para "cómo prepararte" o "cómo se organiza tu
// Camino". No depende del catálogo de rutas. El número va en círculo dorado sobre
// bosque, igual que el badge de tip-numerado, pero repetido y más chico, con una línea
// vertical que conecta los pasos como en un itinerario.

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "pasos-preparacion",
  nombre: "Pasos de preparación",
  descripcion: "3 o 4 pasos numerados, para \"cómo prepararte\" o \"cómo se reserva\". No depende de ninguna ruta.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: true,
  rol: "cuerpo",
  campos: [
    { id: "titular", etiqueta: "Titular", tipo: "texto", requerido: true, maxLargo: 46, porDefecto: "Cómo prepararte para tu Camino" },
    {
      id: "paso_1",
      etiqueta: "Paso 1",
      tipo: "textarea",
      maxLargo: 90,
      porDefecto: "Entrena 2-3 meses antes: camina 40-60 minutos, tres veces por semana, con el calzado que vas a usar.",
    },
    {
      id: "paso_2",
      etiqueta: "Paso 2",
      tipo: "textarea",
      maxLargo: 90,
      porDefecto: "Domina el calzado: nunca lo estrenes, y usa calcetines sin costuras para evitar ampollas.",
    },
    {
      id: "paso_3",
      etiqueta: "Paso 3",
      tipo: "textarea",
      maxLargo: 90,
      porDefecto: "Arma tu mochila de día: agua, snack, capa de lluvia y protector solar. La maleta grande viaja sola.",
    },
    {
      id: "paso_4",
      etiqueta: "Paso 4",
      tipo: "textarea",
      maxLargo: 90,
      porDefecto: "Reserva con tiempo: 2027 es Año Santo Jacobeo y las mejores fechas se apartan meses antes.",
    },
  ],
};

const PASOS = ["paso_1", "paso_2", "paso_3", "paso_4"] as const;

function Paso({
  w,
  ut,
  numero,
  texto,
  esUltimo,
  sobreOscuro,
}: {
  w: number;
  ut: (n: number) => number;
  numero: number;
  texto: string;
  esUltimo: boolean;
  sobreOscuro: boolean;
}) {
  const d = 64;
  return (
    <div style={{ display: "flex", gap: u(22, w), width: "100%" }}>
      {/* Columna del número + la línea que conecta con el siguiente paso. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: u(6, w) }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: u(d, w),
            height: u(d, w),
            borderRadius: u(d, w) / 2,
            backgroundColor: PALETA.bosque,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: TIPO.display,
              fontWeight: 700,
              fontSize: ut(30),
              color: PALETA.dorado,
            }}
          >
            {numero}
          </span>
        </div>
        {!esUltimo ? (
          <div
            style={{
              display: "flex",
              width: u(3, w),
              flex: 1,
              backgroundColor: sobreOscuro ? "rgba(255,255,255,0.3)" : PALETA.taupe,
              minHeight: u(20, w),
            }}
          />
        ) : null}
      </div>
      <span
        style={{
          fontFamily: TIPO.cuerpo,
          fontSize: ut(ESCALA.cuerpo),
          color: sobreOscuro ? BLANCO.alto : PALETA.tinta,
          lineHeight: 1.4,
          paddingTop: u(14, w),
          paddingBottom: esUltimo ? 0 : u(28, w),
        }}
      >
        {texto}
      </span>
    </div>
  );
}

export function PasosPreparacion({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const zs = f.zonaSegura;
  const aj = resolverAjustes(f, slide.ajustes);
  const foto = slide.foto?.url ?? null;
  const veloPropio = slide.ajustes?.velo != null;

  const pasos = PASOS.map((id, i) => ({ n: i + 1, texto: v[id] ?? "" })).filter((p) => p.texto.trim() !== "");

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
          paddingTop: zs ? Math.max(m, u(zs.arriba, w)) : m,
          paddingBottom: zs ? Math.max(m, u(zs.abajo, w)) : m,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Cabecera w={w} sobreOscuro={!!foto} />
          <Eyebrow w={w} color={foto ? undefined : PALETA.bosqueMedio}>Paso a paso</Eyebrow>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: u(28, w), width: "100%" }}>
          <span
            style={{
              fontFamily: TIPO.display,
              fontWeight: 700,
              fontSize: aj.ut(ESCALA.subtitulo),
              color: foto ? PALETA.blanco : PALETA.bosque,
              lineHeight: 1.1,
            }}
          >
            {v.titular ?? ""}
          </span>
          <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            {pasos.map((p, i) => (
              <Paso key={p.n} w={w} ut={aj.ut} numero={p.n} texto={p.texto} esUltimo={i === pasos.length - 1} sobreOscuro={!!foto} />
            ))}
          </div>
        </div>

        <Pie w={w} sobreOscuro={!!foto} />
      </div>
    </div>
  );
}
