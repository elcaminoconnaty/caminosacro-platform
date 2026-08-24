"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FORMATOS_LISTA, type FormatoId } from "@/lib/contenido/formatos";
import { hashSlide } from "@/lib/contenido/hashSlide";
import type { DefinicionPlantilla, Slide } from "@/lib/contenido/tipos";
import { guardarSlides, cambiarFormato } from "./actions";
import Lienzo from "./Lienzo";
import PanelCampos from "./PanelCampos";
import TiraSlides from "./TiraSlides";

export type EditorProps = {
  piezaId: string;
  titulo: string;
  formatoInicial: FormatoId;
  slidesIniciales: Slide[];
  /** El registry serializado: el servidor no puede mandar componentes al cliente. */
  definiciones: DefinicionPlantilla[];
  valoresPorDefectoPorPlantilla: Record<string, Record<string, string>>;
};

const DEBOUNCE_MS = 600;

export default function Editor({
  piezaId,
  titulo,
  formatoInicial,
  slidesIniciales,
  definiciones,
  valoresPorDefectoPorPlantilla,
}: EditorProps) {
  const [slides, setSlides] = useState<Slide[]>(slidesIniciales);
  const [formato, setFormato] = useState<FormatoId>(formatoInicial);
  const [activo, setActivo] = useState(0);
  const [mostrarGuias, setMostrarGuias] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, iniciarGuardado] = useTransition();

  // `version` es la huella de lo GUARDADO, no de lo que se está escribiendo: el preview
  // pinta lo que hay en la base, y por eso solo se refresca cuando el guardado termina.
  const [version, setVersion] = useState(() => hashSlide(slidesIniciales[0] ?? null, formatoInicial));

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendiente = useRef<Slide[] | null>(null);

  const porId = new Map(definiciones.map((d) => [d.id, d]));
  const slideActivo = slides[activo] ?? null;
  const defActiva = slideActivo ? porId.get(slideActivo.plantilla) ?? null : null;

  const guardar = useCallback(
    (nuevos: Slide[], indiceParaPreview: number) => {
      iniciarGuardado(async () => {
        const r = await guardarSlides(piezaId, nuevos);
        if ("error" in r && r.error) {
          setAviso(r.error);
          return;
        }
        setAviso(null);
        setVersion(hashSlide(nuevos[indiceParaPreview] ?? null, formato));
      });
    },
    [piezaId, formato],
  );

  /** Programa el guardado. Si el usuario sigue escribiendo, se reinicia la cuenta. */
  const programarGuardado = useCallback(
    (nuevos: Slide[], indice: number) => {
      pendiente.current = nuevos;
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => {
        const aGuardar = pendiente.current;
        pendiente.current = null;
        if (aGuardar) guardar(aGuardar, indice);
      }, DEBOUNCE_MS);
    },
    [guardar],
  );

  // Si el usuario cierra la pestaña con un guardado pendiente, se pierde lo último escrito.
  // Avisarlo es más honesto que fingir que ya estaba guardado.
  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      if (pendiente.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, []);

  // Al cambiar de slide se guarda ya lo que estuviera pendiente, para no perderlo.
  const seleccionar = (i: number) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    const aGuardar = pendiente.current;
    pendiente.current = null;
    if (aGuardar) guardar(aGuardar, i);
    else setVersion(hashSlide(slides[i] ?? null, formato));
    setActivo(i);
  };

  const cambiarCampo = (campoId: string, valor: string) => {
    const nuevos = slides.map((s, i) =>
      i === activo ? { ...s, valores: { ...s.valores, [campoId]: valor } } : s,
    );
    setSlides(nuevos);
    programarGuardado(nuevos, activo);
  };

  const aplicarYGuardar = (nuevos: Slide[], indice: number) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    pendiente.current = null;
    setSlides(nuevos);
    setActivo(indice);
    guardar(nuevos, indice);
  };

  const agregar = (plantillaId: string) => {
    const nuevo: Slide = {
      plantilla: plantillaId,
      valores: { ...(valoresPorDefectoPorPlantilla[plantillaId] ?? {}) },
      foto: null,
    };
    // Entra después del slide activo: es donde uno espera que aparezca.
    const nuevos = [...slides.slice(0, activo + 1), nuevo, ...slides.slice(activo + 1)];
    aplicarYGuardar(nuevos, activo + 1);
  };

  const duplicar = (i: number) => {
    const copia: Slide = JSON.parse(JSON.stringify(slides[i]));
    aplicarYGuardar([...slides.slice(0, i + 1), copia, ...slides.slice(i + 1)], i + 1);
  };

  const borrar = (i: number) => {
    if (slides.length === 1) return;
    const nuevos = slides.filter((_, j) => j !== i);
    aplicarYGuardar(nuevos, Math.max(0, Math.min(i, nuevos.length - 1)));
  };

  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= slides.length) return;
    const nuevos = [...slides];
    [nuevos[i], nuevos[j]] = [nuevos[j], nuevos[i]];
    aplicarYGuardar(nuevos, j);
  };

  const cambiarElFormato = (nuevo: FormatoId) => {
    setFormato(nuevo);
    setVersion(hashSlide(slides[activo] ?? null, nuevo));
    iniciarGuardado(async () => {
      const r = await cambiarFormato(piezaId, nuevo);
      if ("error" in r && r.error) setAviso(r.error);
    });
  };

  // Las plantillas que tienen sentido en el formato actual.
  const disponibles = definiciones.filter((d) => d.formatos.includes(formato));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/contenido" className="text-muted hover:text-fg shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="font-display text-2xl text-bosque truncate">{titulo}</h1>
        </div>

        <div className="flex items-center gap-3">
          {aviso && <span className="text-xs text-dorado-oscuro">{aviso}</span>}
          <span className="text-xs text-muted">{guardando ? "Guardando…" : "Guardado"}</span>
          <select
            value={formato}
            onChange={(e) => cambiarElFormato(e.target.value as FormatoId)}
            className="px-3 py-1.5 rounded-md border border-border bg-bg-card text-xs focus:outline-none focus:border-bosque"
          >
            {FORMATOS_LISTA.map((f) => (
              <option key={f.id} value={f.id}>
                {f.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_320px] gap-5 items-start">
        <div className="bg-bg-card border border-border rounded-xl p-3">
          <TiraSlides
            slides={slides}
            activo={activo}
            nombrePlantilla={(id) => porId.get(id)?.nombre ?? id}
            plantillasDisponibles={disponibles}
            onSeleccionar={seleccionar}
            onAgregar={agregar}
            onDuplicar={duplicar}
            onBorrar={borrar}
            onMover={mover}
          />
        </div>

        <div className="flex flex-col items-center gap-3">
          <Lienzo
            piezaId={piezaId}
            formato={formato}
            indice={activo}
            version={version}
            guardando={guardando}
            mostrarGuias={mostrarGuias}
          />
          {FORMATOS_LISTA.find((f) => f.id === formato)?.zonaSegura && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={mostrarGuias}
                onChange={(e) => setMostrarGuias(e.target.checked)}
              />
              Ver zona segura
            </label>
          )}
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-4">
          {defActiva ? (
            <>
              <div className="mb-4 pb-3 border-b border-border">
                <span className="block text-sm text-fg">{defActiva.nombre}</span>
                <span className="block text-[11px] text-muted leading-snug mt-0.5">
                  {defActiva.descripcion}
                </span>
              </div>
              <PanelCampos
                definicion={defActiva}
                valores={slideActivo?.valores ?? {}}
                onCambio={cambiarCampo}
              />
              {defActiva.usaFoto && (
                <p className="mt-4 pt-3 border-t border-border text-[11px] text-muted leading-snug">
                  El selector de fotos llega en la siguiente etapa. Por ahora esta plantilla
                  se dibuja con el fondo verde de marca.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted">
              Este slide usa una plantilla que ya no existe en el catálogo. Bórralo o
              cámbialo por otra.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
