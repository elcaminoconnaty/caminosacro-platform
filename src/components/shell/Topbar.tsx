import { getTRMHoy } from "@/lib/trm";
import { fechaCorta, trm as fmtTRM } from "@/lib/format";

export async function Topbar({ email }: { email: string }) {
  const trm = await getTRMHoy().catch(() => null);

  return (
    <header className="h-14 px-6 lg:px-10 border-b border-border bg-bg-card flex items-center justify-between">
      <div className="flex items-center gap-4 text-sm">
        {trm ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-muted">TRM hoy</span>
            <span className="font-medium text-bosque">EUR 1 = COP {fmtTRM(trm.eur_cop)}</span>
            <span className="text-muted text-xs">· {fechaCorta(trm.date)} · {trm.source}</span>
          </span>
        ) : (
          <span className="text-muted">TRM no disponible</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted hidden sm:inline">{email}</span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="px-3 py-1.5 rounded-md border border-border text-fg hover:bg-taupe/40 transition text-xs">
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}
