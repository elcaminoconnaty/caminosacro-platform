// Qué llevar en la mochila de día. No depende del catálogo de rutas: sirve para
// cualquier ruta, cualquier día. Contenido real: TIPS["Qué llevar en la mochila de día"].
//
// La voz prohíbe checkmarks y viñetas en el CAPTION (texto de Instagram), pero esto es
// una PIEZA GRÁFICA: una lista visual con número + filete es diseño, no prosa. Se evita
// el check ✓ a propósito (pediría un glifo o un SVG más) y se usa el mismo patrón de
// número-en-círculo que ya prueba tip-numerado, repetido y más pequeño.

import { PALETA, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "lista-empaque",
  nombre: "Lista de empaque",
  descripcion: "Qué llevar en la mochila de día, en renglones cortos. No depende de ninguna ruta.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: true,
  rol: "cuerpo",
  campos: [
    { id: "titular", etiqueta: "Titular", tipo: "texto", requerido: true, maxLargo: 46, porDefecto: "Qué llevar en la mochila de día" },
    { id: "renglon_1", etiqueta: "Renglón 1", tipo: "texto", maxLargo: 60, porDefecto: "Agua, siempre a mano" },
    { id: "renglon_2", etiqueta: "Renglón 2", tipo: "texto", maxLargo: 60, porDefecto: "Un snack para el camino" },
    { id: "renglon_3", etiqueta: "Renglón 3", tipo: "texto", maxLargo: 60, porDefecto: "Una capa de lluvia" },
    { id: "renglon_4", etiqueta: "Renglón 4", tipo: "texto", maxLargo: 60, porDefecto: "Protector solar" },
    { id: "renglon_5", etiqueta: "Renglón 5", tipo: "texto", maxLargo: 60, porDefecto: "Y poco más" },
    {
      id: "renglon_6",
      etiqueta: "Renglón 6",
      tipo: "texto",
      maxLargo: 60,
      porDefecto: "La maleta grande viaja sola: hasta 15kg, te espera en el hotel",
    },
  ],
};

const RENGLONES = ["renglon_1", "renglon_2", "renglon_3", "renglon_4", "renglon_5", "renglon_6"] as const;

function Renglon({ w, ut, numero, texto }: { w: number; ut: (n: number) => number; numero: number; texto: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: u(20, w), width: "100%" }}>
      <span
        style={{
          fontFamily: TIPO.display,
          fontWeight: 700,
          fontSize: ut(28),
          color: PALETA.dorado,
          width: u(40, w),
        }}
      >
        {String(numero).padStart(2, "0")}
      </span>
      <span
        style={{
          fontFamily: TIPO.cuerpo,
          fontSize: ut(ESCALA.cuerpo),
          color: PALETA.blanco,
          lineHeight: 1.3,
          flex: 1,
        }}
      >
        {texto}
      </span>
    </div>
  );
}

export function ListaEmpaque({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const zs = f.zonaSegura;
  const aj = resolverAjustes(f, slide.ajustes);
  const foto = slide.foto?.url ?? null;
  const veloPropio = slide.ajustes?.velo != null;

  const renglones = RENGLONES.map((id, i) => ({ n: i + 1, texto: v[id] ?? "" })).filter((r) => r.texto.trim() !== "");

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
        // La lista va directo sobre la foto: hace falta el mismo velo fuerte que el resto
        // de las plantillas de cuerpo, o los renglones de abajo se pierden.
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
          <Eyebrow w={w}>Para llevar</Eyebrow>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: u(20, w), width: "100%" }}>
          <span
            style={{
              fontFamily: TIPO.display,
              fontWeight: 700,
              fontSize: aj.ut(ESCALA.subtitulo),
              color: PALETA.blanco,
              lineHeight: 1.1,
            }}
          >
            {v.titular ?? ""}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: u(6, w), width: "100%" }}>
            {renglones.map((r, i) => (
              <div key={r.n} style={{ display: "flex", flexDirection: "column", gap: u(16, w), width: "100%" }}>
                <Renglon w={w} ut={aj.ut} numero={r.n} texto={r.texto} />
                {i < renglones.length - 1 ? (
                  <div style={{ display: "flex", width: "100%", height: u(1, w), backgroundColor: "rgba(240,192,96,0.25)" }} />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <Pie w={w} />
      </div>
    </div>
  );
}
