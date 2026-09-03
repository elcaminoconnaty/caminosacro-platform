"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { BedDouble, Camera, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  eliminarFotoHotel,
  eliminarHotel,
  guardarHotel,
  moverFotoHotel,
  subirFotoHotel,
} from "./actions";

export type HotelFoto = { path: string; position?: number; url?: string | null };

export type Hotel = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  category: string | null;
  notes: string | null;
  photos: HotelFoto[];
  active: boolean;
};

const CATEGORIAS = [
  { valor: "pension", etiqueta: "Pensión" },
  { valor: "hotel", etiqueta: "Hotel" },
  { valor: "hostal", etiqueta: "Hostal" },
  { valor: "albergue", etiqueta: "Albergue" },
  { valor: "casa_rural", etiqueta: "Casa rural" },
];

function etiquetaCategoria(v: string | null): string {
  return CATEGORIAS.find((c) => c.valor === v)?.etiqueta ?? "—";
}

export default function HotelsManager({ hotels }: { hotels: Hotel[] }) {
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Hotel | "nuevo" | null>(null);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return hotels;
    return hotels.filter((h) =>
      [h.name, h.city, h.address].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [hotels, q]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl text-bosque">Hoteles</h1>
          <p className="text-sm text-muted mt-1">
            La ficha de cada alojamiento del Camino. La documentación de viaje lee de aquí el
            nombre, la dirección, los contactos, las observaciones y las fotos: se corrige en un
            solo lugar y queda bien en todos los viajes.
          </p>
        </div>
        <button
          onClick={() => setEditando("nuevo")}
          className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-md bg-bosque text-white hover:bg-bosque-medio transition"
        >
          <Plus size={15} /> Nuevo hotel
        </button>
      </header>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, ciudad o dirección"
          className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-white text-sm"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-xl px-6 py-14 text-center">
          <BedDouble size={26} className="mx-auto text-muted mb-3" />
          <p className="text-sm text-muted">
            {hotels.length === 0
              ? "Todavía no hay hoteles. Crea el primero y ve cargándolos a medida que Pilgrim confirme alojamientos."
              : "Ningún hotel coincide con la búsqueda."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtrados.map((h) => (
            <HotelCard key={h.id} hotel={h} onEdit={() => setEditando(h)} />
          ))}
        </div>
      )}

      {editando && (
        <HotelDialog
          hotel={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function HotelCard({ hotel, onEdit }: { hotel: Hotel; onEdit: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!confirm(`¿Borrar «${hotel.name}»? Las noches que lo usaban quedarán sin hotel asignado.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await eliminarHotel(hotel.id);
      if (r?.error) setError(r.error);
    });
  }

  return (
    <section className={`bg-bg-card border border-border rounded-xl overflow-hidden ${hotel.active ? "" : "opacity-60"}`}>
      <div className="px-5 py-3 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-bosque truncate">{hotel.name}</h2>
          <p className="text-xs text-muted mt-0.5 truncate">
            {[hotel.city, etiquetaCategoria(hotel.category)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!hotel.active && (
            <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider bg-taupe/60 text-muted">Inactivo</span>
          )}
          <button onClick={onEdit} title="Editar" className="p-1.5 text-muted hover:text-bosque transition">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} disabled={pending} title="Borrar" className="p-1.5 text-muted hover:text-red-600 transition disabled:opacity-50">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="px-5 py-3 text-xs text-muted space-y-1">
        {hotel.address && <p>{hotel.address}</p>}
        <p>{[hotel.phone, hotel.email].filter(Boolean).join("  ·  ") || "Sin contactos cargados"}</p>
      </div>

      <Galeria hotelId={hotel.id} fotos={hotel.photos} />

      {hotel.notes && (
        <p className="px-5 py-3 border-t border-border text-xs text-muted leading-relaxed line-clamp-3">
          {hotel.notes}
        </p>
      )}
      {error && <div role="alert" className="px-5 py-2 text-xs text-red-700 bg-red-50 border-t border-red-200">{error}</div>}
    </section>
  );
}

function Galeria({ hotelId, fotos }: { hotelId: string; fotos: HotelFoto[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // El input es múltiple: las tres fotos de un hotel se eligen juntas en el explorador.
  // Van todas en el mismo FormData y la action las procesa en orden.
  function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append("file", f);
    e.target.value = "";
    setError(null);
    startTransition(async () => {
      const r = await subirFotoHotel(hotelId, fd);
      if (r?.error) setError(r.error);
    });
  }

  function accion(fn: () => Promise<{ error?: string } | undefined>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="px-5 py-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-muted">Fotos ({fotos.length}/3)</span>
        {fotos.length < 3 && (
          <label className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition cursor-pointer">
            <Camera size={13} />
            {pending ? "Subiendo…" : fotos.length === 0 ? "Agregar fotos" : `Agregar (${3 - fotos.length} libre${3 - fotos.length === 1 ? "" : "s"})`}
            <input type="file" accept="image/*" multiple className="hidden" onChange={subir} disabled={pending} />
          </label>
        )}
      </div>

      {fotos.length === 0 ? (
        <p className="text-xs text-muted">
          Sin fotos. El documento de viaje muestra hasta tres por noche: podés elegir las tres
          de una vez.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {fotos.map((f, i) => (
            <div key={f.path} className="relative group rounded overflow-hidden bg-taupe/30 aspect-[4/3]">
              {f.url ? (
                <Image src={f.url} alt="" fill sizes="200px" className="object-cover" unoptimized />
              ) : (
                <div className="w-full h-full grid place-items-center text-[10px] text-muted">sin vista previa</div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/45 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => accion(() => moverFotoHotel(hotelId, f.path, -1))}
                  disabled={pending || i === 0}
                  title="Mover a la izquierda"
                  className="p-1 text-white disabled:opacity-30"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  onClick={() => accion(() => eliminarFotoHotel(hotelId, f.path))}
                  disabled={pending}
                  title="Quitar foto"
                  className="p-1 text-white hover:text-red-300"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  onClick={() => accion(() => moverFotoHotel(hotelId, f.path, 1))}
                  disabled={pending || i === fotos.length - 1}
                  title="Mover a la derecha"
                  className="p-1 text-white disabled:opacity-30"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function HotelDialog({ hotel, onClose }: { hotel: Hotel | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await guardarHotel(hotel?.id ?? null, fd);
      if (r?.error) setError(r.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <form
        onSubmit={onSubmit}
        className="bg-bg-card border border-border rounded-xl w-full max-w-2xl overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-lg text-bosque">{hotel ? "Editar hotel" : "Nuevo hotel"}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-bosque transition">
            <X size={17} />
          </button>
        </div>

        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Nombre" name="name" defaultValue={hotel?.name} required className="sm:col-span-2" />
          <Campo label="Ciudad" name="city" defaultValue={hotel?.city} hint="Debe coincidir con la localidad de la etapa: es lo que usa el prellenado." />
          <div>
            <label className="block text-xs text-muted mb-1">Categoría</label>
            <select
              name="category"
              defaultValue={hotel?.category ?? ""}
              className="w-full px-3 py-2 rounded-md border border-border bg-white text-sm"
            >
              <option value="">—</option>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
              ))}
            </select>
          </div>
          <Campo label="Dirección" name="address" defaultValue={hotel?.address} className="sm:col-span-2" />
          <Campo label="Teléfono" name="phone" defaultValue={hotel?.phone} />
          <Campo label="Email" name="email" type="email" defaultValue={hotel?.email} />
          <Campo label="Web" name="website" defaultValue={hotel?.website} className="sm:col-span-2" />

          <div className="sm:col-span-2">
            <label className="block text-xs text-muted mb-1">Observaciones fijas</label>
            <textarea
              name="notes"
              rows={5}
              defaultValue={hotel?.notes ?? ""}
              placeholder="Horario de desayunos, check-in y check-out, recepción 24 h, tasa turística, ascensor, dónde guardar la bici…"
              className="w-full px-3 py-2 rounded-md border border-border bg-white text-sm leading-relaxed"
            />
            <p className="text-[11px] text-muted mt-1">
              Salen en «Observaciones» de cada noche donde aparezca este hotel. Lo puntual de un
              viaje concreto se escribe en la noche, no aquí.
            </p>
          </div>

          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={hotel?.active ?? true} className="rounded border-border" />
            Activo (aparece al asignar hoteles a un viaje)
          </label>
        </div>

        {error && <div role="alert" className="px-5 py-2 text-sm text-red-700 bg-red-50 border-t border-red-200">{error}</div>}

        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="text-sm px-4 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({
  label, name, defaultValue, type = "text", required, className, hint,
}: {
  label: string; name: string; defaultValue?: string | null; type?: string;
  required?: boolean; className?: string; hint?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="w-full px-3 py-2 rounded-md border border-border bg-white text-sm"
      />
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}
