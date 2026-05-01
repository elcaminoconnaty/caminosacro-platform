"use client";

import { useState, useTransition } from "react";
import { addClientPayment, deleteClientPayment } from "./actions";
import { eur, fechaCorta } from "@/lib/format";

type Payment = {
  id: string;
  paid_at: string;
  amount: number;
  currency: string;
  trm_eur_cop: number | null;
  amount_eur: number | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
};

const METHODS = ["transferencia", "efectivo", "tarjeta", "wise", "paypal", "otro"];

export default function ClientPaymentsCard({
  quoteId,
  payments,
  cobrado,
  saldo,
}: {
  quoteId: string;
  payments: Payment[];
  cobrado: number;
  saldo: number;
}) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("EUR");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await addClientPayment(quoteId, formData);
      if (r?.error) setError(r.error);
      else setOpen(false);
    });
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar este pago?")) return;
    startTransition(async () => {
      await deleteClientPayment(quoteId, id);
    });
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg text-bosque">Pagos del cliente</h2>
          <p className="text-xs text-muted mt-0.5">
            Cobrado: <span className="font-medium text-bosque">{eur(cobrado)}</span> · Saldo:{" "}
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
            <span className="text-xs text-muted">Método</span>
            <select name="method" className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white">
              <option value="">—</option>
              {METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="col-span-1">
            <span className="text-xs text-muted">Monto</span>
            <input name="amount" type="number" step="0.01" required className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
          </label>
          <label className="col-span-1">
            <span className="text-xs text-muted">Moneda</span>
            <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white">
              <option>EUR</option>
              <option>COP</option>
              <option>USD</option>
            </select>
          </label>
          {currency === "COP" && (
            <label className="col-span-2">
              <span className="text-xs text-muted">TRM al recibir (COP por 1 EUR)</span>
              <input name="trm_eur_cop" type="number" step="0.01" placeholder="ej. 4350" className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
              <span className="text-[10px] text-muted">Para convertir el COP a EUR y descontarlo del saldo.</span>
            </label>
          )}
          <label className="col-span-2">
            <span className="text-xs text-muted">Referencia (opcional)</span>
            <input name="reference" placeholder="ej. comprobante #12345" className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
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
              <div className="font-medium">
                {p.amount.toLocaleString("es-CO")} {p.currency}
                {p.amount_eur != null && p.currency !== "EUR" && (
                  <span className="text-xs text-muted font-normal"> · ≈ {eur(p.amount_eur)}</span>
                )}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {fechaCorta(p.paid_at)}
                {p.method && <span> · {p.method}</span>}
                {p.trm_eur_cop && <span> · TRM {p.trm_eur_cop}</span>}
                {p.reference && <span> · {p.reference}</span>}
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
