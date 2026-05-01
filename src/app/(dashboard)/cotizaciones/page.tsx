import Link from "next/link";

export default function CotizacionesIndex() {
  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl text-bosque">Cotizaciones</h1>
          <p className="text-muted text-sm mt-1">Crear y consultar cotizaciones del catálogo.</p>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="px-4 py-2 rounded-md bg-bosque text-white text-sm font-medium hover:bg-bosque-medio transition"
        >
          Nueva cotización
        </Link>
      </header>

      <div className="bg-bg-card border border-border rounded-xl p-8 text-center text-muted text-sm">
        El listado completo vive en <Link href="/seguimiento" className="text-bosque underline">Seguimiento</Link>. Aquí solo arrancás una nueva cotización.
      </div>
    </div>
  );
}
