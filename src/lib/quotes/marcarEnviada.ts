import "server-only";

import type { ComercialClient } from "@/lib/quotes/pdf";

/**
 * Deja constancia de que la cotización salió al cliente.
 *
 * Un solo sitio lo decide, porque son tres los caminos que mandan una cotización: la
 * tarjeta del expediente, el cotizador público de caminosacro.com y el de WordPress. Los
 * dos últimos ni siquiera escribían `email_sent_at`, así que en el CRM salían como no
 * enviadas para siempre.
 *
 * Solo promueve desde `sin_enviar`. Reenviarle la cotización a alguien que ya la aceptó o
 * ya pagó no puede devolver el expediente a "Enviada": eso sería perder el estado real de
 * la venta por un reenvío de cortesía.
 *
 * Nunca lanza. Marcar mal el expediente es un problema; tumbar un envío que ya salió, uno
 * peor — el correo ya está en camino y no se puede deshacer.
 */
export async function marcarCotizacionEnviada(
  supabase: ComercialClient,
  quoteId: string,
): Promise<void> {
  try {
    const { data: q } = await supabase
      .from("quotes")
      .select("status")
      .eq("id", quoteId)
      .maybeSingle();

    const parche: Record<string, string> = { email_sent_at: new Date().toISOString() };
    if (q?.status === "sin_enviar") parche.status = "enviada";

    await supabase.from("quotes").update(parche).eq("id", quoteId);
  } catch (e) {
    console.warn("[cotizacion] no pude marcarla como enviada:", e);
  }
}
