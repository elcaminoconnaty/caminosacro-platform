// Una bicicleta de la flota: foto grande, modelo, tipo y una línea de descripción.
// No depende del catálogo de RUTAS —usa comercial.bikes, un catálogo aparte, el mismo
// que /catalogo y las cotizaciones de bici— así que cuenta como plantilla libre.
//
// La maqueta es la de portada-ruta (foto a sangre + bloque verde inferior), que es la
// que ya lee como "Camino Sacro" sin logo. Los datos reales viven en
// src/lib/bikes/data.ts (BIKES): el porDefecto usa la primera de la flota, la Ridley
// Ignite A. La foto real de cada bici sale del banco `contenido_fotos` con
// `ruta_tag='bicis'` — eso lo resuelve el SelectorFoto ya existente, no esta plantilla.

import { PALETA, TIPO, ESCALA, MEDIDAS, FONDO_SIN_FOTO, u } from "../marca";
import { resolverAjustes } from "../ajustes";
import { esApaisado, type Formato } from "../formatos";
import type { Slide, DefinicionPlantilla } from "../tipos";
import { Cabecera, Pie, Filete, Pill } from "./_lockups";

export const definicion: DefinicionPlantilla = {
  id: "ficha-bici",
  nombre: "Ficha de bicicleta",
  descripcion: "Una bicicleta de la flota: foto, modelo, tipo y una línea de descripción. No depende del catálogo de rutas.",
  formatos: ["4x5", "1x1", "1.91x1", "9x16", "reel"],
  usaFoto: true,
  rol: "cuerpo",
  franjaAjustable: true,
  campos: [
    { id: "modelo", etiqueta: "Modelo", tipo: "texto", requerido: true, maxLargo: 40, porDefecto: "Ridley Ignite A" },
    { id: "tipo", etiqueta: "Tipo", tipo: "texto", maxLargo: 40, porDefecto: "MTB · Bicicleta de montaña" },
    {
      id: "descripcion",
      etiqueta: "Descripción",
      tipo: "textarea",
      maxLargo: 90,
      porDefecto: "Robusta, polivalente y lista para cualquier terreno. Admite alforjas de 20 litros por lado.",
    },
  ],
};

export function FichaBici({ f, slide }: { f: Formato; slide: Slide }) {
  const w = f.w;
  const m = u(MEDIDAS.margen, w);
  const v = slide.valores;
  const foto = slide.foto?.url ?? null;

  const aj = resolverAjustes(f, slide.ajustes);
  const compacto = esApaisado(f);
  const altoBloque = compacto ? 0 : aj.altoBloque;

  const zs = f.zonaSegura;
  const padTop = zs ? Math.max(m, u(zs.arriba, w)) : m;
  const padBottom = zs ? Math.max(m, u(zs.abajo, w)) : m;

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

      <div style={{ position: "absolute", top: 0, left: 0, width: f.w, height: f.h, backgroundImage: aj.overlay }} />

      {/*
        Velo superior, y no es adorno: las fotos de la flota son tomas de producto sobre
        fondo CLARO, y ahí el "AGENCIA DE PEREGRINACIONES" en oro desaparecía por completo.
        El degradado de marca oscurece hacia abajo, así que arriba no tapaba nada. Este
        oscurece solo la banda de la cabecera y se desvanece antes de llegar a la bici.
      */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: f.w,
          height: Math.round(f.h * 0.22),
          backgroundImage: "linear-gradient(180deg, rgba(26,58,42,0.78) 0%, rgba(26,58,42,0) 100%)",
        }}
      />

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
        <div style={{ display: "flex", flexShrink: 0 }}>
          <Cabecera w={w} />
        </div>
        {/*
          "tipo" es texto libre (maxLargo=40): a diferencia del `precio` corto que lleva
          este mismo Pill en portada-ruta, un valor largo desbordaba el lienzo por la
          derecha —Satori no encoge el texto de un flex item por debajo de su ancho de
          contenido si no se le da un tope explícito—. Con `maxWidth` + `minWidth:0` la
          píldora se encoge y el texto de adentro pasa a dos líneas en vez de salirse.
        */}
        {v.tipo ? (
          <div style={{ display: "flex", flexShrink: 1, minWidth: 0, maxWidth: "58%", justifyContent: "flex-end" }}>
            <Pill w={w}>{v.tipo}</Pill>
          </div>
        ) : (
          <span />
        )}
      </div>

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
          // `minHeight` y no `height`, decidido probando las dos.
          //
          // Con `height` la perilla manda del todo y se puede dar mucho más sitio a la
          // bicicleta — pero al bajarla por debajo de lo que ocupa el texto, el título se
          // encima sobre la descripción. Y `overflow: "hidden"` NO lo corta: Satori lo
          // ignora. Un texto encimado se lee como "esto está roto", no como una decisión
          // del usuario, y este módulo existe para no tener que resolver nada.
          //
          // Con `minHeight`, subir la perilla sí encoge la foto (que es el ajuste que se
          // pide casi siempre) y bajarla nunca rompe nada: simplemente deja de tener
          // efecto cuando el texto ya no cabe. Para ganar más foto se baja el tamaño del
          // texto, que es la otra perilla.
          minHeight: altoBloque,
          backgroundColor: compacto || altoBloque === 0 ? "transparent" : PALETA.bosque,
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
          {v.modelo ?? ""}
        </span>
        {v.descripcion ? (
          <span
            style={{
              fontFamily: TIPO.cuerpo,
              fontSize: aj.ut(compacto ? ESCALA.cuerpoS : ESCALA.cuerpo),
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.4,
            }}
          >
            {v.descripcion}
          </span>
        ) : null}

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: u(compacto ? 12 : 26, w) }}>
          <Pie w={w} />
          <span />
        </div>
      </div>
    </div>
  );
}
