"use client";

// Textos del Documento de Viaje: contacto, bloques de "Servicios incluidos" y
// condiciones de reserva. Es lo que lee src/lib/travelDocPdf.tsx.
//
// Las listas se editan como texto con UN ELEMENTO POR LÍNEA. Es la forma más simple que
// no miente sobre la estructura: cada línea es un párrafo o una viñeta, y las vacías se
// descartan. Un editor por campos habría sido más bonito y mucho más fácil de romper.

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { saveTravelDocTexts } from "./actions";

type Bloque = {
  clave?: string;
  titulo: string;
  resumen?: string | null;
  parrafos?: string[];
  vinetas?: string[];
  cierre?: string[];
};

export type TravelDocTextsValue = {
  contacto: {
    telefono?: string; telefono_nota?: string;
    whatsapp?: string;
    email?: string; email_nota?: string;
    emergencias?: string; emergencias_nota?: string;
    web?: string;
  };
  servicios: Bloque[];
  importante?: string;
  condiciones: Bloque[];
};

const lineas = (xs?: string[]) => (xs || []).join("\n");
const partir = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);

export default function TravelDocTextsForm({ current }: { current: TravelDocTextsValue }) {
  const [v, setV] = useState<TravelDocTextsValue>(current);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function contacto(campo: keyof TravelDocTextsValue["contacto"], valor: string) {
    setV((p) => ({ ...p, contacto: { ...p.contacto, [campo]: valor } }));
    setMsg(null);
  }

  function bloque(lista: "servicios" | "condiciones", i: number, campo: keyof Bloque, valor: unknown) {
    setV((p) => ({
      ...p,
      [lista]: p[lista].map((b, k) => (k === i ? { ...b, [campo]: valor } : b)),
    }));
    setMsg(null);
  }

  function agregar(lista: "servicios" | "condiciones") {
    setV((p) => ({ ...p, [lista]: [...p[lista], { titulo: "Nuevo bloque", parrafos: [], vinetas: [], cierre: [] }] }));
  }

  function quitar(lista: "servicios" | "condiciones", i: number) {
    setV((p) => ({ ...p, [lista]: p[lista].filter((_, k) => k !== i) }));
  }

  function guardar() {
    setMsg(null);
    startTransition(async () => {
      const r = await saveTravelDocTexts(v);
      setMsg(r.ok ? { ok: true, texto: "✓ Guardado" } : { ok: false, texto: r.error ?? "No se pudo guardar." });
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">Documento de Viaje — textos</h2>
          <p className="text-xs text-muted mt-0.5">
            Lo que sale en «Servicios incluidos», «Condiciones de reserva» y «Contacto» de la
            documentación de cada viajero.
          </p>
        </div>
        <button
          onClick={guardar}
          disabled={pending}
          className="text-xs px-4 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-medium text-bosque mb-3">Contacto</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Campo label="Teléfono en España (sale en el documento)" value={v.contacto.telefono} onChange={(x) => contacto("telefono", x)} hint="El que marca el peregrino durante el Camino. Va en la última página y en la caja de emergencias." />
          <Campo label="Nota del teléfono" value={v.contacto.telefono_nota} onChange={(x) => contacto("telefono_nota", x)} />
          <Campo label="WhatsApp Camino Sacro (sale en el correo)" value={v.contacto.whatsapp} onChange={(x) => contacto("whatsapp", x)} className="md:col-span-2" hint="El del correo, que el cliente lee antes de viajar y desde Colombia. No sale en el documento." />
          <Campo label="Correo" value={v.contacto.email} onChange={(x) => contacto("email", x)} />
          <Campo label="Nota del correo" value={v.contacto.email_nota} onChange={(x) => contacto("email_nota", x)} />
          <Campo label="Emergencias" value={v.contacto.emergencias} onChange={(x) => contacto("emergencias", x)} />
          <Campo label="Nota de emergencias" value={v.contacto.emergencias_nota} onChange={(x) => contacto("emergencias_nota", x)} />
          <Campo label="Web" value={v.contacto.web} onChange={(x) => contacto("web", x)} className="md:col-span-2" />
        </div>
      </div>

      <div className="px-5 py-4 border-b border-border">
        <label className="block text-sm font-medium text-bosque mb-1">Aviso «Importante»</label>
        <textarea
          value={v.importante ?? ""}
          onChange={(e) => { setV((p) => ({ ...p, importante: e.target.value })); setMsg(null); }}
          rows={3}
          className="w-full px-3 py-2 rounded-md border border-border bg-white text-sm leading-relaxed"
        />
        <p className="text-xs text-muted mt-1">Sale destacado en el índice y al final de los servicios incluidos.</p>
      </div>

      <ListaBloques
        titulo="Servicios incluidos"
        ayuda="Cada bloque es un servicio. La clave es la que se marca en la tarjeta de cada viaje: no la cambies si el bloque ya se usa."
        bloques={v.servicios}
        conClave
        onChange={(i, campo, valor) => bloque("servicios", i, campo, valor)}
        onAdd={() => agregar("servicios")}
        onRemove={(i) => quitar("servicios", i)}
      />

      <ListaBloques
        titulo="Condiciones de reserva"
        ayuda="Los números tienen que decir lo mismo que la cláusula sexta del contrato que firma el viajero. Si cambian allá, cámbialos aquí."
        bloques={v.condiciones}
        onChange={(i, campo, valor) => bloque("condiciones", i, campo, valor)}
        onAdd={() => agregar("condiciones")}
        onRemove={(i) => quitar("condiciones", i)}
      />

      {msg && (
        <div aria-live="polite" className={`px-5 py-2 text-sm border-t ${msg.ok ? "text-bosque bg-crema border-border" : "text-red-700 bg-red-50 border-red-200"}`}>
          {msg.texto}
        </div>
      )}
    </section>
  );
}

function ListaBloques({
  titulo, ayuda, bloques, conClave, onChange, onAdd, onRemove,
}: {
  titulo: string;
  ayuda: string;
  bloques: Bloque[];
  conClave?: boolean;
  onChange: (i: number, campo: keyof Bloque, valor: unknown) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);

  return (
    <div className="px-5 py-4 border-b border-border">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-bosque">{titulo}</h3>
        <button onClick={onAdd} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
          <Plus size={13} /> Agregar bloque
        </button>
      </div>
      <p className="text-xs text-muted mb-3">{ayuda}</p>

      <div className="space-y-2">
        {bloques.map((b, i) => (
          <div key={i} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-taupe/20">
              <button onClick={() => setAbierto(abierto === i ? null : i)} className="text-muted hover:text-bosque transition">
                {abierto === i ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              <input
                value={b.titulo}
                onChange={(e) => onChange(i, "titulo", e.target.value)}
                className="flex-1 bg-transparent text-sm font-medium text-bosque"
              />
              <button onClick={() => onRemove(i)} title="Quitar bloque" className="text-muted hover:text-red-600 transition">
                <Trash2 size={14} />
              </button>
            </div>

            {abierto === i && (
              <div className="px-3 py-3 space-y-3 text-sm">
                {conClave && (
                  <Campo label="Clave" value={b.clave} onChange={(x) => onChange(i, "clave", x)} mono />
                )}
                <Campo label="Resumen (una línea, va en cursiva)" value={b.resumen ?? ""} onChange={(x) => onChange(i, "resumen", x)} />
                <Area label="Párrafos — uno por línea" value={lineas(b.parrafos)} onChange={(x) => onChange(i, "parrafos", partir(x))} rows={7}
                  ayuda="Una línea en MAYÚSCULAS y corta se dibuja como subtítulo dentro del bloque." />
                <Area label="Viñetas o pasos — uno por línea" value={lineas(b.vinetas)} onChange={(x) => onChange(i, "vinetas", partir(x))} rows={5} />
                <Area label="Cierre — un párrafo por línea" value={lineas(b.cierre)} onChange={(x) => onChange(i, "cierre", partir(x))} rows={4}
                  ayuda="Va después de las viñetas." />
              </div>
            )}
          </div>
        ))}
        {bloques.length === 0 && <p className="text-xs text-muted py-4 text-center">Sin bloques.</p>}
      </div>
    </div>
  );
}

export function Campo({
  label, value, onChange, className, mono, hint,
}: {
  label: string; value?: string | null; onChange: (v: string) => void;
  className?: string; mono?: boolean; hint?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs text-muted">{label}</span>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full px-3 py-2 rounded-md border border-border bg-white text-sm ${mono ? "font-mono text-xs" : ""}`}
      />
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

export function Area({
  label, value, onChange, rows = 4, ayuda,
}: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; ayuda?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white text-sm leading-relaxed"
      />
      {ayuda && <span className="block text-[11px] text-muted mt-1">{ayuda}</span>}
    </label>
  );
}
