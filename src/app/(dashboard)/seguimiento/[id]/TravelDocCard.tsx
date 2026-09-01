"use client";

import { useRef, useState, useTransition } from "react";
import {
  Check, Copy, FileText, Link2, Plus, RotateCcw, Save, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import { getSignedUrl } from "./actions";
import {
  enviarCorreoDocumentacion,
  generateTravelDoc,
  prefillTravelNights,
  removeTravelFile,
  revokeTravelDocLink,
  rotateTravelDocToken,
  saveTravelNights,
  saveTravelServices,
  suggestTravelServices,
  uploadTravelFile,
} from "./travelDocActions";

export type HotelOpcion = { id: string; name: string; city: string | null };

export type NocheInicial = {
  day: number | null;
  night_date: string | null;
  stage_label: string | null;
  km: number | null;
  city: string | null;
  hotel_id: string | null;
  room_label: string | null;
  regimen: string | null;
  notes: string | null;
};

export type TravelDocEstado = {
  token: string | null;
  docPath: string | null;
  docGeneratedAt: string | null;
  insurancePath: string | null;
  luggageTagPath: string | null;
  sentAt: string | null;
  revokedAt: string | null;
  services: string[];
};

type Fila = NocheInicial & { key: string };

const SERVICIOS = [
  { clave: "asistencia_telefonica", etiqueta: "Asistencia telefónica" },
  { clave: "credencial", etiqueta: "Credencial del peregrino" },
  { clave: "seguro", etiqueta: "Seguro de viaje" },
  { clave: "mochilas", etiqueta: "Transporte de mochilas" },
];

/** La `key` es de React; a la base de datos no va. */
function sinKey(fila: Fila): NocheInicial {
  const { key, ...noche } = fila;
  void key;
  return noche;
}

function fecha(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota",
  }).format(new Date(iso));
}

export default function TravelDocCard({
  quoteId,
  quoteCode,
  clientName,
  clientEmail,
  routeName,
  hotels,
  initialNights,
  estado,
  baseUrl,
  asistenciaLista,
}: {
  quoteId: string;
  quoteCode: string;
  clientName: string | null;
  clientEmail: string;
  routeName: string | null;
  hotels: HotelOpcion[];
  initialNights: NocheInicial[];
  estado: TravelDocEstado;
  baseUrl: string;
  asistenciaLista: boolean;
}) {
  // Las filas necesitan una key estable que sobreviva a reordenar y borrar, y el índice
  // no sirve: borrar la noche 2 haría que React reutilizara el input de la 3 con el valor
  // de la 2. El contador arranca donde terminan las noches ya guardadas.
  const contador = useRef(initialNights.length);
  const nuevaKey = () => `n${contador.current++}`;
  const [filas, setFilas] = useState<Fila[]>(() => initialNights.map((n, i) => ({ ...n, key: `n${i}` })));
  const [servicios, setServicios] = useState<string[]>(
    estado.services.length > 0 ? estado.services : SERVICIOS.map((s) => s.clave),
  );
  const [token, setToken] = useState(estado.token);
  const [revocado, setRevocado] = useState(!!estado.revokedAt);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const url = token ? `${baseUrl}/documentacion/${token}` : null;

  function correr(fn: () => Promise<{ error?: string } | undefined>, ok?: string) {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else if (ok) setAviso(ok);
    });
  }

  function actualizar(key: string, campo: keyof NocheInicial, valor: string | number | null) {
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, [campo]: valor } : f)));
    setAviso(null);
  }

  function agregarFila() {
    setFilas((prev) => [
      ...prev,
      {
        key: nuevaKey(), day: prev.length + 1, night_date: null, stage_label: null,
        km: null, city: null, hotel_id: null, room_label: null, regimen: "AD", notes: null,
      },
    ]);
  }

  function prellenar() {
    if (filas.length > 0 && !confirm("Esto reemplaza las noches actuales por el itinerario de la ruta. ¿Seguir?")) return;
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const r = await prefillTravelNights(quoteId);
      if (r.error) { setError(r.error); return; }
      setFilas(
        (r.rows || []).map((n) => ({
          key: nuevaKey(),
          day: n.day, night_date: n.night_date, stage_label: n.stage_label, km: n.km,
          city: n.city, hotel_id: n.hotel_id, room_label: n.room_label,
          regimen: n.regimen, notes: n.notes || null,
        })),
      );
      const sinHotel = (r.rows || []).filter((n) => !n.hotel_id).length;
      setAviso(
        sinHotel === 0
          ? "Itinerario cargado, con hotel propuesto en todas las noches."
          : `Itinerario cargado. Faltan ${sinHotel} ${sinHotel === 1 ? "noche" : "noches"} por asignar hotel.`,
      );
    });
  }

  function guardar() {
    correr(async () => {
      const a = await saveTravelNights(quoteId, filas.map(sinKey));
      if (a?.error) return a;
      return saveTravelServices(quoteId, servicios);
    }, "Guardado");
  }

  function generar() {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const a = await saveTravelNights(quoteId, filas.map(sinKey));
      if (a?.error) { setError(a.error); return; }
      const r = await generateTravelDoc(quoteId, servicios);
      if (r?.error) { setError(r.error); return; }
      setAviso("Documento de Viaje generado.");
    });
  }

  function sugerirServicios() {
    setError(null);
    startTransition(async () => {
      const r = await suggestTravelServices(quoteId);
      setServicios(r.services);
      setAviso("Servicios propuestos a partir de los opcionales contratados.");
    });
  }

  function abrir(path: string | null) {
    if (!path) return;
    setError(null);
    startTransition(async () => {
      const r = await getSignedUrl(path);
      if (r.url) window.open(r.url, "_blank");
      else if (r.error) setError(r.error);
    });
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      setError("No pude copiar al portapapeles.");
    }
  }

  const nochesSinHotel = filas.filter((f) => !f.hotel_id).length;

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">Documentación de viaje</h2>
          <p className="text-xs text-muted mt-0.5">
            Disponible porque la cotización está pagada. El documento se arma con los hoteles del
            catálogo: el nombre, la dirección, los contactos y las fotos salen de ahí.
            {estado.sentAt ? ` Enviada el ${fecha(estado.sentAt)}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={prellenar} disabled={pending} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50">
            <Sparkles size={13} /> Prellenar desde itinerario
          </button>
          <button onClick={guardar} disabled={pending} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50">
            <Save size={13} /> Guardar
          </button>
          <button onClick={generar} disabled={pending} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50">
            <FileText size={13} /> {pending ? "Procesando…" : estado.docPath ? "Regenerar documento" : "Generar documento"}
          </button>
        </div>
      </div>

      {/* ---------- NOCHES ---------- */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-2 py-2 w-[52px]">Día</th>
              <th className="text-left px-2 py-2 w-[130px]">Fecha</th>
              <th className="text-left px-2 py-2">Etapa</th>
              <th className="text-left px-2 py-2 w-[64px]">Km</th>
              <th className="text-left px-2 py-2 w-[200px]">Hotel</th>
              <th className="text-left px-2 py-2 w-[150px]">Habitación</th>
              <th className="text-left px-2 py-2 w-[70px]">Régimen</th>
              <th className="text-left px-2 py-2">Nota de la noche</th>
              <th className="px-1 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((f) => (
              <tr key={f.key} className="align-top">
                <td className="px-2 py-1.5">
                  <input type="number" min={1} value={f.day ?? ""} onChange={(e) => actualizar(f.key, "day", e.target.value ? Number(e.target.value) : null)} className="w-full px-2 py-1 rounded border border-border bg-white text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <input type="date" value={f.night_date ?? ""} onChange={(e) => actualizar(f.key, "night_date", e.target.value || null)} className="w-full px-2 py-1 rounded border border-border bg-white text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <input value={f.stage_label ?? ""} onChange={(e) => actualizar(f.key, "stage_label", e.target.value || null)} placeholder="Sarria - Portomarín" className="w-full px-2 py-1 rounded border border-border bg-white text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.1" value={f.km ?? ""} onChange={(e) => actualizar(f.key, "km", e.target.value ? Number(e.target.value) : null)} className="w-full px-2 py-1 rounded border border-border bg-white text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={f.hotel_id ?? ""}
                    onChange={(e) => actualizar(f.key, "hotel_id", e.target.value || null)}
                    className={`w-full px-2 py-1 rounded border bg-white text-xs ${f.hotel_id ? "border-border" : "border-amber-400 bg-amber-50"}`}
                  >
                    <option value="">— sin hotel —</option>
                    {hotels.map((h) => (
                      <option key={h.id} value={h.id}>{h.city ? `${h.name} · ${h.city}` : h.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input value={f.room_label ?? ""} onChange={(e) => actualizar(f.key, "room_label", e.target.value || null)} placeholder="1 Habitación individual" className="w-full px-2 py-1 rounded border border-border bg-white text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <input value={f.regimen ?? ""} onChange={(e) => actualizar(f.key, "regimen", e.target.value || null)} placeholder="AD" className="w-full px-2 py-1 rounded border border-border bg-white text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <input value={f.notes ?? ""} onChange={(e) => actualizar(f.key, "notes", e.target.value || null)} placeholder="Solo lo puntual de este viaje" className="w-full px-2 py-1 rounded border border-border bg-white text-xs" />
                </td>
                <td className="px-1 py-1.5 text-right">
                  <button onClick={() => setFilas((p) => p.filter((x) => x.key !== f.key))} title="Quitar noche" className="text-muted hover:text-red-600 transition">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted">
                Sin noches. Prellená desde el itinerario de la ruta y luego asigná el hotel de cada una.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-2.5 border-t border-border flex items-center justify-between flex-wrap gap-2">
        <button onClick={agregarFila} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
          <Plus size={13} /> Agregar noche
        </button>
        {nochesSinHotel > 0 && (
          <span className="text-xs text-amber-700">
            {nochesSinHotel} {nochesSinHotel === 1 ? "noche sin hotel asignado" : "noches sin hotel asignado"}: saldrán en el documento sin dirección ni fotos.
          </span>
        )}
      </div>

      {/* ---------- SERVICIOS ---------- */}
      <div className="px-5 py-4 border-t border-border">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div>
            <h3 className="text-sm font-medium text-bosque">Servicios incluidos en el documento</h3>
            <p className="text-xs text-muted mt-0.5">
              Qué bloques salen en el apartado «Servicios incluidos». Los textos se editan en Configuración.
            </p>
          </div>
          <button onClick={sugerirServicios} disabled={pending} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50">
            <Sparkles size={13} /> Proponer según opcionales
          </button>
        </div>
        <div className="flex flex-wrap gap-4">
          {SERVICIOS.map((s) => (
            <label key={s.clave} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={servicios.includes(s.clave)}
                onChange={(e) =>
                  setServicios((prev) =>
                    e.target.checked ? [...prev, s.clave] : prev.filter((x) => x !== s.clave),
                  )
                }
                className="rounded border-border"
              />
              {s.etiqueta}
            </label>
          ))}
        </div>
      </div>

      {/* ---------- ARCHIVOS ---------- */}
      <div className="px-5 py-4 border-t border-border space-y-2">
        <h3 className="text-sm font-medium text-bosque mb-1">Documentos del envío</h3>

        <ArchivoFila
          titulo="Documento de viaje"
          detalle={estado.docGeneratedAt ? `Generado el ${fecha(estado.docGeneratedAt)}.` : "Todavía no se ha generado."}
          path={estado.docPath}
          onOpen={() => abrir(estado.docPath)}
          pending={pending}
        />

        <ArchivoFila
          titulo="Asistencia en viaje"
          detalle={
            asistenciaLista
              ? "Genérica para todos los viajes. Se genera desde Configuración."
              : "Falta generarla. Ve a Configuración → Asistencia en viaje."
          }
          path={asistenciaLista ? "comercial-docs/generico/Asistencia-en-Viaje-Camino-Sacro.pdf" : null}
          onOpen={() => abrir("comercial-docs/generico/Asistencia-en-Viaje-Camino-Sacro.pdf")}
          pending={pending}
        />

        <ArchivoSubible
          titulo="Seguro de viaje"
          detalle="Lo emite la aseguradora; súbelo tal como llega."
          path={estado.insurancePath}
          quoteId={quoteId}
          tipo="seguro"
          onOpen={() => abrir(estado.insurancePath)}
          onError={setError}
        />

        <ArchivoSubible
          titulo="Etiqueta de transporte de equipaje"
          detalle="La emite el transportista; el viajero la imprime y la pega en la mochila."
          path={estado.luggageTagPath}
          quoteId={quoteId}
          tipo="etiqueta"
          onOpen={() => abrir(estado.luggageTagPath)}
          onError={setError}
        />
      </div>

      {/* ---------- ENLACE PERMANENTE ---------- */}
      <div className="px-5 py-4 border-t border-border">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-bosque">Enlace del cliente</h3>
            <p className="text-xs text-muted mt-0.5">
              No caduca: los botones del correo apuntan aquí y la descarga se firma en cada clic.
            </p>
            {url && (
              <p className={`font-mono text-[11px] mt-2 break-all ${revocado ? "text-muted line-through" : "text-bosque"}`}>{url}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {url && !revocado && (
              <button onClick={copiar} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
                {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? "Copiado" : "Copiar"}
              </button>
            )}
            {url && !revocado ? (
              <button
                onClick={() => {
                  if (!confirm("El enlace que ya tiene el cliente dejará de funcionar. ¿Anularlo?")) return;
                  correr(async () => { const r = await revokeTravelDocLink(quoteId); if (!r?.error) setRevocado(true); return r; }, "Enlace anulado.");
                }}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-red-50 hover:text-red-700 transition disabled:opacity-50"
              >
                <X size={13} /> Anular
              </button>
            ) : (
              <button
                onClick={() =>
                  correr(async () => {
                    const r = await rotateTravelDocToken(quoteId);
                    if (r.token) { setToken(r.token); setRevocado(false); }
                    return r;
                  }, "Enlace nuevo generado.")
                }
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
              >
                <RotateCcw size={13} /> {url ? "Generar enlace nuevo" : "Activar enlace"}
              </button>
            )}
            {url && !revocado && (
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
                <Link2 size={13} /> Abrir
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ---------- CORREO ---------- */}
      <CorreoDocumentacion
        quoteId={quoteId}
        quoteCode={quoteCode}
        clientName={clientName}
        clientEmail={clientEmail}
        routeName={routeName}
        listo={!!estado.docPath && !revocado}
        onError={setError}
      />

      {(aviso || error) && (
        <div className={`px-5 py-2 text-sm border-t ${error ? "text-red-700 bg-red-50 border-red-200" : "text-bosque bg-crema border-border"}`}>
          {error || aviso}
        </div>
      )}
    </section>
  );
}

function ArchivoFila({
  titulo, detalle, path, onOpen, pending,
}: {
  titulo: string; detalle: string; path: string | null; onOpen: () => void; pending: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-bosque">{titulo}</p>
        <p className="text-xs text-muted mt-0.5">{detalle}</p>
      </div>
      <button
        onClick={onOpen}
        disabled={!path || pending}
        className="shrink-0 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-40"
      >
        Ver
      </button>
    </div>
  );
}

function ArchivoSubible({
  titulo, detalle, path, quoteId, tipo, onOpen, onError,
}: {
  titulo: string; detalle: string; path: string | null; quoteId: string;
  tipo: "seguro" | "etiqueta"; onOpen: () => void; onError: (e: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("tipo", tipo);
    e.target.value = "";
    onError(null);
    startTransition(async () => {
      const r = await uploadTravelFile(quoteId, fd);
      if (r?.error) onError(r.error);
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-bosque">{titulo}</p>
        <p className="text-xs text-muted mt-0.5">{path ? "Cargado." : detalle}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {path && (
          <>
            <button onClick={onOpen} disabled={pending} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50">
              Ver
            </button>
            <button
              onClick={() => {
                if (!confirm(`¿Quitar «${titulo}» de esta documentación?`)) return;
                onError(null);
                startTransition(async () => {
                  const r = await removeTravelFile(quoteId, tipo);
                  if (r?.error) onError(r.error);
                });
              }}
              disabled={pending}
              title="Quitar"
              className="p-1.5 text-muted hover:text-red-600 transition disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition cursor-pointer">
          <Upload size={13} /> {pending ? "Subiendo…" : path ? "Reemplazar" : "Cargar PDF"}
          <input type="file" accept="application/pdf" className="hidden" onChange={subir} disabled={pending} />
        </label>
      </div>
    </div>
  );
}

function CorreoDocumentacion({
  quoteId, quoteCode, clientName, clientEmail, routeName, listo, onError,
}: {
  quoteId: string; quoteCode: string; clientName: string | null; clientEmail: string;
  routeName: string | null; listo: boolean; onError: (e: string | null) => void;
}) {
  const [subject, setSubject] = useState(
    `Tu documentación de viaje · ${routeName || "Camino de Santiago"} · ${quoteCode}`,
  );
  const [intro, setIntro] = useState(
    `Tras haber realizado la reserva de tu experiencia en el Camino de Santiago con Camino Sacro, y tras efectuar todas las gestiones necesarias para llevarla a cabo, todo está listo para emprender la aventura.`,
  );
  const [prueba, setPrueba] = useState("");
  const [modoPrueba, setModoPrueba] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, startEnvio] = useTransition();

  function enviar() {
    setResultado(null);
    onError(null);
    startEnvio(async () => {
      const r = await enviarCorreoDocumentacion(quoteId, {
        subject,
        intro,
        pruebaEmail: modoPrueba ? prueba : undefined,
      });
      setResultado(
        r.ok
          ? { ok: true, texto: `✓ Enviado a ${r.email}${modoPrueba ? " (prueba)" : ""}` }
          : { ok: false, texto: r.error ?? "No se pudo enviar el correo." },
      );
    });
  }

  const destino = modoPrueba ? prueba : clientEmail;

  return (
    <div className="px-5 py-4 border-t border-border space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium text-bosque">Correo al cliente</h3>
          <p className="text-xs text-muted mt-0.5">
            Sale desde reservas@caminosacro.com con los botones de descarga y el documento adjunto.
          </p>
        </div>
        <button
          onClick={enviar}
          disabled={enviando || !listo || !destino}
          title={
            !listo ? "Genera el Documento de Viaje y activa el enlace antes de enviar"
              : !destino ? "Falta la dirección de destino" : undefined
          }
          className="text-xs px-4 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {enviando ? "Enviando…" : "Enviar documentación"}
        </button>
      </div>

      <div>
        <label className="text-xs text-muted mb-0.5 block" htmlFor="doc-asunto">Asunto</label>
        <input
          id="doc-asunto"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full font-medium bg-crema border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-bosque"
        />
      </div>

      <div>
        <label className="text-xs text-muted mb-0.5 block" htmlFor="doc-intro">
          Saludo y presentación
        </label>
        <textarea
          id="doc-intro"
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={4}
          className="w-full bg-crema border border-border rounded-md p-3 text-sm leading-relaxed focus:outline-none focus:border-bosque resize-y"
        />
        <p className="text-xs text-muted mt-1">
          Va justo después de «Buenas tardes, {clientName || "…"}». El resto del correo —los botones de
          descarga, las recomendaciones, el contacto y el aviso legal— se arma solo y es siempre igual.
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={modoPrueba} onChange={(e) => setModoPrueba(e.target.checked)} className="rounded border-border" />
        Enviar a otra dirección para probar (no marca la documentación como enviada)
      </label>
      {modoPrueba && (
        <input
          value={prueba}
          onChange={(e) => setPrueba(e.target.value)}
          placeholder="correo@deprueba.com"
          className="w-full max-w-sm bg-crema border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-bosque"
        />
      )}

      <p className="text-xs text-muted">
        Destinatario: <span className="font-mono">{destino || "sin correo"}</span>
      </p>
      {resultado && <p className={`text-sm ${resultado.ok ? "text-bosque" : "text-red-600"}`}>{resultado.texto}</p>}
    </div>
  );
}
