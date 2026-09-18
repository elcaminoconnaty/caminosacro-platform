"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Send, X } from "lucide-react";
import type { FormatoId } from "@/lib/contenido/formatos";
import type { Slide } from "@/lib/contenido/tipos";
import type { EstadoPiezaId } from "@/lib/contenido/estados";
import { CADENCIA, fechaLocal, textoCorto, type CadenciaId } from "@/lib/contenido/fechas";
import { exportarPieza } from "./exportarPieza";
import { desprogramarPieza, programarPieza, propuestaProgramacion, publicarAhora } from "./programarActions";

export type ProgramarProps = {
  piezaId: string;
  titulo: string;
  formato: FormatoId;
  slides: Slide[];
  estado: EstadoPiezaId;
  programadaPara: string | null;
  publicacionError: string | null;
  permalink: string | null;
  hayPendiente: boolean;
};

type Propuesta = { fecha: string; hora: string; cadencia: CadenciaId; ocupados: string[] };

/**
 * "Aprobar y programar" y "Publicar ahora".
 *
 * Las dos exportan primero, SIN descargar: lo que se publica tiene que ser lo que hay en
 * pantalla, y la única forma de garantizarlo es volver a archivar los JPG justo antes
 * (con su huella, que el motor comprueba al publicar). Seis descargas al programar un
 * post serían un estorbo; por eso este botón no baja nada.
 */
export default function Programar(p: ProgramarProps) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [fase, setFase] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const esReel = p.formato === "reel";
  const bloqueado = pendiente || fase !== null || p.hayPendiente || esReel || p.estado === "publicando";

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    void (async () => {
      const r = await propuestaProgramacion();
      if (!vivo) return;
      if (!("ok" in r) || !r.ok) { setAviso(r.error ?? "No se pudo calcular la propuesta."); return; }
      setPropuesta({ fecha: r.fecha, hora: r.hora, cadencia: r.cadencia, ocupados: r.ocupados });
      setFecha(r.fecha);
      setHora(r.hora);
    })();
    return () => { vivo = false; };
  }, [abierto]);

  async function exportarSinDescargar(): Promise<boolean> {
    setFase("Exportando…");
    try {
      const r = await exportarPieza({
        piezaId: p.piezaId, titulo: p.titulo, formato: p.formato, slides: p.slides, descargar: false,
        onProgreso: (h, t) => setFase(`Exportando ${h}/${t}…`),
      });
      if (r.rutas.length !== p.slides.length) {
        setAviso(r.avisos[0] ?? "No se pudieron archivar todos los slides.");
        return false;
      }
      return true;
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo exportar.");
      return false;
    } finally {
      setFase(null);
    }
  }

  function confirmar() {
    setAviso(null);
    iniciar(async () => {
      if (!(await exportarSinDescargar())) return;
      setFase("Programando…");
      const r = await programarPieza(p.piezaId, fecha, hora);
      setFase(null);
      if ("error" in r && r.error) { setAviso(r.error); return; }
      setAbierto(false);
      router.refresh();
    });
  }

  function ahora() {
    setAviso(null);
    if (!window.confirm(`¿Publicar «${p.titulo}» en Instagram ahora mismo?`)) return;
    iniciar(async () => {
      if (!(await exportarSinDescargar())) return;
      setFase("Publicando en Instagram… (puede tardar un minuto)");
      const r = await publicarAhora(p.piezaId);
      setFase(null);
      if ("error" in r && r.error) { setAviso(r.error); router.refresh(); return; }
      if ("aviso" in r && r.aviso) setAviso(r.aviso);
      router.refresh();
    });
  }

  function quitar() {
    setAviso(null);
    iniciar(async () => {
      const r = await desprogramarPieza(p.piezaId);
      if ("error" in r && r.error) { setAviso(r.error); return; }
      router.refresh();
    });
  }

  const diaElegidoOcupado = propuesta?.ocupados.includes(fecha) ?? false;
  const hoy = fechaLocal();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {p.estado === "programado" && p.programadaPara ? (
          <>
            <span className="text-[11px] px-2 py-1 rounded-md bg-bosque-medio text-white" title="Sale sola a esta hora (Bogotá)">
              {textoCorto(p.programadaPara)}
            </span>
            <button type="button" onClick={() => setAbierto(true)} disabled={bloqueado}
              className="px-2.5 py-1.5 rounded-md border border-border text-[11px] text-muted hover:bg-taupe/40 transition disabled:opacity-50">
              Cambiar
            </button>
            <button type="button" onClick={quitar} disabled={pendiente}
              className="px-2.5 py-1.5 rounded-md border border-border text-[11px] text-muted hover:bg-taupe/40 transition disabled:opacity-50">
              Quitar de la cola
            </button>
          </>
        ) : p.estado === "publicado" && p.permalink ? (
          <a href={p.permalink} target="_blank" rel="noreferrer" className="text-[11px] px-2 py-1 rounded-md bg-bosque text-white hover:bg-bosque-medio transition">
            Ver en Instagram
          </a>
        ) : p.estado === "publicando" ? (
          <span className="text-[11px] px-2 py-1 rounded-md bg-dorado-oscuro text-bosque">Publicando…</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAbierto(true)}
              disabled={bloqueado}
              title={
                esReel ? "La portada de reel no se publica por API: se sube a mano con el video."
                : p.hayPendiente ? "Espera a que termine de guardar" : "Exporta y deja la pieza en el calendario"
              }
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-bosque text-white text-xs hover:bg-bosque-medio transition disabled:opacity-50"
            >
              <CalendarClock size={13} />
              {fase ?? "Aprobar y programar"}
            </button>
            {!fase && (
              <button type="button" onClick={ahora} disabled={bloqueado} title="Exporta y publica en Instagram en este momento"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-[11px] text-muted hover:bg-taupe/40 transition disabled:opacity-50">
                <Send size={12} /> Ahora
              </button>
            )}
          </>
        )}
      </div>
      {fase && p.estado === "programado" && <span className="text-[11px] text-muted">{fase}</span>}
      {p.publicacionError && !aviso && (
        <span className="text-[11px] text-red-700 max-w-xs text-right leading-snug">{p.publicacionError}</span>
      )}
      {aviso && !abierto && <span className="text-[11px] text-dorado-oscuro max-w-xs text-right leading-snug">{aviso}</span>}

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={() => !pendiente && setAbierto(false)}>
          <div className="bg-bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg text-bosque">¿Cuándo sale?</h3>
                <p className="text-xs text-muted mt-0.5">
                  Hora de Colombia. Propuesto: el siguiente día libre
                  {propuesta ? ` (${CADENCIA[propuesta.cadencia].etiqueta.toLowerCase()})` : ""}.
                </p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} disabled={pendiente} className="p-1 rounded hover:bg-taupe/40" aria-label="Cerrar">
                <X size={14} />
              </button>
            </div>

            {!propuesta && !aviso && <p className="text-xs text-muted">Buscando el siguiente día libre…</p>}

            {propuesta && (
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Día
                  <input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)}
                    className="px-2.5 py-1.5 rounded-md border border-border bg-bg-card text-sm text-fg focus:outline-none focus:border-bosque" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Hora
                  <input type="time" value={hora} onChange={(e) => setHora(e.target.value)}
                    className="px-2.5 py-1.5 rounded-md border border-border bg-bg-card text-sm text-fg focus:outline-none focus:border-bosque" />
                </label>
              </div>
            )}

            {diaElegidoOcupado && (
              <p className="text-[11px] text-dorado-oscuro leading-snug">
                Ese día ya tiene una publicación. Se puede, pero saldrán dos.
              </p>
            )}

            {/* El error va AQUÍ, dentro del diálogo. La primera versión lo pintaba debajo
                del botón de la cabecera, tapado por el velo del modal: programar fallaba y
                no se veía por qué. */}
            {aviso && <p className="text-xs text-red-700 leading-snug">{aviso}</p>}
            {fase && <p className="text-xs text-muted">{fase}</p>}

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} disabled={pendiente}
                className="px-3 py-1.5 rounded-md border border-border text-xs text-muted hover:bg-taupe/40 transition">
                Cancelar
              </button>
              <button type="button" onClick={confirmar} disabled={pendiente || !propuesta || !fecha || !hora}
                className="px-3.5 py-1.5 rounded-md bg-bosque text-white text-xs hover:bg-bosque-medio transition disabled:opacity-50">
                {fase ?? "Programar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
