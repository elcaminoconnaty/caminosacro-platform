// Un número grande CON su contexto al lado: a diferencia de dato-grande (número +
// explicación en prosa debajo), acá la cifra se vuelve tangible con una comparación
// concreta ("100 km es como caminar de Bogotá a Villeta") en una tarjeta aparte. No
// depende del catálogo de rutas: la comparación es libre, para cualquier cifra del
// Camino (km, días, peregrinos, años).

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow, Filete } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "cifra-contexto",
  nombre: "Cifra con contexto",
  descripcion: "Un número grande y una comparación que lo hace tangible. Distinto de dato-grande: aquí la cifra se explica con otra referencia, no con prosa.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: true,
  rol: "cuerpo",
  campos: [
    { id: "cifra", etiqueta: "Cifra", tipo: "texto", requerido: true, maxLargo: 8, porDefecto: "100" },
    { id: "unidad", etiqueta: "Unidad", tipo: "texto", maxLargo: 12, porDefecto: "km" },
    {
      id: "contexto",
      etiqueta: "Comparación",
      tipo: "textarea",
      requerido: true,
      maxLargo: 90,
      porDefecto: "Es como caminar de Bogotá a Villeta, pero repartido en 5 días.",
    },
    {
      id: "nota",
      etiqueta: "Nota al pie",
      tipo: "texto",
      maxLargo: 90,
      porDefecto: "Los últimos 100km te dan la Compostela en Santiago",
    },
  ],
};

export function CifraContexto({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const zs = f.zonaSegura;
  const compacto = f.h < 700;
  const aj = resolverAjustes(f, slide.ajustes);
  const foto = slide.foto?.url ?? null;
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
      ) : null}
      {foto ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: f.w,
            height: f.h,
            ...(veloPropio ? { backgroundImage: aj.overlay } : { backgroundColor: "rgba(26,58,42,0.78)" }),
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
          paddingTop: zs ? Math.max(m, zs.arriba) : m,
          paddingBottom: zs ? Math.max(m, zs.abajo) : m,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Cabecera w={w} />
          <Eyebrow w={w}>La cifra</Eyebrow>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: u(26, w) }}>
          {/*
            `flexWrap:"wrap"` + `whiteSpace:"nowrap"` en la cifra: el campo está pensado
            para un número corto ("100", "18-25"), pero es un campo de texto libre —nada
            impide escribir algo más largo dentro de maxLargo=8— y sin esto la cifra
            envolvía a dos líneas mientras la unidad, alineada por baseline, quedaba
            flotando ENCIMA de la segunda línea, ilegible. Con nowrap la cifra no se
            parte, y si aun así no cabe junto a la unidad, la unidad cae a su propia
            línea en vez de superponerse.
          */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: u(14, w) }}>
            <span
              style={{
                fontFamily: TIPO.display,
                fontWeight: 700,
                fontSize: aj.ut(compacto ? 140 : 190),
                color: PALETA.dorado,
                lineHeight: 0.86,
                whiteSpace: "nowrap",
              }}
            >
              {v.cifra ?? ""}
            </span>
            {v.unidad ? (
              <span
                style={{
                  fontFamily: TIPO.display,
                  fontWeight: 700,
                  fontSize: aj.ut(compacto ? 42 : 60),
                  color: PALETA.blanco,
                }}
              >
                {v.unidad}
              </span>
            ) : null}
          </div>

          {/* La tarjeta de contexto: fondo verde medio, para separarla del bosque de
              detrás y que se lea como "esto es lo mismo que...". */}
          {v.contexto ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: u(10, w),
                borderRadius: u(MEDIDAS.radioCaja, w),
                backgroundColor: PALETA.bosqueMedio,
                borderWidth: u(2, w),
                borderStyle: "solid",
                borderColor: "rgba(240,192,96,0.35)",
                padding: u(28, w),
              }}
            >
              <span
                style={{
                  fontFamily: TIPO.cuerpo,
                  fontWeight: 700,
                  fontSize: aj.ut(ESCALA.eyebrow),
                  color: PALETA.dorado,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Para que te des una idea
              </span>
              <span
                style={{
                  fontFamily: TIPO.cuerpo,
                  fontSize: aj.ut(compacto ? ESCALA.cuerpoS : ESCALA.cuerpo),
                  color: PALETA.blanco,
                  lineHeight: 1.4,
                }}
              >
                {v.contexto}
              </span>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: u(16, w) }}>
          {v.nota ? (
            // Fragmento evitado a propósito: Satori NO respeta `display:flex` del padre
            // para hijos sueltos de un React.Fragment (los pinta en línea, uno junto al
            // otro, en vez de apilarlos) — hace falta un div propio con su flex explícito.
            <div style={{ display: "flex", flexDirection: "column", gap: u(16, w) }}>
              <Filete w={w} ancho={160} color={PALETA.dorado} />
              <span style={{ fontFamily: TIPO.cuerpo, fontSize: aj.ut(ESCALA.cuerpoS), color: BLANCO.medio }}>
                {v.nota}
              </span>
            </div>
          ) : null}
          <Pie w={w} />
        </div>
      </div>
    </div>
  );
}
