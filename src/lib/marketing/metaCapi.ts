/**
 * Conversions API de Meta (server-side).
 *
 * El navegador ya manda el evento con el píxel usando el código de la cotización
 * como `eventID`. Aquí mandamos el MISMO evento con el mismo `event_id`, así que
 * Meta deduplica y se queda con uno solo — pero con los datos de contacto
 * hasheados, que es lo que sube la calidad de coincidencia (objetivo: > 7).
 *
 * Nunca rompe el flujo: si falta configuración o la llamada falla, se registra
 * y la cotización sigue su curso. El lead vale más que el evento.
 */

import { createHash } from "node:crypto";

const VERSION = "v21.0";

export type UsuarioCapi = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  country?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

export type EventoCapi = {
  eventName: "Lead" | "Contact" | "ViewContent" | "Purchase";
  eventId: string;
  eventSourceUrl?: string | null;
  value?: number | null;
  currency?: string;
  contentName?: string | null;
  contentCategory?: string | null;
  user: UsuarioCapi;
};

function sha256(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

/** Meta pide minúsculas y sin espacios antes de hashear. */
function hashNorm(v: string | null | undefined): string | undefined {
  const s = (v ?? "").trim().toLowerCase();
  return s ? sha256(s) : undefined;
}

/** Teléfono: solo dígitos, con indicativo de país y sin el "+". */
function hashTelefono(v: string | null | undefined): string | undefined {
  const d = (v ?? "").replace(/\D+/g, "");
  return d.length >= 8 ? sha256(d) : undefined;
}

/** País en ISO-3166 alfa-2 minúsculas. Acepta nombres largos de LatAm. */
const PAISES: Record<string, string> = {
  colombia: "co", mexico: "mx", méxico: "mx", peru: "pe", perú: "pe",
  chile: "cl", ecuador: "ec", argentina: "ar", venezuela: "ve",
  espana: "es", españa: "es", "estados unidos": "us", panama: "pa", panamá: "pa",
  "costa rica": "cr", guatemala: "gt", uruguay: "uy", bolivia: "bo", paraguay: "py",
};

function hashPais(v: string | null | undefined): string | undefined {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (s.length === 2) return sha256(s);
  const iso = PAISES[s];
  return iso ? sha256(iso) : undefined;
}

function configurado(): { pixelId: string; token: string } | null {
  const pixelId = process.env.META_PIXEL_ID?.trim();
  const token = process.env.META_CAPI_TOKEN?.trim();
  if (!pixelId || !token) return null;
  return { pixelId, token };
}

export async function enviarEventoMeta(evento: EventoCapi): Promise<{ ok: boolean; error?: string }> {
  const cfg = configurado();
  if (!cfg) return { ok: false, error: "sin_configurar" };

  const u = evento.user;
  const userData: Record<string, unknown> = {};
  const em = hashNorm(u.email);
  const ph = hashTelefono(u.phone);
  const fn = hashNorm(u.firstName);
  const country = hashPais(u.country);
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (fn) userData.fn = [fn];
  if (country) userData.country = [country];
  if (u.ip) userData.client_ip_address = u.ip;
  if (u.userAgent) userData.client_user_agent = u.userAgent;
  if (u.fbp) userData.fbp = u.fbp;
  if (u.fbc) userData.fbc = u.fbc;

  const customData: Record<string, unknown> = {};
  if (typeof evento.value === "number" && evento.value > 0) {
    customData.value = Number(evento.value.toFixed(2));
    customData.currency = evento.currency ?? "EUR";
  }
  if (evento.contentName) customData.content_name = evento.contentName;
  if (evento.contentCategory) customData.content_category = evento.contentCategory;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: evento.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: evento.eventId,
        action_source: "website",
        ...(evento.eventSourceUrl ? { event_source_url: evento.eventSourceUrl } : {}),
        user_data: userData,
        ...(Object.keys(customData).length ? { custom_data: customData } : {}),
      },
    ],
  };
  const test = process.env.META_TEST_EVENT_CODE?.trim();
  if (test) payload.test_event_code = test;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${VERSION}/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      console.error("[meta-capi]", evento.eventName, evento.eventId, res.status, texto.slice(0, 400));
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[meta-capi] fallo de red:", evento.eventId, e);
    return { ok: false, error: "red" };
  }
}
