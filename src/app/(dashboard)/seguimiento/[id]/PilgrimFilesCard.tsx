"use client";

import { useRef, useState, useTransition } from "react";
import { Check, FileText, Paperclip, Pencil, Trash2, Upload, X } from "lucide-react";
import { getSignedUrl } from "./actions";
import {
  editarDocumentoPilgrim,
  eliminarDocumentoPilgrim,
  subirDocumentoPilgrim,
} from "./actions";

export type PilgrimFile = {
  id: string;
  name: string;
  kind: string | null;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  notes: string | null;
  created_at: string;
};

// Etiquetas para agrupar lo que llega. Las dos primeras son lo que de verdad manda
// Pilgrim en cada reserva: su documentación de viaje completa y, a veces, su cotización.
// La lista es abierta en la BD: si algún día hace falta otra, se agrega acá y las que ya
// estaban guardadas se siguen mostrando igual.
const TIPOS = [
  { valor: "documentacion", etiqueta: "Documentación de viaje" },
  { valor: "cotizacion", etiqueta: "Cotización de Pilgrim" },
  { valor: "confirmacion", etiqueta: "Confirmación de reserva" },
  { valor: "factura", etiqueta: "Factura" },
  { valor: "cambio", etiqueta: "Cambio / incidencia" },
  { valor: "otro", etiqueta: "Otro" },
];

function etiquetaTipo(v: string | null): string {
  if (!v) return "Sin clasificar";
  return TIPOS.find((t) => t.valor === v)?.etiqueta ?? v;
}

function peso(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fecha(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota",
  }).format(new Date(iso));
}

export default function PilgrimFilesCard({
  quoteId,
  files,
}: {
  quoteId: string;
  files: PilgrimFile[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files || []);
    if (elegidos.length === 0) return;
    e.target.value = "";
    setError(null);
    startTransition(async () => {
      // Uno por uno y no en paralelo: cada Server Action lleva su archivo en el cuerpo, y
      // cinco PDF de 15 MB saliendo a la vez es justo lo que hace que uno falle sin decir
      // cuál. Así, si algo revienta, el mensaje trae el nombre.
      for (const file of elegidos) {
        setSubiendo(file.name);
        const fd = new FormData();
        fd.set("file", file);
        const r = await subirDocumentoPilgrim(quoteId, fd);
        if (r?.error) { setError(r.error); break; }
      }
      setSubiendo(null);
    });
  }

  function abrir(path: string) {
    setError(null);
    startTransition(async () => {
      const r = await getSignedUrl(path);
      if (r.url) window.open(r.url, "_blank");
      else if (r.error) setError(r.error);
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">Documentos de Pilgrim</h2>
          <p className="text-xs text-muted mt-0.5">
            Lo que nos manda Pilgrim de esta reserva: su documentación de viaje completa, la
            cotización que a veces envían, confirmaciones y facturas. Es interno — al cliente
            nunca se le manda desde aquí.
          </p>
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition cursor-pointer">
          <Upload size={13} /> {pending && subiendo ? `Subiendo ${subiendo}…` : "Cargar documentos"}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onPick}
            disabled={pending}
          />
        </label>
      </div>

      {files.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Paperclip size={22} className="mx-auto text-muted mb-2" />
          <p className="text-sm text-muted">
            Todavía no hay nada guardado. Sube aquí la documentación de viaje y la cotización
            que te manda Pilgrim, y deja de buscarlas en el correo.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {files.map((f) =>
            editando === f.id ? (
              <FilaEditable
                key={f.id}
                quoteId={quoteId}
                file={f}
                onDone={() => setEditando(null)}
                onError={setError}
              />
            ) : (
              <li key={f.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <button
                    onClick={() => abrir(f.storage_path)}
                    disabled={pending}
                    className="text-sm text-bosque hover:underline truncate max-w-full text-left disabled:opacity-50"
                  >
                    {f.name}
                  </button>
                  <p className="text-xs text-muted mt-0.5">
                    {[etiquetaTipo(f.kind), peso(f.size_bytes), fecha(f.created_at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {f.notes && <p className="text-xs text-muted mt-1 italic">{f.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => abrir(f.storage_path)}
                    disabled={pending}
                    title="Ver"
                    className="p-1.5 text-muted hover:text-bosque transition disabled:opacity-50"
                  >
                    <FileText size={14} />
                  </button>
                  <button
                    onClick={() => setEditando(f.id)}
                    title="Renombrar o clasificar"
                    className="p-1.5 text-muted hover:text-bosque transition"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm(`¿Borrar «${f.name}»? El archivo se elimina de Storage.`)) return;
                      setError(null);
                      startTransition(async () => {
                        const r = await eliminarDocumentoPilgrim(quoteId, f.id);
                        if (r?.error) setError(r.error);
                      });
                    }}
                    disabled={pending}
                    title="Borrar"
                    className="p-1.5 text-muted hover:text-red-600 transition disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {error && (
        <div role="alert" className="px-5 py-2 text-sm text-red-700 bg-red-50 border-t border-red-200">{error}</div>
      )}
    </section>
  );
}

function FilaEditable({
  quoteId, file, onDone, onError,
}: {
  quoteId: string; file: PilgrimFile; onDone: () => void; onError: (e: string | null) => void;
}) {
  const [name, setName] = useState(file.name);
  const [kind, setKind] = useState(file.kind ?? "");
  const [notes, setNotes] = useState(file.notes ?? "");
  const [pending, startTransition] = useTransition();

  function guardar() {
    onError(null);
    startTransition(async () => {
      const r = await editarDocumentoPilgrim(quoteId, file.id, { name, kind, notes });
      if (r?.error) onError(r.error);
      else onDone();
    });
  }

  return (
    <li className="px-5 py-3 bg-taupe/20">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre visible"
          className="w-full px-3 py-1.5 rounded-md border border-border bg-white text-sm"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full px-3 py-1.5 rounded-md border border-border bg-white text-sm"
        >
          <option value="">Sin clasificar</option>
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
          ))}
        </select>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Nota (opcional): qué es, o por qué importa"
        className="mt-2 w-full px-3 py-1.5 rounded-md border border-border bg-white text-sm"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onDone}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
        >
          <X size={13} /> Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
        >
          <Check size={13} /> {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </li>
  );
}
