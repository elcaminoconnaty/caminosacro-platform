import "server-only";

import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { baseUrlApp } from "@/lib/email/versionWeb";

/**
 * El enlace corto de una cotización: `/c/[code]`.
 *
 * Qué resuelve, y por qué no valía la versión web del correo (/correo/[token]):
 *
 *   · Aquella SOLO existe si el correo ya salió, y la tarjeta de WhatsApp se usa justo
 *     antes de eso. En la primera prueba real el mensaje salió sin enlace.
 *   · Y medía 48 caracteres de token. En un chat eso ocupa tres renglones.
 *
 * El código vive en la cotización (migración 0048), se crea la primera vez que hace falta
 * y no cambia nunca: un enlace mandado hace un mes tiene que seguir abriendo la cotización
 * hoy, y sirve el PDF VIGENTE, no una copia del día en que se mandó.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/**
 * Alfabeto sin caracteres que se confunden al leerlos en voz alta o teclearlos desde el
 * celular: sin 0/O, sin 1/l/I. Un enlace que alguien dicta por teléfono y no abre es peor
 * que uno largo.
 */
const ALFABETO = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const LARGO = 10;

export function nuevoShareCode(): string {
  let out = "";
  for (let i = 0; i < LARGO; i++) out += ALFABETO[randomInt(ALFABETO.length)];
  return out;
}

export function urlCorta(code: string): string {
  return `${baseUrlApp()}/c/${code}`;
}

/**
 * El código de esta cotización, creándolo si todavía no tiene.
 *
 * Devuelve `null` si no se pudo escribir: quien llama enseña el mensaje sin enlace (y con
 * la línea de "te la adjunto en el chat"), que es la verdad. Nunca lanza — esto corre
 * mientras se pinta el expediente y una cotización no se puede quedar sin abrir porque
 * falle un enlace de cortesía.
 *
 * La colisión se reintenta un par de veces: con 56^10 combinaciones no va a pasar, pero el
 * índice único es de la base y el día que pase, esto lo resuelve solo.
 */
export async function asegurarShareCode(
  supabase: AnyClient,
  quoteId: string,
  actual?: string | null,
): Promise<string | null> {
  if (actual) return actual;
  for (let intento = 0; intento < 3; intento++) {
    const code = nuevoShareCode();
    const { error } = await supabase
      .from("quotes")
      // `is("share_code", null)` para no pisar el código de una cotización que ya lo tenga:
      // dos pestañas abiertas del mismo expediente entran acá a la vez.
      .update({ share_code: code })
      .eq("id", quoteId)
      .is("share_code", null);
    if (!error) {
      const { data } = await supabase.from("quotes").select("share_code").eq("id", quoteId).maybeSingle();
      const guardado = (data?.share_code as string | null) ?? null;
      if (guardado) return guardado;
      continue;
    }
    // 23505 = unique_violation: el código ya era de otra cotización. Se vuelve a sortear.
    if ((error as { code?: string }).code !== "23505") {
      console.warn("[enlace corto] no pude guardar el código:", error);
      return null;
    }
  }
  return null;
}
