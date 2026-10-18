import { Suspense } from "react";
import { getTRMHoy } from "@/lib/trm";
import { fechaCorta, trm as fmtTRM } from "@/lib/format";
import { BotonVolver } from "./BotonVolver";

/**
 * En el computador: cabecera clara con la TRM completa, el correo y "Salir".
 * En el celular: cabecera bosque, sólida y pegada arriba, que se mete bajo la barra de
 * estado cuando la plataforma está instalada como app (statusBarStyle black-translucent)
 * y le reserva ese alto con safe-area-inset-top. Ahí va el botón de volver y una TRM
 * corta; "Salir" vive en la hoja "Más" de la barra de abajo.
 */
export async function Topbar({ email }: { email: string }) {
  const trm = await getTRMHoy().catch(() => null);

  return (
    <header className="sticky top-0 z-30 md:static bg-bosque text-white md:bg-bg-card md:text-fg border-b border-bosque md:border-border pt-[env(safe-area-inset-top)] md:pt-0">
      {/* Celular */}
      <div className="md:hidden h-14 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 min-w-0">
          <Suspense fallback={null}>
            <BotonVolver />
          </Suspense>
          <span className="font-display text-xl leading-none truncate">Camino Sacro</span>
        </div>
        {trm ? (
          <span className="shrink-0 text-right leading-tight" title={`${fechaCorta(trm.date)} · ${trm.source}`}>
            <span className="block text-[10px] uppercase tracking-wide text-white/70">TRM hoy</span>
            <span className="block text-sm font-medium text-dorado whitespace-nowrap">€1 = ${fmtTRM(trm.eur_cop)}</span>
          </span>
        ) : (
          <span className="shrink-0 text-xs text-white/70">TRM no disponible</span>
        )}
      </div>

      {/* Computador */}
      <div className="hidden md:flex h-14 px-6 lg:px-10 items-center justify-between">
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
          <span className="text-muted hidden lg:inline">{email}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="px-3 py-1.5 rounded-md border border-border text-fg hover:bg-taupe/40 transition text-xs">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
