import { createPublicSchemaClient } from "@/lib/supabase/server";
import { pesoDeLasMetricas } from "@/lib/contenido/ideas";

/**
 * Cómo va la cuenta, con la n SIEMPRE a la vista.
 *
 * Con ~18 posts publicados, un promedio sin su tamaño de muestra es una afirmación que no
 * se sostiene. Mostrar la n al lado del número no es un detalle de rigor académico: es lo
 * que evita que el módulo diga con seguridad algo que no sabe.
 */
export default async function ResumenMetricas() {
  const supabase = await createPublicSchemaClient();
  const [{ data: metricas }, { data: aprendizaje }] = await Promise.all([
    supabase.from("post_metricas").select("reach,saved,shares,profile_visits,likes"),
    supabase.from("aprendizajes").select("periodo,resumen").eq("vigente", true).maybeSingle(),
  ]);

  const n = metricas?.length ?? 0;
  const suma = (k: "reach" | "saved" | "shares" | "profile_visits" | "likes") =>
    (metricas ?? []).reduce((a, m) => a + (m[k] ?? 0), 0);

  const tarjetas = [
    { etiqueta: "Alcance medio", valor: n ? Math.round(suma("reach") / n) : 0 },
    { etiqueta: "Guardados", valor: suma("saved") },
    { etiqueta: "Compartidos", valor: suma("shares") },
    { etiqueta: "Visitas al perfil", valor: suma("profile_visits") },
  ];

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-baseline justify-between gap-3">
        <span className="font-display text-lg text-bosque">Cómo va la cuenta</span>
        <span className="text-[11px] text-muted">
          sobre {n} {n === 1 ? "post medido" : "posts medidos"}
        </span>
      </div>

      {n === 0 ? (
        <p className="px-5 py-6 text-xs text-muted">
          Todavía no hay métricas recogidas de Instagram.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border">
            {tarjetas.map((t) => (
              <li key={t.etiqueta} className="px-5 py-4">
                <span className="block font-display text-2xl text-bosque">{t.valor}</span>
                <span className="block text-[11px] text-muted mt-0.5">{t.etiqueta}</span>
              </li>
            ))}
          </ul>

          {/*
            Este aviso cambia solo a medida que entran métricas. Nico pidió que las ideas
            "no salgan de la nada" y sabe que al principio van a ser torpes: decirle en qué
            punto está la cuenta es más honesto que un mensaje fijo, y le deja ver que el
            módulo mejora solo sin que nadie lo toque.
          */}
          {(() => {
            const peso = pesoDeLasMetricas(n);
            if (peso === "alto") return null;
            return (
              <p className="px-5 py-2.5 text-[11px] text-dorado-oscuro border-t border-border leading-snug">
                {peso === "bajo"
                  ? `Con ${n} posts medidos todavía es poca data: las ideas se apoyan sobre todo en el catálogo y en lo que se está cotizando. A partir de unos 20 posts las métricas empiezan a pesar.`
                  : `Con ${n} posts medidos ya se ven tendencias, pero aún no son firmes. Pasados los 40, las métricas pasan a ser la señal principal.`}
              </p>
            );
          })()}

          {aprendizaje && (
            <details className="border-t border-border">
              <summary className="px-5 py-2.5 text-[11px] text-muted cursor-pointer hover:bg-taupe/20">
                Lo que aprendió el bot · {aprendizaje.periodo}
              </summary>
              <p className="px-5 pb-4 text-[11px] text-fg leading-relaxed whitespace-pre-wrap">
                {aprendizaje.resumen}
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
