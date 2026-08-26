"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FORMATOS_LISTA, type FormatoId } from "@/lib/contenido/formatos";
import type { DefinicionPlantilla, Slide, FotoSlide } from "@/lib/contenido/tipos";
import { AJUSTES_POR_DEFECTO, type AjustesSlide } from "@/lib/contenido/ajustes";
import type { FotoDelBanco, FotoSubida } from "@/lib/contenido/fotos";
import type { RutaLista } from "@/lib/contenido/datos";
import { guardarSlides, cambiarFormato } from "./actions";
import { renombrarPieza } from "../actions";
import { aplicarRuta } from "./rutaActions";
import Lienzo from "./Lienzo";
import PanelCampos from "./PanelCampos";
import TiraSlides from "./TiraSlides";
import SelectorFoto from "./SelectorFoto";
import PanelAjustes from "./PanelAjustes";
import Exportar from "./Exportar";

export type EditorProps = {
  piezaId: string;
  tituloInicial: string;
  formatoInicial: FormatoId;
  slidesIniciales: Slide[];
  /** El registry serializado: el servidor no puede mandar componentes al cliente. */
  definiciones: DefinicionPlantilla[];
  valoresPorDefectoPorPlantilla: Record<string, Record<string, string>>;
  banco: FotoDelBanco[];
  subidas: FotoSubida[];
  rutas: RutaLista[];
};

// El guardado ya no está en el camino del preview, así que puede esperar tranquilo.
const DEBOUNCE_MS = 800;

export default function Editor({
  piezaId,
  tituloInicial,
  formatoInicial,
  slidesIniciales,
  definiciones,
  valoresPorDefectoPorPlantilla,
  banco,
  subidas,
  rutas,
}: EditorProps) {
  const [slides, setSlides] = useState<Slide[]>(slidesIniciales);
  const [formato, setFormato] = useState<FormatoId>(formatoInicial);
  const [activo, setActivo] = useState(0);
  const [mostrarGuias, setMostrarGuias] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, iniciarGuardado] = useTransition();

  // El título. Antes era un <h1> fijo: `renombrarPieza` existía en `../actions.ts` pero
  // ninguna pantalla la llamaba, así que una pieza creada con el título en blanco (o con
  // un typo) se quedaba así para siempre — la única salida era borrarla y empezar de
  // cero. Ahora es un campo más, con el mismo patrón de guardado con espera que el resto.
  const [titulo, setTitulo] = useState(tituloInicial);
  const temporizadorTitulo = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (temporizadorTitulo.current) clearTimeout(temporizadorTitulo.current);
    if (titulo === tituloInicial) return;
    temporizadorTitulo.current = setTimeout(() => {
      void (async () => {
        const r = await renombrarPieza(piezaId, titulo);
        if ("error" in r && r.error) setAviso(r.error);
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (temporizadorTitulo.current) clearTimeout(temporizadorTitulo.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulo, piezaId]);

  // El preview ya NO depende del guardado: `Lienzo` dibuja el slide tal como está en
  // pantalla, contra un endpoint que no toca la base. El guardado sigue ocurriendo, pero
  // por su cuenta y sin que nadie lo espere — antes ese ida y vuelta era lo que hacía que
  // cada tecla costara uno o dos segundos.
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendiente = useRef<Slide[] | null>(null);

  const porId = new Map(definiciones.map((d) => [d.id, d]));
  const slideActivo = slides[activo] ?? null;
  const defActiva = slideActivo ? porId.get(slideActivo.plantilla) ?? null : null;

  const guardar = useCallback(
    (nuevos: Slide[]) => {
      iniciarGuardado(async () => {
        const r = await guardarSlides(piezaId, nuevos);
        if ("error" in r && r.error) {
          setAviso(r.error);
          return;
        }
        setAviso(null);
      });
    },
    [piezaId],
  );

  /** Programa el guardado. Si el usuario sigue escribiendo, se reinicia la cuenta. */
  const programarGuardado = useCallback(
    (nuevos: Slide[]) => {
      pendiente.current = nuevos;
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => {
        const aGuardar = pendiente.current;
        pendiente.current = null;
        if (aGuardar) guardar(aGuardar);
      }, DEBOUNCE_MS);
    },
    [guardar],
  );

  // Si el usuario cierra la pestaña con un guardado pendiente, se pierde lo último escrito.
  // Avisarlo es más honesto que fingir que ya estaba guardado. Cubre los slides Y el
  // título: antes solo miraba `pendiente.current`, así que escribir un título nuevo y
  // cerrar la pestaña antes de los 800 ms no avisaba nada.
  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      if (pendiente.current || temporizadorTitulo.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, []);

  // Al cambiar de slide se guarda ya lo que estuviera pendiente, para no perderlo.
  const seleccionar = (i: number) => {
    // Se fuerza el guardado pendiente para no perderlo al cambiar de slide. El preview no
    // espera a nada: cambia solo al cambiar `activo`.
    if (temporizador.current) clearTimeout(temporizador.current);
    const aGuardar = pendiente.current;
    pendiente.current = null;
    if (aGuardar) guardar(aGuardar);
    setActivo(i);
  };

  /** Elegir una ruta no cambia un campo: trae del catálogo varios de una sola vez. */
  const elegirRuta = (rutaId: string) => {
    // Se cancela el guardado con debounce que hubiera quedado programado por un campo de
    // texto (igual que `aplicarYGuardar`). Sin esto: escribes en un campo, cambias de
    // ruta antes de que pasen los 800 ms, el guardado de la ruta corre primero y guarda
    // bien — pero el temporizador viejo sigue vivo y dispara después con la foto vieja de
    // `slides` (de antes de aplicar la ruta), pisando el precio/km recién traídos con
    // datos desactualizados.
    if (temporizador.current) clearTimeout(temporizador.current);
    pendiente.current = null;
    iniciarGuardado(async () => {
      const r = await aplicarRuta(rutaId);
      if ("error" in r && r.error) {
        setAviso(r.error);
        return;
      }
      setAviso(("aviso" in r && r.aviso) || null);
      const nuevos = slides.map((s, i) =>
        i === activo ? { ...s, valores: { ...s.valores, ...r.valores } } : s,
      );
      setSlides(nuevos);
      const guardado = await guardarSlides(piezaId, nuevos);
      if ("error" in guardado && guardado.error) setAviso(guardado.error);
    });
  };

  /** Las perillas de diseño. Se guardan con la misma espera que los textos. */
  const cambiarAjustes = (ajustes: Partial<AjustesSlide>) => {
    // Se guarda el objeto COMPLETO, no el parcial: así el slide siempre lleva valores
    // válidos y el render no tiene que adivinar. Un objeto vacío significa "volver al
    // original", y entonces se quita del todo.
    const completo: AjustesSlide | undefined = Object.keys(ajustes).length
      ? { ...AJUSTES_POR_DEFECTO, ...ajustes }
      : undefined;
    const nuevos: Slide[] = slides.map((s, i) => (i === activo ? { ...s, ajustes: completo } : s));
    setSlides(nuevos);
    programarGuardado(nuevos);
  };

  const cambiarFoto = (foto: FotoSlide | null) => {
    const nuevos = slides.map((s, i) => (i === activo ? { ...s, foto } : s));
    // La foto no se escribe letra a letra: se guarda de una, sin esperar el debounce.
    aplicarYGuardar(nuevos, activo);
  };

  const cambiarCampo = (campoId: string, valor: string) => {
    const nuevos = slides.map((s, i) =>
      i === activo ? { ...s, valores: { ...s.valores, [campoId]: valor } } : s,
    );
    setSlides(nuevos);
    programarGuardado(nuevos);
  };

  const aplicarYGuardar = (nuevos: Slide[], indice: number) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    pendiente.current = null;
    setSlides(nuevos);
    setActivo(indice);
    guardar(nuevos);
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
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href="/contenido" className="text-muted hover:text-fg shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            aria-label="Título de la pieza"
            placeholder="Pieza sin título"
            className="font-display text-2xl text-bosque bg-transparent border border-transparent rounded-md px-1.5 -mx-1.5 py-0.5 min-w-0 flex-1 max-w-lg truncate focus:outline-none focus:border-bosque focus:bg-bg-card"
          />
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
          <Exportar
            piezaId={piezaId}
            titulo={titulo}
            formato={formato}
            slides={slides}
            hayPendiente={guardando}
          />
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
            formato={formato}
            slide={slideActivo}
            indice={activo}
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
                rutas={rutas}
                onCambio={cambiarCampo}
                onElegirRuta={elegirRuta}
              />
              <div className="mt-4 pt-4 border-t border-border">
                <PanelAjustes
                  ajustes={slideActivo?.ajustes}
                  usaFoto={defActiva.usaFoto && Boolean(slideActivo?.foto)}
                  tieneFranja={defActiva.rol === "portada"}
                  onCambio={cambiarAjustes}
                />
              </div>

              {defActiva.usaFoto && (
                <div className="mt-4 pt-4 border-t border-border">
                  <span className="block text-xs text-fg mb-2">Foto</span>
                  <SelectorFoto
                    banco={banco}
                    subidasIniciales={subidas}
                    seleccionada={slideActivo?.foto ?? null}
                    onElegir={cambiarFoto}
                  />
                </div>
              )}
            </>
          ) : slides.length === 0 ? (
            // Caso de verdad excepcional (no debería pasar desde el editor: `borrar()`
            // nunca deja una pieza en cero), pero una pieza vieja o sembrada por un
            // guion puede llegar así, y el mensaje de "esta plantilla ya no existe" era
            // directamente falso acá: no hay slide ninguno que borrar o cambiar.
            <p className="text-xs text-muted">
              Esta pieza no tiene ningún slide todavía. Agrega el primero desde
              &quot;Agregar slide&quot;, en la columna de la izquierda.
            </p>
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
