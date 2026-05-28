"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Trash2, FileText, Sparkles, Save } from "lucide-react";
import { saveQuoteHotels, prefillHotelsFromItinerary, generateHotelsPdf, getSignedUrl, type HotelInput } from "./actions";

type Row = {
  key: string;
  night_date: string;
  city: string;
  hotel_name: string;
  address: string;
  contact: string;
  notes: string;
};

export type InitialHotel = {
  night_date: string | null;
  city: string | null;
  hotel_name: string | null;
  address: string | null;
  contact: string | null;
  notes: string | null;
};

function toRow(h: InitialHotel, key: string): Row {
  return {
    key,
    night_date: h.night_date ?? "",
    city: h.city ?? "",
    hotel_name: h.hotel_name ?? "",
    address: h.address ?? "",
    contact: h.contact ?? "",
    notes: h.notes ?? "",
  };
}

function toInput(r: Row): HotelInput {
  return {
    night_date: r.night_date || null,
    city: r.city || null,
    hotel_name: r.hotel_name || null,
    address: r.address || null,
    contact: r.contact || null,
    notes: r.notes || null,
  };
}

export default function HotelsCard({
  quoteId,
  initialHotels,
  pdfPath,
  pdfFilename,
}: {
  quoteId: string;
  initialHotels: InitialHotel[];
  pdfPath: string | null;
  pdfFilename: string | null;
}) {
  const keyCounter = useRef(0);
  const nextKey = () => `r${keyCounter.current++}`;
  const [rows, setRows] = useState<Row[]>(() => initialHotels.map((h) => toRow(h, nextKey())));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [hasPdf, setHasPdf] = useState(!!pdfPath);

  function update(key: string, field: keyof Omit<Row, "key">, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setSavedMsg(null);
  }
  function addRow() {
    setRows((prev) => [...prev, toRow({ night_date: null, city: null, hotel_name: null, address: null, contact: null, notes: null }, nextKey())]);
  }
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function onPrefill() {
    if (rows.length > 0 && !confirm("Esto reemplazará las filas actuales con el itinerario de la ruta. ¿Continuar?")) return;
    setError(null);
    startTransition(async () => {
      const r = await prefillHotelsFromItinerary(quoteId);
      if (r.error) setError(r.error);
      else if (r.rows) setRows(r.rows.map((h) => toRow(h, nextKey())));
    });
  }

  function onSave() {
    setError(null);
    setSavedMsg(null);
    startTransition(async () => {
      const r = await saveQuoteHotels(quoteId, rows.map(toInput));
      if (r.error) setError(r.error);
      else setSavedMsg("Guardado");
    });
  }

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const save = await saveQuoteHotels(quoteId, rows.map(toInput));
      if (save.error) { setError(save.error); return; }
      const r = await generateHotelsPdf(quoteId);
      if (r.error) setError(r.error);
      else { setHasPdf(true); setSavedMsg("PDF generado"); }
    });
  }

  function onOpen() {
    if (!pdfPath) return;
    setError(null);
    startTransition(async () => {
      const r = await getSignedUrl(pdfPath);
      if (r.url) window.open(r.url, "_blank");
      else if (r.error) setError(r.error);
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">Listado de hoteles (Pilgrim)</h2>
          <p className="text-xs text-muted mt-0.5">
            Disponible porque la cotización está pagada. El PDF incluye una nota de posibles modificaciones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onPrefill} disabled={pending} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50">
            <Sparkles size={13} /> Prellenar desde itinerario
          </button>
          {(pdfPath || hasPdf) && (
            <button onClick={onOpen} disabled={pending || !pdfPath} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50">
              <FileText size={13} /> Ver / Descargar
            </button>
          )}
          <button onClick={onGenerate} disabled={pending} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50">
            <FileText size={13} /> {pending ? "Procesando…" : (pdfPath || hasPdf) ? "Regenerar PDF" : "Generar PDF"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-taupe/30 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 w-[130px]">Noche</th>
              <th className="text-left px-3 py-2">Ciudad</th>
              <th className="text-left px-3 py-2">Hotel</th>
              <th className="text-left px-3 py-2">Dirección</th>
              <th className="text-left px-3 py-2">Contacto</th>
              <th className="text-left px-3 py-2">Notas</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="px-2 py-1.5"><input type="date" value={r.night_date} onChange={(e) => update(r.key, "night_date", e.target.value)} className="w-full px-2 py-1 rounded border border-border bg-white text-xs" /></td>
                <td className="px-2 py-1.5"><Cell value={r.city} onChange={(v) => update(r.key, "city", v)} placeholder="Ciudad" /></td>
                <td className="px-2 py-1.5"><Cell value={r.hotel_name} onChange={(v) => update(r.key, "hotel_name", v)} placeholder="Nombre del hotel" /></td>
                <td className="px-2 py-1.5"><Cell value={r.address} onChange={(v) => update(r.key, "address", v)} placeholder="Dirección" /></td>
                <td className="px-2 py-1.5"><Cell value={r.contact} onChange={(v) => update(r.key, "contact", v)} placeholder="Tel. / email" /></td>
                <td className="px-2 py-1.5"><Cell value={r.notes} onChange={(v) => update(r.key, "notes", v)} placeholder="Notas" /></td>
                <td className="px-1 py-1.5 text-right">
                  <button onClick={() => removeRow(r.key)} title="Quitar fila" className="text-muted hover:text-red-600 transition"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">Sin hoteles. Agregá filas o prellená desde el itinerario.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-border flex items-center justify-between flex-wrap gap-2">
        <button onClick={addRow} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
          <Plus size={13} /> Agregar fila
        </button>
        <div className="flex items-center gap-3">
          {savedMsg && <span className="text-xs text-bosque">{savedMsg}</span>}
          {pdfFilename && <span className="text-[11px] font-mono text-muted truncate max-w-[240px]">{pdfFilename}</span>}
          <button onClick={onSave} disabled={pending} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50">
            <Save size={13} /> {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {error && <div className="px-5 py-2 text-sm text-red-700 bg-red-50 border-t border-red-200">{error}</div>}
    </section>
  );
}

function Cell({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2 py-1 rounded border border-border bg-white text-xs"
    />
  );
}
