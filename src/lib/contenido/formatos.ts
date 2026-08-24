// Formatos de salida del Estudio de Contenido, con sus zonas seguras.
//
// La "zona segura" no es decoración: es dónde puede vivir el texto sin que se lo
// coma la interfaz de Instagram o el recorte de la grilla. Cada plantilla la
// respeta y el editor la dibuja como guía.

export type FormatoId = "1x1" | "4x5" | "1.91x1" | "9x16" | "reel";

export type ZonaSegura = {
  arriba: number;
  abajo: number;
  motivo: string;
};

export type Formato = {
  id: FormatoId;
  w: number;
  h: number;
  etiqueta: string;
  descripcion: string;
  zonaSegura: ZonaSegura | null;
};

export const FORMATOS: Record<FormatoId, Formato> = {
  "4x5": {
    id: "4x5",
    w: 1080,
    h: 1350,
    etiqueta: "Carrusel 4:5",
    descripcion: "El formato del feed que más pantalla ocupa. Es el que se usa por defecto.",
    zonaSegura: null,
  },
  "1x1": {
    id: "1x1",
    w: 1080,
    h: 1080,
    etiqueta: "Cuadrado 1:1",
    descripcion: "Cuadrado clásico. Se ve igual en el feed y en la grilla del perfil.",
    zonaSegura: null,
  },
  "1.91x1": {
    id: "1.91x1",
    w: 1080,
    h: 566,
    etiqueta: "Horizontal 1.91:1",
    descripcion: "Apaisado tipo banner. Poco alto: sirve para mapas y líneas de tiempo.",
    zonaSegura: null,
  },
  "9x16": {
    id: "9x16",
    w: 1080,
    h: 1920,
    etiqueta: "Historia 9:16",
    descripcion: "Historia de pantalla completa.",
    zonaSegura: {
      arriba: 250,
      abajo: 420,
      // Instagram monta su propia interfaz encima de la historia: arriba el avatar y la
      // barra de progreso, abajo la caja de respuesta. Lo que caiga ahí queda tapado.
      motivo: "Arriba el avatar y la barra de progreso; abajo la caja de respuesta.",
    },
  },
  reel: {
    id: "reel",
    w: 1080,
    h: 1920,
    etiqueta: "Portada de reel",
    descripcion: "Portada 9:16 pensada para sobrevivir el recorte de la grilla del perfil.",
    zonaSegura: {
      arriba: 420,
      abajo: 420, // 1920 - 1500
      // La restricción que manda NO es el reproductor: es la grilla del perfil, que
      // recorta la portada a 1:1 desde el centro. Todo lo que deba sobrevivir vive en
      // y ∈ [420, 1500]. El pie y el CTA pueden ir fuera: se ven al reproducir el reel,
      // no en la grilla, y eso está bien.
      motivo: "La grilla del perfil recorta a 1:1 desde el centro: solo sobrevive y ∈ [420,1500].",
    },
  },
};

export const FORMATO_POR_DEFECTO: FormatoId = "4x5";

export const FORMATOS_LISTA: Formato[] = [
  FORMATOS["4x5"],
  FORMATOS["1x1"],
  FORMATOS["1.91x1"],
  FORMATOS["9x16"],
  FORMATOS.reel,
];

export function esFormatoId(v: string): v is FormatoId {
  return v in FORMATOS;
}
