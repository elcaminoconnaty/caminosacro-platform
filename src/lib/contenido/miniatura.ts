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
 * ⚠️ DOS COSAS QUE DEVUELVEN 400 Y DEJAN LA FOTO EN BLANCO:
 *   - un `ancho` que no esté en `images.imageSizes` (ni en `deviceSizes`);
 *   - una `calidad` que no esté en `images.qualities`, cuya lista por defecto es SOLO
 *     `[75]`. Esto ya rompió todas las miniaturas una vez: se pidió `q=70` y el navegador
 *     pintó el icono de imagen rota en toda la rejilla.
 * Por eso la calidad no es un parámetro: se fija en 75, que es la única declarada.
 */
const CALIDAD = 75;

export function miniatura(url: string, ancho: 96 | 160 | 240 | 320 = 240): string {
  // Los data URI ya vienen incrustados: no hay nada que optimizar y el optimizador los
  // rechaza.
  if (!url || url.startsWith("data:")) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${ancho}&q=${CALIDAD}`;
}
