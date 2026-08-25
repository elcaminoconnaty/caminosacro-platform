// Portada de ruta: el slide 1 de un carrusel, o un post suelto.
//
// Es la portada del PDF de cotización llevada a Instagram, y eso es a propósito: esa
// maqueta —foto a sangre, tinte verde, bloque verde sólido abajo con el titular— es lo
// que hace que la pieza se lea como Camino Sacro sin necesidad de un logo.

import { PALETA, TIPO, ESCALA, MEDIDAS, FONDO_SIN_FOTO, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import type { Formato } from "../formatos";
import type { Slide } from "../tipos";
import type { DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow, Pill, Filete } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "portada-ruta",
  nombre: "Portada de ruta",
  descripcion:
    "Foto a sangre con el bloque verde de marca abajo. El slide de apertura de casi todo carrusel.",
  formatos: ["4x5", "1x1", "1.91x1", "9x16", "reel"],
  usaFoto: true,
  rol: "portada",
  campos: [
    {
      id: "eyebrow",
      etiqueta: "Antetítulo",
      tipo: "texto",
      maxLargo: 32,
      porDefecto: "Camino Francés",
      ayuda: "Va en oro, en versalitas. El nombre de la ruta o el tema.",
    },
    {
      id: "titular",
      etiqueta: "Titular",
      tipo: "textarea",
      requerido: true,
      maxLargo: 70,
      porDefecto: "Los últimos 100 km hasta Santiago",
      ayuda: "Dos líneas como máximo. Es lo que detiene el scroll.",
    },
    {
      id: "datos",
      etiqueta: "Línea de datos",
      tipo: "texto",
      maxLargo: 60,
      porDefecto: "112 km · 7 días · 5 etapas",
      ayuda: "Separa con punto medio. En la Etapa 4 se autollena desde el catálogo.",
    },
    {
      id: "precio",
      etiqueta: "Precio",
      tipo: "texto",
      maxLargo: 20,
      porDefecto: "desde 505 €",
      ayuda: "Va en el pill dorado. Déjalo vacío si la pieza no lleva precio.",
    },
  ],
};

export function PortadaRuta({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const foto = slide.foto?.url ?? null;

  // El bloque verde ocupa el tercio inferior, salvo en el apaisado, donde no hay alto
  // para eso y la pieza se resuelve solo con el degradado sobre la foto.
  // Los ajustes del slide mandan sobre los valores por defecto del formato: `ut` es el
  // tamaño de letra ya escalado, y `altoBloque` puede venir bajado a mano para que se vea
  // más foto (que es justo lo que ahogaba a las historias).
  const aj = resolverAjustes(f, slide.ajustes);
  const compacto = f.h < 700;
  const altoBloque = compacto ? 0 : aj.altoBloque;

  // En la historia y en la portada de reel el contenido tiene que caer dentro de la zona
  // segura, o se lo come la interfaz de Instagram (o el recorte a 1:1 de la grilla).
  const zs = f.zonaSegura;
  const padTop = zs ? Math.max(m, zs.arriba) : m;
  const padBottom = zs ? Math.max(m, zs.abajo) : m;

  return (
    <div style={{ display: "flex", position: "relative", width: f.w, height: f.h, backgroundColor: PALETA.bosque }}>
      {/* Foto a sangre. Sin foto, el degradado de marca hace de fondo. */}
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
            // Spread condicional: Satori revienta con `transform: none` Y con
            // `transform: undefined`. La propiedad tiene que NO ESTAR.
            ...(aj.zoomFoto ? { transform: aj.zoomFoto } : {}),
          }}
        />
      ) : (
        <div style={{ position: "absolute", top: 0, left: 0, width: f.w, height: f.h, backgroundImage: FONDO_SIN_FOTO }} />
      )}

      {/* Tinte verde: la foto pierde contraste hacia abajo para que el titular respire. */}
      <div style={{ position: "absolute", top: 0, left: 0, width: f.w, height: f.h, backgroundImage: aj.overlay }} />

      {/* Cabecera, sobre la foto. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          position: "absolute",
          top: padTop,
          left: m,
          width: f.w - m * 2,
        }}
      >
        <Cabecera w={w} />
        {v.eyebrow ? <Eyebrow w={w}>{v.eyebrow}</Eyebrow> : <span />}
      </div>

      {/*
        El bloque de abajo es a la vez el fondo verde y el contenedor del titular: si el
        texto se maquetara aparte con space-between quedaría flotando en el medio de la
        foto y el bloque verde saldría vacío. Al vivir DENTRO del bloque, el titular
        siempre cae sobre verde sólido, como en la portada del PDF de cotización.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: u(18, w),
          position: "absolute",
          left: 0,
          bottom: 0,
          width: f.w,
          minHeight: altoBloque,
          // Con la franja bajada a cero el texto queda sobre la foto: el degradado de
          // abajo es lo único que lo mantiene legible.
          backgroundColor: compacto || altoBloque === 0 ? "transparent" : PALETA.bosque,
          // Misma regla que con `transform`: Satori revienta si la propiedad existe con
          // valor `undefined`. Hay que omitirla con spread condicional.
          ...(!compacto && altoBloque === 0
            ? { backgroundImage: "linear-gradient(180deg, rgba(26,58,42,0) 0%, rgba(26,58,42,0.85) 55%)" }
            : {}),
          paddingLeft: m,
          paddingRight: m,
          paddingTop: u(compacto ? 0 : 40, w),
          paddingBottom: padBottom,
        }}
      >
        <Filete w={w} />
        <span
          style={{
            fontFamily: TIPO.display,
            fontWeight: 700,
            fontSize: aj.ut(compacto ? ESCALA.subtitulo : ESCALA.titular),
            color: PALETA.blanco,
            lineHeight: 1.06,
          }}
        >
          {v.titular ?? ""}
        </span>
        {v.datos ? (
          <span
            style={{
              fontFamily: TIPO.cuerpo,
              fontSize: aj.ut(ESCALA.dato),
              color: PALETA.dorado,
              letterSpacing: "0.02em",
            }}
          >
            {v.datos}
          </span>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginTop: u(compacto ? 12 : 26, w),
          }}
        >
          <Pie w={w} />
          {v.precio ? <Pill w={w}>{v.precio}</Pill> : <span />}
        </div>
      </div>
    </div>
  );
}
