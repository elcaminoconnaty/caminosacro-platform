import "server-only";
import crypto from "node:crypto";

/**
 * Las piezas criptográficas de la firma electrónica, portadas de El Camino con Naty.
 *
 * Nada de esto es exótico: un código de un solo uso guardado como hash, la huella del
 * documento en formato legible y un validador del trazo. Lo que le da valor es que se
 * guarde entero y no se pueda editar después — de eso se encargan `contract_events`
 * (solo crece) y el sellado del PDF con su Informe de Firmas.
 *
 * `sha256Hex` y `newContractToken` viven en `render.ts` desde antes y se reutilizan.
 */

/** Agrupa la huella de a cuatro para que se pueda leer y dictar por teléfono. */
export function huellaLegible(hex: string): string {
  return (hex.match(/.{1,4}/g) ?? [hex]).join(" ");
}

/** Código de un solo uso: seis dígitos, que es lo que la gente puede teclear sin equivocarse. */
export function nuevoCodigo(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * El código se guarda hasheado con el id del contrato como sal, para que dos contratos
 * con el mismo código no compartan hash.
 */
export function hashCodigo(codigo: string, contractId: string): string {
  return crypto.createHash("sha256").update(`${contractId}:${codigo}`).digest("hex");
}

/** Comparación en tiempo constante: un `===` filtra información por el tiempo de respuesta. */
export function mismoHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Cuánto vive el código. Diez minutos: suficiente para ir al correo y volver. */
export const OTP_VIGENCIA_MIN = 10;
/** Cuántos intentos antes de bloquear. */
export const OTP_MAX_INTENTOS = 5;
/** Cuántos códigos por hora se pueden pedir para un mismo contrato. */
export const OTP_MAX_POR_HORA = 8;

/**
 * La ubicación aproximada que reporta el navegador, como "lat, lon" con hasta seis
 * decimales. Es el único dato de evidencia que viene del cliente (la IP y el dispositivo
 * se leen en el servidor), así que se valida la forma y se rotula como "reportada por el
 * dispositivo" en el Informe de Firmas. Si el firmante niega el permiso, queda en null y
 * la firma vale igual: ZapSign hace exactamente lo mismo.
 */
export function ubicacionPlausible(geo: string | null | undefined): geo is string {
  if (typeof geo !== "string" || geo.length > 40) return false;
  const m = /^(-?\d{1,2}\.\d{1,6}), (-?\d{1,3}\.\d{1,6})$/.exec(geo);
  if (!m) return false;
  const lat = Number(m[1]), lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/**
 * Comprueba que el trazo de la firma sea un PNG que se pueda dibujar.
 *
 * No es paranoia: react-pdf **descarta una imagen corrupta en silencio**, así que un PNG
 * malo produce un contrato sellado, hasheado y archivado con el espacio de la firma en
 * blanco, y nadie se entera hasta que hace falta. Un canvas real siempre da un PNG válido;
 * esto atrapa el caso en que algo se rompió por el camino.
 */
export function trazoValido(dataUrl: string): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  if (!/^data:image\/png;base64,/.test(dataUrl)) {
    return { ok: false, error: "La firma no llegó como imagen PNG. Dibújala de nuevo." };
  }
  if (dataUrl.length > 400_000) {
    return { ok: false, error: "La firma pesa demasiado. Vuelve a dibujarla." };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  } catch {
    return { ok: false, error: "No pudimos leer la firma. Dibújala de nuevo." };
  }

  // Firma del formato y bloque final. Un PNG cortado a la mitad pasa lo primero y no lo
  // segundo, que es justo el caso que deja el contrato sin firma visible.
  const CABECERA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 100 || !bytes.subarray(0, 8).equals(CABECERA)) {
    return { ok: false, error: "La firma llegó dañada. Vuelve a dibujarla." };
  }
  if (!bytes.subarray(-8).includes(Buffer.from("IEND", "ascii"))) {
    return { ok: false, error: "La firma llegó incompleta. Vuelve a dibujarla." };
  }

  // Ancho y alto viven en el bloque IHDR, justo después de la cabecera.
  const ancho = bytes.readUInt32BE(16);
  const alto = bytes.readUInt32BE(20);
  if (ancho < 50 || alto < 20) {
    return { ok: false, error: "La firma quedó demasiado pequeña. Vuelve a dibujarla." };
  }

  return { ok: true, bytes };
}
