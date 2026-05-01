"use client";

import { useState, useTransition } from "react";
import { addProviderPayment, deleteProviderPayment } from "./actions";
import { eur, fechaCorta } from "@/lib/format";

type Payment = {
  id: string;
  paid_at: string;
  amount_eur: number;
  invoice_number: string | null;
  notes: string | null;
};

export default function ProviderPaymentsCard({
  quoteId,
  payments,
  pagado,
  saldo,
}: {
  quoteId: string;
  payments: Payment[];
  pagado: number;
  saldo: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await addProviderPayment(quoteId, formData);
      if (r?.error) setError(r.error);
      else setOpen(false);
    });
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar este pago a Pilgrim?")) return;
    startTransition(async () => {
      await deleteProviderPayment(quoteId, id);
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg text-bosque">Pagos a Pilgrim</h2>
          <p className="text-xs text-muted mt-0.5">
            Pagado: <span className="font-medium text-bosque">{eur(pagado)}</span> · Saldo:{" "}
            <span className={`font-medium ${saldo > 0 ? "text-amber-700" : "text-bosque"}`}>{eur(saldo)}</span>
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition"
        >
          {open ? "Cerrar" : "+ Pago"}
        </button>
      </div>

      {open && (
        <form action={onSubmit} className="px-5 py-4 border-b border-border bg-taupe/20 grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-1">
            <span className="text-xs text-muted">Fecha</span>
            <input name="paid_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
          </label>
          <label className="col-span-1">
            <span className="text-xs text-muted">Monto € (Pilgrim cobra en EUR)</span>
            <input name="amount_eur" type="number" step="0.01" required className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
          </label>
          <label className="col-span-2">
            <span className="text-xs text-muted">Nº de factura / referencia Pilgrim</span>
            <input name="invoice_number" className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
          </label>
          <label className="col-span-2">
            <span className="text-xs text-muted">Notas</span>
            <textarea name="notes" rows={2} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
          </label>
          {error && <p className="col-span-2 text-sm text-red-700">{error}</p>}
          <div className="col-span-2 flex justify-end">
            <button type="submit" disabled={pending} className="px-3 py-1.5 rounded-md bg-bosque text-white text-xs font-medium hover:bg-bosque-medio disabled:opacity-50">
              {pending ? "Guardando…" : "Registrar pago"}
            </button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-border">
        {payments.map((p) => (
          <li key={p.id} className="px-5 py-3 text-sm flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{eur(p.amount_eur)}</div>
              <div className="text-xs text-muted mt-0.5">
                {fechaCorta(p.paid_at)}
                {p.invoice_number && <span> · Factura {p.invoice_number}</span>}
              </div>
              {p.notes && <div className="text-xs text-muted mt-1 italic">{p.notes}</div>}
            </div>
            <button
              onClick={() => onDelete(p.id)}
              className="text-[10px] text-muted hover:text-red-700 transition"
              disabled={pending}
            >
              eliminar
            </button>
          </li>
        ))}
        {payments.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-muted">Sin pagos registrados.</li>
        )}
      </ul>
    </section>
  );
}
