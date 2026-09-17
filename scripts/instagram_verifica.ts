/**
 * Comprueba que el token de Instagram de `public.ig_tokens` sigue vivo y cuánta cuota de
 * publicación por API queda (100 cada 24 h). No publica nada.
 *
 *   npx tsx --env-file=.env.local scripts/instagram_verifica.ts
 *
 * Es deliberadamente autónomo (no importa src/lib/contenido/instagram.ts, que lleva
 * `server-only` y no carga desde Node pelado).
 */
import { createClient } from "@supabase/supabase-js";

const GRAPH = "https://graph.facebook.com/v21.0";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local).");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.from("ig_tokens").select("ig_user_id,access_token,expires_at").eq("id", 1).maybeSingle();
  if (error || !data) throw new Error(`ig_tokens: ${error?.message ?? "sin fila id=1"}`);

  const q = (path: string, fields: string) =>
    fetch(`${GRAPH}/${path}?fields=${fields}&access_token=${encodeURIComponent(data.access_token)}`).then(async (r) => ({ ok: r.ok, json: await r.json() }));

  const cuenta = await q(String(data.ig_user_id), "username,name");
  if (!cuenta.ok) throw new Error(`El token NO sirve: ${JSON.stringify(cuenta.json)}`);
  console.log(`✓ token vivo · cuenta @${cuenta.json.username} (${cuenta.json.name ?? ""}) · expires_at=${data.expires_at ?? "permanente"}`);

  const limite = await q(`${data.ig_user_id}/content_publishing_limit`, "quota_usage,config");
  const fila = limite.json?.data?.[0];
  if (limite.ok && fila) console.log(`✓ cuota API 24h: ${fila.quota_usage} de ${fila.config?.quota_total ?? 100} usadas`);
  else console.log(`· cuota no disponible: ${JSON.stringify(limite.json)}`);
}

main().catch((e) => { console.error(`✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
