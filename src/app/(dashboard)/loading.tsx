// Esqueleto de carga de TODO el panel.
//
// Existe por un hallazgo de la auditoría (B7): en el CRM no había ni un `loading.tsx`, así
// que Next bloqueaba la transición entre pantallas —el navegador se quedaba en la página
// anterior, sin señal ninguna, hasta que el servidor terminaba—. Todas las páginas del
// panel son componentes de servidor `async`, y el expediente hace 21 consultas antes de
// devolver un byte: en el escritorio son décimas, en el celular con datos móviles son
// segundos de pantalla congelada, que es justo cuando la gente vuelve a hacer clic.
//
// Al vivir en `(dashboard)/` cubre las quince pantallas de golpe. Cae dentro del layout,
// así que la barra lateral y la barra superior siguen ahí: lo único que se reemplaza es
// el contenido.
export default function CargandoPanel() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-7 w-56 rounded bg-taupe" />
      <div className="h-4 w-80 rounded bg-taupe/60 mt-3" />
      <div className="grid gap-4 mt-8 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg border border-border bg-white/60" />
        ))}
      </div>
      <div className="mt-6 rounded-lg border border-border bg-white/60">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0">
            <div className="h-3.5 w-28 rounded bg-taupe shrink-0" />
            <div className="h-3.5 flex-1 rounded bg-taupe/50" />
            <div className="h-3.5 w-20 rounded bg-taupe/50 shrink-0 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
