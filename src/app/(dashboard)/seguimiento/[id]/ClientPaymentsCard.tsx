"use client";

import { useState, useTransition } from "react";
import { addClientPayment, updateClientPayment, deleteClientPayment, generateClientReceipt, getSignedUrl } from "./actions";
import { eur, fechaCorta } from "@/lib/format";
import { ACCOUNTS, accountLabel } from "@/lib/accounts";

type Payment = {
  id: string;
  paid_at: string;
  amount: number;
  currency: string;
  trm_eur_cop: number | null;
  amount_eur: number | null;
  method: string | null;
  account: string | null;
  reference: string | null;
  notes: string | null;
  receipt_path: string | null;
  receipt_number: string | null;
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
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submitNew(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await addClientPayment(quoteId, formData);
      if (r?.error) setError(r.error);
      else setAdding(false);
    });
  }

  function submitEdit(id: string, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await updateClientPayment(quoteId, id, formData);
      if (r?.error) setError(r.error);
      else setEditingId(null);
    });
  }

  function onDelete(id: string) {
    if (!confirm("¿Eliminar este pago?")) return;
    startTransition(async () => {
      await deleteClientPayment(quoteId, id);
    });
  }

  function onReceipt(id: string) {
    setError(null);
    setReceiptId(id);
    startTransition(async () => {
      const r = await generateClientReceipt(quoteId, id);
      setReceiptId(null);
      if (r?.error) setError(r.error);
    });
  }

  function onViewReceipt(path: string) {
    startTransition(async () => {
      const r = await getSignedUrl(path);
      if ("url" in r && r.url) window.open(r.url, "_blank");
      else if ("error" in r && r.error) setError(r.error);
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
          onClick={() => { setAdding((o) => !o); setEditingId(null); setError(null); }}
          className="text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition"
        >
          {adding ? "Cerrar" : "+ Pago"}
        </button>
      </div>

      {adding && (
        <PaymentForm onSubmit={submitNew} onCancel={() => setAdding(false)} pending={pending} error={error} />
      )}

      {error && !adding && !editingId && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-800 text-xs">{error}</div>
      )}

      <ul className="divide-y divide-border">
        {payments.map((p) => (
          <li key={p.id} className="text-sm">
            {editingId === p.id ? (
              <PaymentForm
                payment={p}
                onSubmit={(fd) => submitEdit(p.id, fd)}
                onCancel={() => setEditingId(null)}
                pending={pending}
                error={error}
              />
            ) : (
              <div className="px-5 py-3 flex items-start justify-between gap-3">
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
                    {p.account && <span> · {accountLabel(p.account)}</span>}
                    {p.trm_eur_cop && <span> · TRM {p.trm_eur_cop}</span>}
                    {p.reference && <span> · {p.reference}</span>}
                  </div>
                  {p.notes && <div className="text-xs text-muted mt-1 italic">{p.notes}</div>}
                  {p.receipt_number && (
                    <div className="text-xs mt-1">
                      <button
                        onClick={() => p.receipt_path && onViewReceipt(p.receipt_path)}
                        className="text-bosque hover:underline"
                        disabled={pending}
                      >
                        📄 {p.receipt_number}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={() => onReceipt(p.id)}
                    className="text-[10px] text-muted hover:text-bosque transition"
                    disabled={pending}
                  >
                    {receiptId === p.id ? "generando…" : p.receipt_path ? "regenerar recibo" : "generar recibo"}
                  </button>
                  <button
                    onClick={() => { setEditingId(p.id); setAdding(false); setError(null); }}
                    className="text-[10px] text-muted hover:text-bosque transition"
                    disabled={pending}
                  >
                    editar
                  </button>
                  <button
                    onClick={() => onDelete(p.id)}
                    className="text-[10px] text-muted hover:text-red-700 transition"
                    disabled={pending}
                  >
                    eliminar
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {payments.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-muted">Sin pagos registrados.</li>
        )}
      </ul>
    </section>
  );
}

function PaymentForm({
  payment,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  payment?: Payment;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [currency, setCurrency] = useState(payment?.currency ?? "EUR");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={onSubmit}
      className="px-5 py-4 border-b border-border bg-taupe/20 grid grid-cols-2 gap-3 text-sm"
    >
      <label className="col-span-1">
        <span className="text-xs text-muted">Fecha</span>
        <input name="paid_at" type="date" defaultValue={payment?.paid_at ?? today} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
      </label>
      <label className="col-span-1">
        <span className="text-xs text-muted">Método</span>
        <select name="method" defaultValue={payment?.method ?? ""} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white">
          <option value="">—</option>
          {METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <label className="col-span-1">
        <span className="text-xs text-muted">Monto</span>
        <input name="amount" type="number" step="0.01" required defaultValue={payment?.amount ?? ""} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
      </label>
      <label className="col-span-1">
        <span className="text-xs text-muted">Moneda</span>
        <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white">
          <option>EUR</option>
          <option>COP</option>
          <option>USD</option>
        </select>
      </label>
      <label className="col-span-2">
        <span className="text-xs text-muted">Cuenta que recibió</span>
        <select name="account" defaultValue={payment?.account ?? ""} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white">
          <option value="">—</option>
          {ACCOUNTS.map((a) => <option key={a.slug} value={a.slug}>{a.label} ({a.currency})</option>)}
        </select>
      </label>
      {currency === "COP" && (
        <label className="col-span-2">
          <span className="text-xs text-muted">TRM al recibir (COP por 1 EUR)</span>
          <input name="trm_eur_cop" type="number" step="0.01" placeholder="ej. 4350" defaultValue={payment?.trm_eur_cop ?? ""} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
          <span className="text-[10px] text-muted">Para convertir el COP a EUR y descontarlo del saldo.</span>
        </label>
      )}
      <label className="col-span-2">
        <span className="text-xs text-muted">Referencia (opcional)</span>
        <input name="reference" placeholder="ej. comprobante #12345" defaultValue={payment?.reference ?? ""} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
      </label>
      <label className="col-span-2">
        <span className="text-xs text-muted">Notas</span>
        <textarea name="notes" rows={2} defaultValue={payment?.notes ?? ""} className="mt-1 w-full px-2 py-1.5 rounded-md border border-border bg-white" />
      </label>
      {error && <p className="col-span-2 text-sm text-red-700">{error}</p>}
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-taupe/40">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="px-3 py-1.5 rounded-md bg-bosque text-white text-xs font-medium hover:bg-bosque-medio disabled:opacity-50">
          {pending ? "Guardando…" : payment ? "Guardar cambios" : "Registrar pago"}
        </button>
      </div>
    </form>
  );
}
