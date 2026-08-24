import { createPublicSchemaClient } from "@/lib/supabase/server";

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

          {n < 30 && (
            <p className="px-5 py-2.5 text-[11px] text-dorado-oscuro border-t border-border leading-snug">
              Muestra pequeña: con {n} posts medidos, estos números sirven para orientarse,
              no para sacar conclusiones firmes.
            </p>
          )}

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
