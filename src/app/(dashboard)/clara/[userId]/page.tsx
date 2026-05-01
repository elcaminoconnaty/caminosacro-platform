import { createPublicSchemaClient } from "@/lib/supabase/server";
import { groupByDay } from "@/lib/dayGroup";
import Link from "next/link";
import { notFound } from "next/navigation";

type Msg = {
  id: string;
  role: string;
  content: string;
  sent_by: string | null;
  created_at: string | null;
};

const horaLarga = (d: string | null) =>
  d
    ? new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d))
    : "";

export default async function ConvoDetail({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const decoded = decodeURIComponent(userId);
  const supabase = await createPublicSchemaClient();

  const [{ data: convo }, { data: messages }] = await Promise.all([
    supabase.from("conversations").select("*").eq("user_id", decoded).maybeSingle(),
    supabase
      .from("messages")
      .select("id,role,content,sent_by,created_at")
      .eq("conversation_id", decoded)
      .order("created_at", { ascending: true }),
  ]);

  if (!convo) notFound();
  const msgs = (messages ?? []) as Msg[];

  // Agrupado por día, días en orden cronológico ascendente para que se lea de arriba hacia abajo
  const grouped = groupByDay(msgs, (m) => m.created_at)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      }),
    }));

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/clara" className="text-sm text-muted hover:text-fg">
        ← Volver a conversaciones
      </Link>

      <header className="bg-bg-card border border-border rounded-xl px-5 py-4">
        <h1 className="font-display text-2xl text-bosque">
          {convo.display_name || convo.user_phone || convo.user_id}
        </h1>
        <div className="text-sm text-muted mt-1 flex flex-wrap gap-x-4">
          <span>{convo.user_phone}</span>
          <span>Canal: {convo.channel || "—"}</span>
          <span>Status: {convo.status || "—"}</span>
          <span>{msgs.length} mensajes</span>
        </div>
      </header>

      <section className="space-y-6">
        {msgs.length === 0 && <p className="text-sm text-muted">Sin mensajes.</p>}
        {grouped.map((g) => (
          <div key={g.key} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] uppercase tracking-wider text-muted px-2 py-0.5 rounded-full bg-taupe/40 capitalize">
                {g.label}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {g.items.map((m) => {
              const fromUser = m.role === "user";
              return (
                <div key={m.id} className={`flex ${fromUser ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      fromUser ? "bg-bg-card border border-border text-fg" : "bg-bosque text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider mb-1 opacity-70">
                      <span>{m.role}</span>
                      {m.sent_by && <span>· {m.sent_by}</span>}
                      <span className="ml-auto opacity-80 font-mono tabular-nums normal-case">
                        {horaLarga(m.created_at)}
                      </span>
                    </div>
                    {m.content}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
