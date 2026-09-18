import "server-only";
import { enviarEventoMeta } from "@/lib/marketing/metaCapi";
import type { createCommercialClient } from "@/lib/supabase/server";

type Cliente = Awaited<ReturnType<typeof createCommercialClient>>;

/**
 * Contarle a Meta que una cotización se convirtió en venta.
 *
 * Hasta ahora Meta solo sabía de "gente que cotiza" (el evento Lead del cotizador) y
 * optimizaba la pauta hacia eso. Con este evento sabe quién compró de verdad, con qué
 * valor, y puede buscar a más personas como esas. Se manda por la Conversions API con
 * la misma identidad que viajó en el Lead (correo, teléfono y las cookies _fbp/_fbc
 * guardadas en la cotización), así Meta lo pega al clic original aunque hayan pasado
 * semanas.
 *
 * Se dispara la primera vez que la cotización entra a un estado de venta (aceptada,
 * pago_parcial o pago_completo). `meta_purchase_sent_at` deja constancia y evita que
 * aceptada → pago_parcial → pago_completo cuenten tres ventas.
 *
 * Nunca lanza: una falla de Meta no puede impedir cambiar el estado de una cotización.
 */
const ESTADOS_VENTA = new Set(["aceptada", "pago_parcial", "pago_completo", "completada"]);

export function esEstadoVenta(status: string | null | undefined): boolean {
  return !!status && ESTADOS_VENTA.has(status);
}

export async function registrarVentaMeta(
  supabase: Cliente,
  quoteId: string,
): Promise<void> {
  try {
    const { data: q } = await supabase
      .from("quotes")
      .select("id,code,client_name,client_email,client_phone,route_name,total_eur,source,fbp,fbc,meta_purchase_sent_at")
      .eq("id", quoteId)
      .maybeSingle();
    if (!q || q.meta_purchase_sent_at) return;

    // Marcar antes de enviar: si dos acciones llegan a la vez, solo una pasa.
    const { data: marcada } = await supabase
      .from("quotes")
      .update({ meta_purchase_sent_at: new Date().toISOString() })
      .eq("id", quoteId)
      .is("meta_purchase_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!marcada) return;

    const r = await enviarEventoMeta({
      eventName: "Purchase",
      eventId: `${q.code}-venta`,
      value: Number(q.total_eur) || null,
      currency: "EUR",
      contentName: q.route_name ?? null,
      contentCategory: q.source === "wordpress" ? "cotizador" : "crm",
      user: {
        email: q.client_email,
        phone: q.client_phone,
        firstName: (q.client_name ?? "").split(" ")[0] || null,
        fbp: q.fbp,
        fbc: q.fbc,
      },
    });
    if (!r.ok) {
      // Que quede reintentable: si Meta no lo recibió, la marca se quita.
      await supabase.from("quotes").update({ meta_purchase_sent_at: null }).eq("id", quoteId);
      console.error("[venta-meta] no se pudo mandar Purchase de", q.code, r.error);
    } else {
      console.info("[venta-meta] Purchase enviado:", q.code, q.total_eur, "EUR");
    }
  } catch (e) {
    console.error("[venta-meta] error inesperado:", quoteId, e);
  }
}
