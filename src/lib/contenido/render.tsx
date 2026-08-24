// Único sitio que convierte un slide guardado en un PNG.
//
// Lo usan las dos puntas del módulo —el preview del editor y la exportación— y eso es
// deliberado: el preview es un <img> apuntando al mismo endpoint que produce el archivo
// final, así que no pueden divergir nunca. Es el problema clásico de todo editor de
// piezas ("el preview se veía distinto") y queda resuelto de raíz.

import { ImageResponse } from "next/og";
import { PALETA, TIPO, u } from "./marca";
import { FORMATOS, type Formato, type FormatoId } from "./formatos";
import type { Slide } from "./tipos";
import { plantilla } from "./plantillas/registry";
import { fuentesDeMarca } from "./fuentes";

/**
 * Pieza de error: cuando la plantilla no existe o el slide está corrupto, devolvemos una
 * imagen que DICE qué pasó, en vez de un 500. El editor la muestra en el preview y el
 * usuario entiende el problema sin abrir la consola.
 */
function Error({ f, mensaje }: { f: Formato; mensaje: string }) {
  const w = f.w;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: u(20, w),
        width: f.w,
        height: f.h,
        backgroundColor: PALETA.crema,
        padding: u(72, w),
      }}
    >
      <span
        style={{
          fontFamily: TIPO.display,
          fontWeight: 700,
          fontSize: u(44, w),
          color: PALETA.bosque,
        }}
      >
        No se pudo dibujar este slide
      </span>
      <span style={{ fontFamily: TIPO.cuerpo, fontSize: u(26, w), color: PALETA.muted, lineHeight: 1.4 }}>
        {mensaje}
      </span>
    </div>
  );
}

export type OpcionesRender = {
  /** Escala de salida. 1 = tamaño real (1080 de ancho). El preview puede pedir menos. */
  escala?: number;
};

/** Renderiza un slide al formato dado y devuelve la respuesta PNG. */
export function renderSlide(
  formatoId: FormatoId,
  slide: Slide | null,
  opciones: OpcionesRender = {},
): ImageResponse {
  const base = FORMATOS[formatoId] ?? FORMATOS["4x5"];
  const escala = opciones.escala && opciones.escala > 0 && opciones.escala <= 1 ? opciones.escala : 1;
  const f: Formato = {
    ...base,
    w: Math.round(base.w * escala),
    h: Math.round(base.h * escala),
  };

  let elemento: React.ReactElement;
  if (!slide) {
    elemento = <Error f={f} mensaje="La pieza no tiene ningún slide en esta posición." />;
  } else {
    const entrada = plantilla(slide.plantilla);
    if (!entrada) {
      elemento = <Error f={f} mensaje={`La plantilla "${slide.plantilla}" ya no existe en el catálogo.`} />;
    } else {
      const { Componente } = entrada;
      elemento = <Componente f={f} slide={slide} />;
    }
  }

  return new ImageResponse(elemento, {
    width: f.w,
    height: f.h,
    fonts: fuentesDeMarca(),
    // Sin `emoji:` a propósito: activarlo hace que Satori salga a un CDN por cada emoji
    // y multiplica por cien el tiempo de render.
  });
}
