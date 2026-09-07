// Compresión de la foto del pasaporte en el navegador, ANTES de subirla.
//
// Las fotos que llegan del celular pesan 3-8 MB y hacían que el envío superara el límite
// de la Server Action (por ahí se cayó la primera firma real). Reducirlas acá deja el
// pasaporte en cientos de KB sin perder legibilidad y hace la subida viable en datos
// móviles. La usan la firma del contrato y la ficha del viajero.

export const PASAPORTE_LADO_MAX = 1600;
export const PASAPORTE_CALIDAD = 0.82;

export async function comprimeImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo; // los PDF viajan enteros
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, PASAPORTE_LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return archivo;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      lienzo.toBlob(resolve, "image/jpeg", PASAPORTE_CALIDAD),
    );
    // Si comprimir no ayudó (imagen ya pequeña), nos quedamos con el original.
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], "Pasaporte.jpg", { type: "image/jpeg" });
  } catch {
    // Formato que el navegador no sabe decodificar (p. ej. HEIC en algún Android):
    // seguimos con el original — comprimir nunca debe impedir enviar.
    return archivo;
  }
}
