// Pantalla de aviso de la página pública de firma (enlace vencido, ya firmado, error…).
// Vive aparte porque la usan tanto page.tsx (server) como error.tsx (client).

export default function Aviso({
  titulo,
  detalle,
  children,
}: {
  titulo: string;
  detalle: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-crema flex items-center justify-center px-4">
      <div className="bg-white border border-border rounded-2xl px-8 py-10 max-w-md text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-dorado-oscuro">Camino Sacro</p>
        <p className="font-display text-3xl text-bosque mt-3">{titulo}</p>
        <p className="text-sm text-muted mt-3">{detalle}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {children}
          <a
            href="mailto:reservas@caminosacro.com"
            className="inline-block rounded-full border border-bosque px-6 py-2.5 text-sm font-medium text-bosque transition hover:bg-bosque hover:text-white"
          >
            Escríbenos
          </a>
        </div>
      </div>
    </main>
  );
}
