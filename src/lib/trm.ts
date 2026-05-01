import "server-only";
import { createCommercialClient } from "@/lib/supabase/server";

type TRMRow = { date: string; eur_cop: number; source: string; fetched_at: string };

let cache: { value: TRMRow; expiresAt: number } | null = null;
const HOUR = 60 * 60 * 1000;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchTRMFromAPIs(): Promise<{ rate: number; source: string } | null> {
  const apis = [
    { url: process.env.TRM_API_PRIMARY!, source: "exchangerate.host", parse: (j: any) => j?.rates?.COP },
    { url: process.env.TRM_API_FALLBACK!, source: "frankfurter.app", parse: (j: any) => j?.rates?.COP },
  ];
  for (const api of apis) {
    try {
      const r = await fetch(api.url, { next: { revalidate: 3600 } });
      if (!r.ok) continue;
      const j = await r.json();
      const rate = api.parse(j);
      if (typeof rate === "number" && rate > 0) return { rate, source: api.source };
    } catch {}
  }
  return null;
}

/** TRM EUR→COP del día. Cache 1h en memoria del servidor + persistencia en comercial.trm_history. */
export async function getTRMHoy(): Promise<TRMRow | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  const supabase = await createCommercialClient();
  const today = todayISO();

  const { data: existing } = await supabase
    .from("trm_history")
    .select("date,eur_cop,source,fetched_at")
    .eq("date", today)
    .maybeSingle();

  if (existing) {
    cache = { value: existing as TRMRow, expiresAt: now + HOUR };
    return existing as TRMRow;
  }

  const fresh = await fetchTRMFromAPIs();
  if (!fresh) {
    const { data: yesterday } = await supabase
      .from("trm_history")
      .select("date,eur_cop,source,fetched_at")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (yesterday) {
      cache = { value: yesterday as TRMRow, expiresAt: now + 5 * 60 * 1000 };
      return yesterday as TRMRow;
    }
    return null;
  }

  const { data: inserted } = await supabase
    .from("trm_history")
    .upsert({ date: today, eur_cop: fresh.rate, source: fresh.source, fetched_at: new Date().toISOString() })
    .select("date,eur_cop,source,fetched_at")
    .single();

  if (inserted) {
    cache = { value: inserted as TRMRow, expiresAt: now + HOUR };
    return inserted as TRMRow;
  }
  return null;
}
