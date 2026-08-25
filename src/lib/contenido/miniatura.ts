/**
 * URL de miniatura a través del optimizador de imágenes de Next.
 *
 * Next redimensiona con sharp y devuelve WebP. Una foto del banco pasa de ~320 KB a unos
 * 10-15 KB, que con 48 miniaturas en pantalla es la diferencia entre 15 MB y menos de uno.
 *
 * Se construye la URL a mano en vez de usar `next/image` a propósito: el componente exige
 * `fill` o medidas y cambiaría la maqueta de las rejillas que ya funcionan. Esto es
 * exactamente lo que `next/image` hace por debajo, sin tocar el layout.
 *
 * El ancho tiene que estar en `images.imageSizes` o `deviceSizes` de `next.config.ts`, o
 * el optimizador responde 400.
 */
export function miniatura(url: string, ancho: 96 | 160 | 240 | 320 = 240, calidad = 70): string {
  // Los data URI ya vienen incrustados: no hay nada que optimizar y el optimizador los
  // rechaza.
  if (!url || url.startsWith("data:")) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${ancho}&q=${calidad}`;
}
