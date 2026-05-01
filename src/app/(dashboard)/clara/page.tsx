import { createPublicSchemaClient } from "@/lib/supabase/server";
import { hace } from "@/lib/format";
import { groupByDay } from "@/lib/dayGroup";
import Link from "next/link";

type Convo = {
  user_id: string;
  user_phone: string | null;
  display_name: string | null;
  channel: string | null;
  status: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: number | null;
};

function temperatura(c: Convo): "caliente" | "tibio" | "frio" {
  if (!c.last_message_at) return "frio";
  const ageMs = Date.now() - new Date(c.last_message_at).getTime();
  const day = 24 * 60 * 60 * 1000;
  if ((c.unread ?? 0) > 0 && ageMs < day) return "caliente";
  if (ageMs < 7 * day) return "tibio";
  return "frio";
}

const tempStyle = {
  caliente: "bg-red-100 text-red-800",
  tibio: "bg-amber-100 text-amber-800",
  frio: "bg-zinc-100 text-zinc-600",
} as const;

const dotStyle = {
  caliente: "bg-red-500",
  tibio: "bg-amber-500",
  frio: "bg-zinc-300",
} as const;

const horaCorta = (d: string | null) =>
  d
    ? new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d))
    : "—";

export default async function ClaraPage() {
  const supabase = await createPublicSchemaClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("user_id,user_phone,display_name,channel,status,last_message,last_message_at,unread")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(500);

  const convos = (data ?? []) as Convo[];

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const total = convos.length;
  const unread = convos.filter((c) => (c.unread ?? 0) > 0).length;
  const activosHoy = convos.filter((c) => c.last_message_at && now - new Date(c.last_message_at).getTime() < day).length;
  const sinRespuesta = convos.filter(
    (c) => (c.unread ?? 0) > 0 && c.last_message_at && now - new Date(c.last_message_at).getTime() > day,
  ).length;
  const enClara = convos.filter((c) => c.status === "clara").length;

  // Agrupado por día (newest day first), dentro del día por hora ascendente (orden de llegada).
  const grouped = groupByDay(convos, (c) => c.last_message_at).map((g) => ({
    ...g,
    items: [...g.items].sort((a, b) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return ta - tb; // ascendente = orden de llegada
    }),
  }));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-bosque">Clara</h1>
        <p className="text-muted text-sm mt-1">Conversaciones agrupadas por día, en orden de llegada.</p>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          Error leyendo conversaciones: {error.message}
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card label="Total leads" value={total} />
        <Card label="Activos 24h" value={activosHoy} />
        <Card label="No leídos" value={unread} accent />
        <Card label="Sin respuesta >24h" value={sinRespuesta} />
        <Card label="En manos de Clara" value={enClara} />
      </section>

      <section className="space-y-6">
        {grouped.length === 0 && !error && (
          <div className="bg-bg-card border border-border rounded-xl px-5 py-12 text-center text-muted text-sm">
            Sin conversaciones aún.
          </div>
        )}

        {grouped.map((g) => (
          <div key={g.key} className="bg-bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-2.5 border-b border-border bg-taupe/40 flex items-center justify-between">
              <h2 className="font-display text-sm text-bosque capitalize">{g.label}</h2>
              <span className="text-xs text-muted">{g.items.length} {g.items.length === 1 ? "conversación" : "conversaciones"}</span>
            </div>
            <ul className="divide-y divide-border">
              {g.items.map((c) => {
                const t = temperatura(c);
                return (
                  <li key={c.user_id}>
                    <Link
                      href={`/clara/${encodeURIComponent(c.user_id)}`}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-taupe/30 transition"
                    >
                      <span className="w-12 shrink-0 text-xs text-muted font-mono tabular-nums">
                        {horaCorta(c.last_message_at)}
                      </span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotStyle[t]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium truncate">{c.display_name || c.user_phone || c.user_id}</span>
                          <span className="text-xs text-muted truncate">{c.user_phone}</span>
                        </div>
                        <p className="text-sm text-muted truncate">{c.last_message || "—"}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {(c.unread ?? 0) > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bosque text-white">{c.unread}</span>
                        )}
                        {c.channel && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-taupe text-muted capitalize">{c.channel}</span>
                        )}
                        {c.status && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-taupe text-muted">{c.status}</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${tempStyle[t]}`}>{t}</span>
                        <span className="text-xs text-muted w-16 text-right">{c.last_message_at ? hace(c.last_message_at) : ""}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-display text-2xl mt-1 ${accent ? "text-dorado-oscuro" : "text-bosque"}`}>{value}</div>
    </div>
  );
}
