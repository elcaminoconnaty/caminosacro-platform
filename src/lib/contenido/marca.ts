// ============================================================
// Camino Sacro — identidad de marca para el Estudio de Contenido.
//
// POR QUÉ ESTO DUPLICA A globals.css Y A quotePdf.tsx:
// Satori (el motor detrás de `ImageResponse` de next/og) NO ve Tailwind: tiene su
// propio motor de estilos y solo entiende `style` inline. Los tokens del `@theme`
// de Tailwind v4 en src/app/globals.css le son invisibles. Por eso la paleta vive
// también acá, como constantes planas.
//
// Es duplicación deliberada, igual que la constante `C` de src/lib/quotePdf.tsx
// (que existe por lo mismo, pero para @react-pdf/renderer). Son tres motores
// distintos pintando la misma marca. Si cambias un color, cámbialo en los tres.
// ============================================================

export const PALETA = {
  bosque: "#1a3a2a",
  bosqueMedio: "#2d5a3d",
  verdeClaro: "#3d7a52",
  dorado: "#f0c060",
  doradoOscuro: "#e0a840",
  crema: "#f7f5f0",
  taupe: "#e8e3d8",
  tinta: "#2a2520",
  muted: "#6b6258",
  blanco: "#ffffff",
} as const;

// Blancos sobre fondo verde: la jerarquía que usa la portada del PDF de cotización.
export const BLANCO = {
  full: "rgba(255,255,255,1)",
  alto: "rgba(255,255,255,0.9)",
  medio: "rgba(255,255,255,0.7)",
  bajo: "rgba(255,255,255,0.55)",
  filete: "rgba(255,255,255,0.2)",
} as const;

export const TIPO = {
  display: "Caladea",
  cuerpo: "Inter",
} as const;

// Escala tipográfica sobre un lienzo de 1080 de ancho. Se pasa por u() antes de usarse.
//
// SUBIDA EL 2026-08-24. Nico: "la letra es muy pequeña, quisiera que tuviera una letra más
// grande en la información". El problema no eran los titulares —esos ya se leían— sino todo
// lo demás: la línea de datos, el cuerpo, las notas y el pie. En Instagram la pieza se ve en
// un teléfono a menos de la mitad de su tamaño, así que lo que en el lienzo de 1080 parece
// generoso, en la mano queda ilegible.
//
// Los titulares se dejaron casi igual: ya ocupaban lo suyo y agrandarlos solo los haría
// desbordar a dos y tres líneas.
export const ESCALA = {
  titularXL: 96,
  titular: 84,
  titularS: 64,
  subtitulo: 50,      // 44
  cuerpoXL: 40,       // 34
  cuerpo: 34,         // 28
  cuerpoS: 28,        // 24
  dato: 32,           // 26 — la línea "112 km · 7 días · 5 etapas"
  pie: 24,            // 20
  eyebrow: 21,        // 18
  marca: 36,          // 34
  marcaSub: 20,       // 18
  numeroGigante: 220,
} as const;

// Medidas del lienzo base (1080 de ancho). Todas se escriben con u() en las plantillas.
export const MEDIDAS = {
  anchoBase: 1080,
  margen: 72,
  columna: 936, // 1080 - 72*2
  radioCaja: 24,
  radioPill: 40,
  conchaCirculo: 68,
  filete: 2,
  // El bloque verde inferior de las portadas ocupa un tercio del alto del lienzo.
  fraccionBloqueVerde: 1 / 3,
} as const;

/**
 * Escala una medida del lienzo base (1080 de ancho) al ancho real que se está
 * renderizando. Todas las plantillas escriben sus medidas con `u()` desde el
 * primer día: así, bajar el preview a media resolución para que pese menos es
 * cambiar una sola constante, no reescribir nueve plantillas.
 */
export function u(n: number, anchoReal: number = MEDIDAS.anchoBase): number {
  return Math.round((n * anchoReal) / MEDIDAS.anchoBase);
}

// Degradado verde que va sobre toda foto de portada: la foto pierde contraste hacia
// abajo para que el titular sobre el bloque verde no compita con la imagen.
export const OVERLAY_FOTO =
  "linear-gradient(180deg, rgba(26,58,42,0.25) 0%, rgba(26,58,42,0.72) 100%)";

// Gradiente para portadas sin foto.
export const FONDO_SIN_FOTO = `linear-gradient(135deg, ${PALETA.bosque} 0%, ${PALETA.bosqueMedio} 100%)`;

// Datos fijos de marca que aparecen en las piezas.
export const MARCA = {
  nombre: "Camino Sacro",
  bajada: "Agencia de peregrinaciones",
  web: "caminosacro.com",
  handle: "@caminosacro.agencia",
  lema: "Deja de investigar. Empieza a caminar.",
} as const;

// El tracking amplio del eyebrow y de la bajada de marca, en em.
export const TRACKING_EYEBROW = "0.12em";
