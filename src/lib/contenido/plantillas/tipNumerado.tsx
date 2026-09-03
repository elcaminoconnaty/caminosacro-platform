// El pilar estrella de la estrategia: un consejo útil y concreto.
// La voz pide que el VALOR vaya primero y que la autoridad se muestre, no se diga.

import { PALETA, BLANCO, TIPO, ESCALA, MEDIDAS, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import type { Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Eyebrow } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "tip-numerado",
  nombre: "Consejo numerado",
  descripcion: "Un consejo práctico del Camino, con su número. El slide de cuerpo más usado.",
  formatos: ["4x5", "1x1", "9x16"],
  usaFoto: true,
  rol: "cuerpo",
  campos: [
    { id: "numero", etiqueta: "Número", tipo: "texto", maxLargo: 2, porDefecto: "1" },
    { id: "titular", etiqueta: "Titular", tipo: "texto", requerido: true, maxLargo: 48, porDefecto: "Nunca estrenes el calzado" },
    {
      id: "cuerpo",
      etiqueta: "Consejo",
      tipo: "textarea",
      // 420 y no 260: con 180 car. —lo que venía escribiendo Claude— el slide quedaba
      // literalmente medio vacío, con el bloque de texto flotando en el centro y aire
      // muerto arriba y abajo. Verificado por render a 400 car. en 4x5, 1x1 y 9x16: cabe
      // con holgura en los tres. El consejo es el contenido, no un pie de foto.
      maxLargo: 420,
      porDefecto:
        "El 90% de las molestias del Camino son ampollas. La clave está en tres cosas: calzado ya domado (nunca lo estrenes en la primera etapa), calcetines sin costuras —mucha gente usa dos capas finas— y secar bien los pies en cada parada, aprovechando el café de media mañana. Al cuarto día es lo que más se agradece.",
    },
  ],
};

export function TipNumerado({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const zs = f.zonaSegura;
  const aj = resolverAjustes(f, slide.ajustes);
  const foto = slide.foto?.url ?? null;
  // El texto va DIRECTO sobre la foto (no hay bloque sólido detrás, como sí lo hay en
  // portada-ruta): el degradado de marca por defecto (`aj.overlay` con velo null) deja el
  // tercio de arriba casi sin tapar y el cuerpo se pierde contra una foto clara. Por eso,
  // mientras Nico no toque la perilla del velo, se usa un velo plano fuerte — el mismo
  // que ya prueba testimonio.tsx. Si SÍ mueve la perilla, se respeta lo que pidió.
  const veloPropio = slide.ajustes?.velo != null;

  return (
    <div style={{ display: "flex", position: "relative", width: f.w, height: f.h, backgroundColor: PALETA.crema }}>
      {/* Fondo claro de siempre. Con foto, esta plantilla pasa a leerse como testimonio:
          la foto a sangre con velo verde, y el texto se vuelve claro. */}
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
          <Eyebrow w={w} color={foto ? undefined : PALETA.bosqueMedio}>Consejo</Eyebrow>
        </div>

        <div style={{ display: "flex", gap: u(28, w), alignItems: "flex-start" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: u(88, w),
              height: u(88, w),
              borderRadius: u(44, w),
              backgroundColor: PALETA.bosque,
            }}
          >
            <span
              style={{
                fontFamily: TIPO.display,
                fontWeight: 700,
                fontSize: aj.ut(48),
                color: PALETA.dorado,
              }}
            >
              {v.numero ?? ""}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: u(16, w), flex: 1 }}>
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
            <span
              style={{
                fontFamily: TIPO.cuerpo,
                fontSize: aj.ut(ESCALA.cuerpo),
                color: foto ? BLANCO.alto : PALETA.tinta,
                lineHeight: 1.45,
              }}
            >
              {v.cuerpo ?? ""}
            </span>
          </div>
        </div>

        <Pie w={w} sobreOscuro={!!foto} />
      </div>
    </div>
  );
}
