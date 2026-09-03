"use client";

// Datos del proveedor Pilgrim: a dónde va el correo con la reserva y el pedido del
// link de pago (tarjeta "Correo a Pilgrim" del seguimiento).

import { useState, useTransition } from "react";
import { savePilgrimSettings } from "./actions";

export default function PilgrimForm({
  current,
}: {
  current: { email: string; nombre: string; contacto: string };
}) {
  const [email, setEmail] = useState(current.email);
  const [nombre, setNombre] = useState(current.nombre);
  const [contacto, setContacto] = useState(current.contacto);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function guardar() {
    setMsg(null);
    startTransition(async () => {
      const r = await savePilgrimSettings({ email, nombre, contacto });
      setMsg(r.ok ? { ok: true, texto: "✓ Guardado" } : { ok: false, texto: r.error ?? "No se pudo guardar." });
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="font-display text-lg text-bosque">Proveedor Pilgrim</h2>
        <p className="text-xs text-muted mt-0.5">
          A este correo se le envía el detalle de cada reserva pidiendo el link de pago.
        </p>
      </div>
      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <label className="block md:col-span-2">
          <span className="text-xs text-muted">Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="reservas@pilgrim.es"
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Nombre del proveedor</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Pilgrim"
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
          />
        </label>
        <label className="block md:col-span-3">
          <span className="text-xs text-muted">Persona de contacto (opcional)</span>
          <input
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
            placeholder="Nombre de quien recibe los correos"
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white"
          />
        </label>
        <div className="md:col-span-3 flex items-center gap-3">
          <button
            onClick={guardar}
            disabled={pending}
            className="px-4 py-2 rounded-md bg-bosque text-white text-sm font-medium hover:bg-bosque-medio disabled:opacity-50 transition"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          {msg && <span aria-live="polite" className={`text-sm ${msg.ok ? "text-bosque" : "text-red-600"}`}>{msg.texto}</span>}
        </div>
      </div>
    </section>
  );
}
