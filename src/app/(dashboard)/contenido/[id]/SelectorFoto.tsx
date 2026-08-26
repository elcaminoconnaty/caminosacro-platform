"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Upload, FolderOpen, ImageOff, Check, X, Images, Search, Loader2 } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/client";
import { rutaFotoContenido, sinBucket } from "@/lib/storage/paths";
import { cn } from "@/lib/cn";
import { miniatura } from "@/lib/contenido/miniatura";
import type { FiltroEstado, FotoBuscada, FotoDelBanco, FotoSubida, RutaDeFotos } from "@/lib/contenido/fotos";
import type { FotoSlide } from "@/lib/contenido/tipos";
import { buscarFotosAccion, registrarSubida, rutasDeFotos } from "./fotoActions";

/**
 * Tamaño de tanda del buscador. Duplica `TANDA_FOTOS` de `src/lib/contenido/fotos.ts` a
 * propósito: ese módulo lleva `import "server-only"` y no se puede importar su valor desde
 * un componente cliente (rompe el build: "server-only cannot be imported from a Client
 * Component"). Solo se importan tipos de ahí arriba, que el compilador borra.
 */
const TANDA_FOTOS = 48;

export type SelectorFotoProps = {
  banco: FotoDelBanco[];
  subidasIniciales: FotoSubida[];
  seleccionada: FotoSlide | null;
  onElegir: (foto: FotoSlide | null) => void;
};

/** Las cuatro fuentes de foto del editor. "subir" y "sin" son solo pestañas de la interfaz. */
type Pestana = "banco" | "subidas" | "subir" | "sin";

const BUCKET = "contenido-fotos";

/** La pestaña de fuente equivalente para `ConsultaFotos`; `null` si no aplica (subir/sin). */
function fuenteDe(pestana: Pestana): "banco" | "subida" | null {
  if (pestana === "banco") return "banco";
  if (pestana === "subidas") return "subida";
  return null;
}

/** Resultado de una búsqueda o filtro activo. `null` = sin filtro: se muestran las listas base. */
type Resultado = {
  fotos: FotoBuscada[];
  total: number;
  hayMas: boolean;
  desde: number;
} | null;

const ESPERA_BUSQUEDA_MS = 300;

/**
 * Selector de foto del editor de contenido.
 *
 * Se ve como una miniatura + botón en el panel lateral; al abrir, un modal casi a
 * pantalla completa deja ver la foto elegida entre 177 sin apretujarse en una rejilla
 * de 3 columnas y 256px (T6 — PLAN_CONTENIDO.md).
 */
export default function SelectorFoto({
  banco,
  subidasIniciales,
  seleccionada,
  onElegir,
}: SelectorFotoProps) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>(seleccionada?.origen === "subida" ? "subidas" : "banco");
  const [subidas, setSubidas] = useState<FotoSubida[]>(subidasIniciales);
  const [subiendo, setSubiendo] = useState<{ hechas: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  // Buscador y filtros (T6 paso 2).
  const [texto, setTexto] = useState("");
  const [textoDebounced, setTextoDebounced] = useState("");
  const [ruta, setRuta] = useState<string | null>(null);
  const [estado, setEstado] = useState<FiltroEstado>("todas");
  const [rutas, setRutas] = useState<Partial<Record<"banco" | "subida", RutaDeFotos[]>>>({});
  const [resultado, setResultado] = useState<Resultado>(null);
  const [buscando, setBuscando] = useState(false);
  // Antes, si `buscarFotosAccion` fallaba (red, servidor caído), se guardaba como un
  // resultado de "0 fotos" y el usuario veía "Ninguna foto cumple esa búsqueda" — un fallo
  // real disfrazado de búsqueda legítima sin coincidencias. Ahora se distingue.
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const rutasPedidas = useRef<Set<"banco" | "subida">>(new Set());

  // Tandas cargadas de más allá de la semilla inicial (T6 paso 3), una por fuente. Sin
  // filtro activo la rejilla es `banco`/`subidas` + esto; con filtro, pagina `resultado`.
  const [masBanco, setMasBanco] = useState<FotoBuscada[]>([]);
  const [masSubidas, setMasSubidas] = useState<FotoBuscada[]>([]);
  const [hayMasBase, setHayMasBase] = useState<Record<"banco" | "subida", boolean>>(() => ({
    banco: banco.length >= TANDA_FOTOS,
    subida: subidasIniciales.length >= TANDA_FOTOS,
  }));
  const [cargandoMas, setCargandoMas] = useState(false);

  // Si el archivo de la foto elegida ya no existe en Storage (se borró aparte, o era una
  // subida suelta que se movió), el <img> de acá abajo rompía en silencio: un ícono roto
  // de 64×64 sin texto, indistinguible de "está cargando". Con esto se avisa de verdad.
  const [miniaturaRota, setMiniaturaRota] = useState(false);
  // Al cambiar de foto se olvida el fallo anterior. Se compara en el render con la url
  // previa en vez de usar un efecto: un efecto que solo llama a setState renderiza dos
  // veces y deja un instante mostrando "foto rota" sobre la foto nueva, que aún no falló.
  const urlPrevia = useRef(seleccionada?.url);
  if (urlPrevia.current !== seleccionada?.url) {
    urlPrevia.current = seleccionada?.url;
    if (miniaturaRota) setMiniaturaRota(false);
  }

  const inputArchivos = useRef<HTMLInputElement>(null);
  const inputCarpeta = useRef<HTMLInputElement>(null);
  const centinela = useRef<HTMLDivElement>(null);

  const fuenteActiva = fuenteDe(pestana);

  // El término se aplica 300ms después de la última tecla: no se busca en cada pulsación.
  useEffect(() => {
    const t = setTimeout(() => setTextoDebounced(texto), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [texto]);

  /**
   * Cambiar de pestaña limpia los filtros: los chips de ruta y el estado son propios de cada
   * fuente, y arrastrar un filtro de una a otra confunde más de lo que ayuda.
   *
   * Se hace AQUÍ y no en un efecto que reaccione a `pestana`. Un efecto que solo llama a
   * setState se ejecuta DESPUÉS del render, así que provoca un segundo render en cascada
   * —lo marca `react-hooks/set-state-in-effect`— y durante un instante se pinta la pestaña
   * nueva con los filtros de la vieja. Limpiar en el manejador es un solo render y no hay
   * estado intermedio que se vea.
   */
  function cambiarPestana(p: Pestana) {
    setPestana(p);
    setTexto("");
    setTextoDebounced("");
    setRuta(null);
    setEstado("todas");
    setResultado(null);
    setErrorBusqueda(null);
  }

  // Chips de ruta: se piden una vez por fuente y se cachean, no hay lista fija en ningún lado.
  useEffect(() => {
    if (!fuenteActiva || rutasPedidas.current.has(fuenteActiva)) return;
    rutasPedidas.current.add(fuenteActiva);
    let cancelado = false;
    rutasDeFotos(fuenteActiva).then((r) => {
      if (cancelado || !("ok" in r) || !r.ok) return;
      setRutas((prev) => ({ ...prev, [fuenteActiva]: r.rutas }));
    });
    return () => {
      cancelado = true;
    };
  }, [fuenteActiva]);

  /**
   * ¿Hay algún filtro puesto? Se deriva en cada render en vez de guardarse: depende solo de
   * cosas que ya son estado, y guardarla obligaría a mantenerla sincronizada a mano.
   */
  const filtrando =
    textoDebounced.trim() !== "" || ruta !== null || (fuenteActiva === "banco" && estado !== "todas");

  // La búsqueda de verdad: solo se dispara si hay algún filtro activo. Sin filtro se ven las
  // listas base (banco/subidas) que ya trajo el editor, para que abrir el modal sea instantáneo.
  useEffect(() => {
    // `filtrando` se calcula en el render (ver arriba) y aquí solo se lee: si no hay filtro
    // no se pide nada Y NO SE LIMPIA EL ESTADO. Limpiarlo aquí era un setState dentro del
    // efecto, o sea un render de más; ahora el render simplemente ignora `resultado`
    // cuando no se está filtrando, que es la forma derivada del mismo comportamiento.
    if (!fuenteActiva || !filtrando) return;
    let cancelado = false;
    // El "buscando" se marca en un microtask, no en el cuerpo del efecto: un setState
    // síncrono ahí encadena un render extra en cada pulsación (react-hooks lo marca), y
    // esta ruta se dispara mientras el usuario escribe.
    queueMicrotask(() => {
      if (cancelado) return;
      setBuscando(true);
      setErrorBusqueda(null);
    });
    buscarFotosAccion({
      fuente: fuenteActiva,
      texto: textoDebounced || undefined,
      ruta,
      estado: fuenteActiva === "banco" ? estado : undefined,
      desde: 0,
      tamano: TANDA_FOTOS,
    }).then((r) => {
      if (cancelado) return;
      setBuscando(false);
      if ("ok" in r && r.ok) {
        setResultado({ fotos: r.fotos, total: r.total, hayMas: r.hayMas, desde: r.fotos.length });
      } else {
        // No se inventa un resultado vacío: eso se ve idéntico a "no hay coincidencias" y
        // esconde que la búsqueda de verdad falló.
        setResultado(null);
        setErrorBusqueda("error" in r && r.error ? r.error : "No se pudo buscar.");
      }
    });
    return () => {
      cancelado = true;
    };
  }, [fuenteActiva, textoDebounced, ruta, estado, filtrando]);

  // Escape cierra el modal.
  useEffect(() => {
    if (!abierto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto]);

  // El fondo no debe scrollear mientras el modal está abierto: son 177 fotos de scroll propio.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  /**
   * Sube directo del navegador a Supabase Storage. No pasa por Server Action a propósito:
   * el bodySizeLimit es de 15 MB y una carpeta de fotos de cámara lo revienta.
   */
  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    const imagenes = Array.from(archivos).filter((f) => f.type.startsWith("image/"));
    if (imagenes.length === 0) {
      setAviso("No había ninguna imagen en lo que arrastraste.");
      return;
    }

    setAviso(null);
    setSubiendo({ hechas: 0, total: imagenes.length });
    const supabase = createPublicClient();
    const nuevas: FotoSubida[] = [];

    for (let i = 0; i < imagenes.length; i++) {
      const archivo = imagenes[i];
      const rutaConBucket = rutaFotoContenido(archivo.name);
      const ruta = sinBucket(rutaConBucket);

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, archivo, { contentType: archivo.type, upsert: true });

      if (error) {
        setAviso(`No se pudo subir ${archivo.name}: ${error.message}`);
        break;
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
      const r = await registrarSubida({
        storage_path: ruta,
        public_url: data.publicUrl,
        nombre: archivo.name,
        bytes: archivo.size,
      });

      if ("error" in r && r.error) {
        setAviso(r.error);
        break;
      }
      if ("foto" in r && r.foto) nuevas.push(r.foto);
      setSubiendo({ hechas: i + 1, total: imagenes.length });
    }

    if (nuevas.length) {
      setSubidas((prev) => [...nuevas, ...prev]);
      setPestana("subidas");
      // La última que subió es la que uno quiere ver puesta.
      const ultima = nuevas.at(-1);
      if (ultima) iniciar(() => onElegir({ url: ultima.url, origen: "subida" }));
    }
    setSubiendo(null);
  }

  /** Elegir una foto (o "sin foto") cierra el modal: es la acción que termina el flujo. */
  function elegir(foto: FotoSlide | null) {
    onElegir(foto);
    setAbierto(false);
  }

  const esActual = (url: string) => seleccionada?.url === url;

  const listaBase: Array<FotoDelBanco | FotoSubida | FotoBuscada> =
    pestana === "banco" ? [...banco, ...masBanco] : pestana === "subidas" ? [...subidas, ...masSubidas] : [];
  // Con filtro manda la búsqueda; sin filtro, las listas base. Se ignora `resultado` en vez
  // de borrarlo, para no tocar estado dentro de un efecto.
  const resultadoVisible = filtrando ? resultado : null;
  const listaActiva: Array<FotoDelBanco | FotoSubida | FotoBuscada> = resultadoVisible ? resultadoVisible.fotos : listaBase;
  const chipsRuta = fuenteActiva ? (rutas[fuenteActiva] ?? []) : [];
  const hayMasActual = resultadoVisible ? resultadoVisible.hayMas : fuenteActiva ? hayMasBase[fuenteActiva] : false;

  /**
   * Trae la siguiente tanda: de `resultado` si hay un filtro activo (paginando desde donde
   * quedó), o de la lista base sin filtro (banco/subidas) desde lo ya cargado + la semilla.
   */
  async function verMas() {
    if (!fuenteActiva || cargandoMas) return;

    if (resultadoVisible) {
      if (!resultadoVisible.hayMas) return;
      setCargandoMas(true);
      const r = await buscarFotosAccion({
        fuente: fuenteActiva,
        texto: textoDebounced || undefined,
        ruta,
        estado: fuenteActiva === "banco" ? estado : undefined,
        desde: resultadoVisible.desde,
        tamano: TANDA_FOTOS,
      });
      setCargandoMas(false);
      if ("ok" in r && r.ok) {
        setResultado((prev) =>
          prev ? { fotos: [...prev.fotos, ...r.fotos], total: r.total, hayMas: r.hayMas, desde: prev.desde + r.fotos.length } : prev,
        );
      } else {
        // Antes esto no avisaba nada: el botón "Ver más" volvía a su estado normal como
        // si no hubiera pasado nada, y quien lo pedía se quedaba sin saber si ya no había
        // más fotos o si la petición se cayó.
        setErrorBusqueda("error" in r && r.error ? r.error : "No se pudo traer más fotos.");
      }
      return;
    }

    if (!hayMasBase[fuenteActiva]) return;
    setCargandoMas(true);
    const r = await buscarFotosAccion({ fuente: fuenteActiva, desde: listaBase.length, tamano: TANDA_FOTOS });
    setCargandoMas(false);
    if ("ok" in r && r.ok) {
      if (fuenteActiva === "banco") setMasBanco((prev) => [...prev, ...r.fotos]);
      else setMasSubidas((prev) => [...prev, ...r.fotos]);
      setHayMasBase((prev) => ({ ...prev, [fuenteActiva]: r.hayMas }));
    } else {
      setErrorBusqueda("error" in r && r.error ? r.error : "No se pudo traer más fotos.");
    }
  }

  // Scroll infinito: cuando el centinela del final de la rejilla entra en vista, se pide la
  // siguiente tanda sola. El botón "Ver más" sigue ahí como respaldo (y como lo que dispara
  // la carga en pantallas donde no llega a haber scroll).
  useEffect(() => {
    if (!abierto || !hayMasActual) return;
    const nodo = centinela.current;
    if (!nodo) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) void verMas();
      },
      { rootMargin: "200px" },
    );
    observador.observe(nodo);
    return () => observador.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, hayMasActual, pestana, resultadoVisible?.desde, masBanco.length, masSubidas.length]);

  return (
    <div className="flex flex-col gap-2">
      {/* Fuera del modal: solo la miniatura elegida y el botón para cambiarla. */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden border border-border bg-taupe/30 flex items-center justify-center">
          {seleccionada && !miniaturaRota ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={miniatura(seleccionada.url, 160)}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setMiniaturaRota(true)}
            />
          ) : (
            <ImageOff size={18} className="text-muted" />
          )}
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-[11px] text-fg hover:bg-taupe/40 w-fit"
          >
            <Images size={12} /> {seleccionada ? "Cambiar foto" : "Elegir foto"}
          </button>
          <span className="text-[11px] text-muted truncate">
            {seleccionada
              ? miniaturaRota
                ? "Esa foto ya no está disponible — elige otra"
                : seleccionada.origen === "banco"
                  ? "Del banco"
                  : "Foto subida"
              : "Sin foto — fondo verde de marca"}
          </span>
        </div>
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/70 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setAbierto(false)}
        >
          <div
            className="flex flex-col w-full h-full max-w-6xl max-h-[94vh] rounded-xl bg-bg-card border border-border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera: pestañas de fuente + cerrar */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border shrink-0">
              <div className="flex items-center gap-1 overflow-x-auto">
                {(
                  [
                    ["banco", `Banco (${banco.length})`],
                    ["subidas", `Mis fotos (${subidas.length})`],
                    ["subir", "Subir"],
                    ["sin", "Sin foto"],
                  ] as Array<[Pestana, string]>
                ).map(([id, etiqueta]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => cambiarPestana(id)}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition",
                      pestana === id ? "bg-bosque text-white" : "text-muted hover:bg-taupe/40 hover:text-fg",
                    )}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="p-1.5 rounded-md text-muted hover:bg-taupe/40 hover:text-fg shrink-0"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto p-4">
              {pestana === "sin" && (
                <button
                  type="button"
                  onClick={() => elegir(null)}
                  className={cn(
                    "flex items-center justify-center gap-2 h-40 w-full rounded-md border border-dashed text-sm transition",
                    seleccionada === null
                      ? "border-bosque bg-bosque/5 text-fg"
                      : "border-border text-muted hover:bg-taupe/30",
                  )}
                >
                  <ImageOff size={18} /> Sin foto — fondo verde de marca
                </button>
              )}

              {pestana === "subir" && (
                <div className="flex flex-col gap-3 max-w-md">
                  <p className="text-xs text-muted leading-snug">
                    Sube fotos sueltas o una carpeta entera. Van a tus propias fotos, no al
                    banco del bot.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => inputArchivos.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs text-muted hover:bg-taupe/40"
                    >
                      <Upload size={13} /> Subir fotos
                    </button>
                    <button
                      type="button"
                      onClick={() => inputCarpeta.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs text-muted hover:bg-taupe/40"
                    >
                      <FolderOpen size={13} /> Una carpeta
                    </button>
                  </div>
                  {subiendo && (
                    <p className="text-xs text-muted">
                      Subiendo {subiendo.hechas} de {subiendo.total}…
                    </p>
                  )}
                  {aviso && <p className="text-xs text-dorado-oscuro leading-snug">{aviso}</p>}
                </div>
              )}

              {(pestana === "banco" || pestana === "subidas") && (
                <div className="flex flex-col gap-2.5 mb-3">
                  <div className="relative max-w-sm">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder="Buscar por nombre o ruta…"
                      className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border text-xs bg-bg text-fg focus:outline-none focus:border-bosque"
                    />
                  </div>

                  {chipsRuta.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setRuta(null)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[11px] border transition",
                          ruta === null
                            ? "bg-bosque text-white border-bosque"
                            : "border-border text-muted hover:bg-taupe/40",
                        )}
                      >
                        Todas las rutas
                      </button>
                      {chipsRuta.map((r) => (
                        <button
                          key={r.tag}
                          type="button"
                          onClick={() => setRuta(ruta === r.tag ? null : r.tag)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[11px] border transition",
                            ruta === r.tag
                              ? "bg-bosque text-white border-bosque"
                              : "border-border text-muted hover:bg-taupe/40",
                          )}
                        >
                          {r.tag} ({r.n})
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    {fuenteActiva === "banco" && (
                      <div className="flex items-center gap-1">
                        {(
                          [
                            ["todas", "Todas"],
                            ["disponibles", "Disponibles"],
                            ["usadas", "Usadas"],
                          ] as Array<[FiltroEstado, string]>
                        ).map(([id, etiqueta]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setEstado(id)}
                            className={cn(
                              "px-2.5 py-1 rounded-md text-[11px] border transition",
                              estado === id
                                ? "bg-taupe/60 border-taupe text-fg"
                                : "border-transparent text-muted hover:bg-taupe/30",
                            )}
                          >
                            {etiqueta}
                          </button>
                        ))}
                      </div>
                    )}
                    <span className="text-[11px] text-muted ml-auto flex items-center gap-1.5">
                      {buscando ? (
                        <>
                          <Loader2 size={11} className="animate-spin" /> Buscando…
                        </>
                      ) : resultadoVisible ? (
                        `${resultadoVisible.total} resultado${resultadoVisible.total === 1 ? "" : "s"}`
                      ) : null}
                    </span>
                  </div>

                  {errorBusqueda && (
                    <p className="text-[11px] text-dorado-oscuro leading-snug">
                      No se pudo buscar: {errorBusqueda}. Se muestra la lista sin filtrar
                      mientras tanto.
                    </p>
                  )}
                </div>
              )}

              {(pestana === "banco" || pestana === "subidas") && (
                <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {listaActiva.map((f) => (
                    <li key={`${pestana}-${f.id}`}>
                      <button
                        type="button"
                        onClick={() =>
                          elegir({ url: f.url, origen: pestana === "banco" ? "banco" : "subida" })
                        }
                        className={cn(
                          "relative block w-full rounded-lg overflow-hidden border-2 transition",
                          esActual(f.url) ? "border-bosque" : "border-transparent hover:border-taupe",
                        )}
                        style={{ aspectRatio: "1 / 1" }}
                        title={"ruta_tag" in f && typeof f.ruta_tag === "string" ? f.ruta_tag : undefined}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={miniatura(f.url, 240)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        {esActual(f.url) && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-bosque text-white flex items-center justify-center">
                            <Check size={12} />
                          </span>
                        )}
                        {"usada" in f && f.usada === true && (
                          <span className="absolute bottom-0 inset-x-0 bg-tinta/60 text-white text-[10px] py-0.5">
                            ya publicada
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                  {listaActiva.length === 0 && !buscando && (
                    <li className="col-span-full text-xs text-muted py-16 text-center">
                      {resultado
                        ? "Ninguna foto cumple esa búsqueda o esos filtros."
                        : pestana === "banco"
                          ? "El banco está vacío."
                          : "Todavía no has subido ninguna foto. Usa la pestaña «Subir»."}
                    </li>
                  )}
                </ul>
              )}

              {(pestana === "banco" || pestana === "subidas") && hayMasActual && (
                <div ref={centinela} className="flex justify-center py-5">
                  <button
                    type="button"
                    onClick={() => void verMas()}
                    disabled={cargandoMas}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-md border border-border text-xs text-muted hover:bg-taupe/40 disabled:opacity-60"
                  >
                    {cargandoMas ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> Cargando…
                      </>
                    ) : (
                      "Ver más"
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={inputArchivos}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void subir(e.target.files);
          e.target.value = "";
        }}
      />
      {/* webkitdirectory permite arrastrar una carpeta entera del disco. */}
      <input
        ref={inputCarpeta}
        type="file"
        multiple
        hidden
        // @ts-expect-error webkitdirectory no está en los tipos de React pero sí en el DOM
        webkitdirectory=""
        onChange={(e) => {
          void subir(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
