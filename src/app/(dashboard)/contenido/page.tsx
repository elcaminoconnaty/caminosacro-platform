// Portada del Estudio de Contenido. En la Etapa 0 solo anuncia el módulo y muestra en qué va
// la construcción; la bandeja de piezas y el panel de ideas la reemplazan en la Etapa 3.
// El detalle de cada etapa vive en PLAN_CONTENIDO.md, en la raíz de la app.

const ETAPAS = [
  { n: 0, titulo: "El módulo existe", detalle: "Entrada en el menú y bitácora de construcción", lista: true },
  { n: 1, titulo: "Identidad renderizable", detalle: "Paleta, formatos y tipografías de marca como imagen" },
  { n: 2, titulo: "Motor de render", detalle: "Una pieza guardada sale como PNG con la marca puesta" },
  { n: 3, titulo: "Editor", detalle: "Escribir el texto y ver la pieza cambiar al instante" },
  { n: 4, titulo: "Plantillas y gráficos", detalle: "Nueve plantillas alimentadas del catálogo de rutas" },
  { n: 5, titulo: "Fotos", detalle: "Banco de Instagram, subida suelta, carpeta o sin foto" },
  { n: 6, titulo: "Exportar", detalle: "El carrusel completo listo para subir a Instagram" },
  { n: 7, titulo: "Copy e ideas", detalle: "Qué publicar y con qué palabras, según lo que ya rindió" },
  { n: 8, titulo: "Publicar", detalle: "Un botón que sube la pieza a @caminosacro.agencia" },
];

export default function ContenidoPage() {
  const listas = ETAPAS.filter((e) => e.lista).length;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-bosque">Estudio de contenido</h1>
      <p className="mt-2 text-sm text-muted leading-relaxed">
        Carruseles, portadas de reel, historias y piezas con gráficos para{" "}
        <span className="text-fg">@caminosacro.agencia</span>, con la identidad de Camino Sacro ya
        puesta. Montas la foto, cambias los textos y la pieza sale lista.
      </p>

      <div className="mt-8 bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-baseline justify-between">
          <span className="font-display text-lg text-bosque">En construcción</span>
          <span className="text-xs text-muted">
            {listas} de {ETAPAS.length} etapas
          </span>
        </div>
        <ul className="divide-y divide-border">
          {ETAPAS.map((e) => (
            <li key={e.n} className="px-5 py-3 flex items-start gap-3">
              <span
                className={
                  e.lista
                    ? "mt-0.5 shrink-0 w-6 h-6 rounded-full bg-bosque text-white text-xs flex items-center justify-center"
                    : "mt-0.5 shrink-0 w-6 h-6 rounded-full bg-taupe text-muted text-xs flex items-center justify-center"
                }
              >
                {e.n}
              </span>
              <span className="flex-1">
                <span className={e.lista ? "text-sm text-fg" : "text-sm text-muted"}>{e.titulo}</span>
                <span className="block text-xs text-muted mt-0.5">{e.detalle}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-muted">
        El avance detallado se lleva en <code className="text-fg">PLAN_CONTENIDO.md</code>.
      </p>
    </div>
  );
}
