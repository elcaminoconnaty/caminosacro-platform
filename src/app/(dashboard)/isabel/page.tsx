export default function IsabelPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="font-display text-3xl text-bosque">Isabel</h1>
        <p className="text-muted text-sm mt-1">Segunda asistente de Camino Sacro.</p>
      </header>

      <div className="bg-bg-card border border-border rounded-xl p-8 text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-dorado/30 text-dorado-oscuro text-xs font-medium">
          Próximamente
        </div>
        <h2 className="font-display text-xl text-bosque">Isabel se conectará pronto</h2>
        <p className="text-sm text-muted">
          Cuando Isabel esté operativa, este dashboard mostrará sus conversaciones, leads y métricas con la misma estructura que Clara.
        </p>
        <p className="text-xs text-muted">
          Las tablas de Isabel se configuran en <span className="font-medium">Configuración → Asistentes</span> sin tocar código.
        </p>
      </div>
    </div>
  );
}
