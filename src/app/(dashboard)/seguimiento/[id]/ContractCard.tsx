"use client";

// Card "Contrato de servicios" en Seguimiento: formulario con las variables del
// contrato (precargadas desde la cotización, todo editable), plan de pago
// (100% por defecto o financiado en cuotas), link público de firma y descargas.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSignedUrl } from "./actions";
import {
  createContract,
  refreshContractVariables,
  saveContract,
  generateContractPdf,
  sendContractLink,
  revokeContractLink,
  type ContractRow,
} from "./contractActions";
import {
  buildCronograma,
  VARIABLE_LABELS,
  type ContractVariables,
  type PaymentPlan,
  type Cuota,
} from "@/lib/contracts/template";

// Igual que MAX_RECORDATORIOS en /api/cron/recordatorios-contrato: solo para el rótulo.
const MAX_RECORDATORIOS = 5;

/** "Recordatorio 2 de 5 · último el 14 de agosto", o null si aún no se ha enviado ninguno. */
function rotuloRecordatorios(contract: ContractRow | null): string | null {
  if (contract?.status !== "enviado" || !contract.reminder_count) return null;
  const fecha = contract.last_reminder_at
    ? new Date(contract.last_reminder_at).toLocaleDateString("es-CO", { day: "numeric", month: "long" })
    : null;
  const tope = contract.reminder_count >= MAX_RECORDATORIOS ? " · sin más envíos, conviene llamarlo" : "";
  return `Recordatorio ${contract.reminder_count} de ${MAX_RECORDATORIOS}${fecha ? ` · último el ${fecha}` : ""}${tope}`;
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  borrador: { label: "En revisión", cls: "bg-taupe/60 text-fg" },
  enviado: { label: "Aprobado · esperando firma", cls: "bg-amber-100 text-amber-800" },
  firmado: { label: "Firmado", cls: "bg-bosque text-white" },
  anulado: { label: "Anulado", cls: "bg-red-100 text-red-700" },
};

// Orden y agrupación de los campos del formulario.
const GRUPOS: { titulo: string; campos: (keyof ContractVariables)[] }[] = [
  {
    titulo: "El viajero",
    campos: [
      "viajero_nombre",
      "viajero_tipo_documento",
      "viajero_documento",
      "viajero_email",
      "viajero_telefono",
      "viajero_direccion",
    ],
  },
  {
    titulo: "El viaje",
    campos: ["ruta_nombre", "origen", "destino", "fecha_inicio", "fecha_fin", "num_personas", "modalidad", "habitaciones"],
  },
  {
    titulo: "Valores",
    campos: ["valor_total_eur", "valor_total_cop", "trm", "fecha_cotizacion", "validez"],
  },
  {
    titulo: "Textos del anexo",
    campos: ["incluye", "no_incluye", "opcionales"],
  },
];

const TEXTAREA_FIELDS: (keyof ContractVariables)[] = ["incluye", "no_incluye", "opcionales"];
const DATE_FIELDS: (keyof ContractVariables)[] = ["fecha_inicio", "fecha_fin", "fecha_cotizacion"];

export default function ContractCard({
  quoteId,
  contract,
  defaultVariables,
  totalEur,
}: {
  quoteId: string;
  contract: ContractRow | null;
  defaultVariables: ContractVariables | null;
  totalEur: number;
}) {
  const router = useRouter();
  const existe = !!contract;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Cuando aún no existe el contrato, el formulario arranca abierto para revisar
  // los datos precargados antes de crearlo.
  const [open, setOpen] = useState(!existe);

  const [vars, setVars] = useState<ContractVariables | null>(
    (contract?.variables_json as ContractVariables) ?? defaultVariables ?? null,
  );
  const [plan, setPlan] = useState<PaymentPlan>(
    (contract?.payment_plan_json as PaymentPlan) ?? { type: "contado" },
  );
  const [numCuotas, setNumCuotas] = useState<number>(
    contract?.payment_plan_json?.type === "financiado" ? contract.payment_plan_json.cuotas.length : 3,
  );

  const firmado = contract?.status === "firmado";
  const chip = STATUS_CHIP[contract?.status ?? "borrador"];

  // Rastro de los recordatorios automáticos de firma (los envía el cron cada 4 días).
  const recordatorios = rotuloRecordatorios(contract);

  const sumaCuotas = useMemo(
    () => (plan.type === "financiado" ? plan.cuotas.reduce((s, c) => s + (Number(c.monto_eur) || 0), 0) : 0),
    [plan],
  );

  function run(fn: () => Promise<{ error?: string } | void>, okMsg?: string) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await fn();
      if (r && "error" in r && r.error) setError(r.error);
      else {
        if (okMsg) setInfo(okMsg);
        router.refresh();
      }
    });
  }

  async function abrirArchivo(path: string | null) {
    if (!path) return;
    setError(null);
    startTransition(async () => {
      const r = await getSignedUrl(path);
      if (r.url) window.open(r.url, "_blank");
      else if (r.error) setError(r.error);
    });
  }

  // Guarda + genera + abre el PDF de vista previa en una sola acción. Abrimos una
  // pestaña en blanco de inmediato (gesto del usuario) y luego le fijamos la URL,
  // para que el navegador no bloquee el pop-up tras el await.
  function verVistaPrevia() {
    setError(null);
    setInfo(null);
    const win = window.open("", "_blank");
    startTransition(async () => {
      if (vars) {
        const s = await saveContract(quoteId, vars, plan);
        if (s.error) {
          win?.close();
          setError(s.error);
          return;
        }
      }
      const g = await generateContractPdf(quoteId);
      if (g.error || !g.url) {
        win?.close();
        setError(g.error ?? "No se pudo generar la vista previa.");
        return;
      }
      if (win) win.location.href = g.url;
      else window.open(g.url, "_blank"); // por si el navegador no dejó abrir antes
      router.refresh();
    });
  }

  function setVar(k: keyof ContractVariables, v: string) {
    setVars((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  function generarCuotas() {
    if (!vars) return;
    const cuotas = buildCronograma(totalEur, numCuotas, vars.fecha_inicio || null);
    setPlan({ type: "financiado", cuotas });
  }

  function setCuota(i: number, patch: Partial<Cuota>) {
    setPlan((prev) => {
      if (prev.type !== "financiado") return prev;
      const cuotas = prev.cuotas.map((c, j) => (j === i ? { ...c, ...patch } : c));
      return { type: "financiado", cuotas };
    });
  }

  // ---------- Sin datos para precargar (caso raro) ----------
  if (!vars) {
    return (
      <section className="bg-bg-card border border-border rounded-xl px-5 py-4">
        <h2 className="font-display text-lg text-bosque">Contrato de servicios</h2>
        <p className="text-xs text-muted mt-0.5">
          No pude precargar los datos de esta cotización. Completa la ruta, el cliente y el valor, y vuelve a entrar.
        </p>
        {error && <div className="text-sm text-red-700 mt-2">{error}</div>}
      </section>
    );
  }

  // ---------- Contrato firmado: solo lectura + descargas ----------
  if (firmado && contract) {
    return (
      <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg text-bosque">Contrato de servicios</h2>
            <p className="text-xs text-muted mt-0.5">
              Firmado por {contract.signer_name} ({contract.signer_document}) el{" "}
              {contract.signed_at ? new Date(contract.signed_at).toLocaleString("es-CO") : "—"}.
            </p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${chip.cls}`}>{chip.label}</span>
        </div>
        <div className="px-5 py-3 flex flex-wrap gap-2">
          <button
            onClick={() => abrirArchivo(contract.signed_pdf_path)}
            disabled={pending || !contract.signed_pdf_path}
            className="text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
          >
            Contrato firmado
          </button>
          <button
            onClick={() => abrirArchivo(contract.passport_path)}
            disabled={pending || !contract.passport_path}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
          >
            {contract.passport_path ? "Ver pasaporte" : "Sin pasaporte"}
          </button>
        </div>
        {contract.doc_hash && (
          <div className="px-5 pb-3 text-[10px] font-mono text-muted truncate">
            SHA-256: {contract.doc_hash} · IP: {contract.signer_ip || "—"}
          </div>
        )}
        {error && <div className="px-5 py-2 text-sm text-red-700 bg-red-50 border-t border-red-200">{error}</div>}
      </section>
    );
  }

  // ---------- Crear (revisión previa) / borrador / enviado: editor completo ----------
  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg text-bosque">Contrato de servicios</h2>
          <p className="text-xs text-muted mt-0.5">
            {existe
              ? "Variables precargadas desde la cotización; todo es editable antes de enviar a firma."
              : "Revisa los datos precargados desde la cotización y, cuando estén correctos, crea el contrato."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${existe ? chip.cls : "bg-dorado/30 text-dorado-oscuro"}`}>
            {existe ? chip.label : "Nuevo · por revisar"}
          </span>
          {recordatorios && (
            <span className="text-[10px] text-muted" title="Recordatorios automáticos de firma, cada 4 días (máximo 5)">
              {recordatorios}
            </span>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
          >
            {open ? "Cerrar datos" : "Ver / editar datos"}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-5 py-4 space-y-5">
          {GRUPOS.map((g) => (
            <fieldset key={g.titulo}>
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{g.titulo}</legend>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {g.campos.map((k) => (
                  <label key={k} className={`text-xs ${TEXTAREA_FIELDS.includes(k) ? "md:col-span-3" : ""}`}>
                    <span className="text-muted">{VARIABLE_LABELS[k]}</span>
                    {TEXTAREA_FIELDS.includes(k) ? (
                      <textarea
                        value={vars[k]}
                        onChange={(e) => setVar(k, e.target.value)}
                        rows={2}
                        className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-sm bg-white"
                      />
                    ) : (
                      <input
                        type={DATE_FIELDS.includes(k) ? "date" : "text"}
                        value={vars[k]}
                        onChange={(e) => setVar(k, e.target.value)}
                        className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-sm bg-white"
                      />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Moneda de pago del viajero
              </legend>
              <select
                value={vars.moneda}
                onChange={(e) => setVar("moneda", e.target.value as "EUR" | "COP")}
                className="border border-border rounded-md px-2 py-1.5 text-sm bg-white"
              >
                <option value="EUR">Euros (transferencia a España) — sin mención de tasa</option>
                <option value="COP">Pesos colombianos — con equivalente en euros y TRM</option>
              </select>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Autorización de imagen
              </legend>
              <select
                value={vars.autoriza_imagen}
                onChange={(e) => setVar("autoriza_imagen", e.target.value as "sí" | "no")}
                className="border border-border rounded-md px-2 py-1.5 text-sm bg-white"
              >
                <option value="sí">Autoriza uso de imagen</option>
                <option value="no">No autoriza uso de imagen</option>
              </select>
            </fieldset>
          </div>

          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Plan de pago</legend>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={plan.type === "contado"}
                  onChange={() => setPlan({ type: "contado" })}
                />
                100% al confirmar (por defecto)
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={plan.type === "financiado"}
                  onChange={generarCuotas}
                />
                Financiado en
              </label>
              <input
                type="number"
                min={2}
                max={12}
                value={numCuotas}
                onChange={(e) => setNumCuotas(Number(e.target.value) || 2)}
                className="w-16 border border-border rounded-md px-2 py-1 text-sm bg-white"
              />
              <span className="text-sm">cuotas</span>
              {plan.type === "financiado" && (
                <button
                  onClick={generarCuotas}
                  className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition"
                >
                  Regenerar cronograma
                </button>
              )}
            </div>

            {plan.type === "financiado" && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[11px] text-muted">
                  La última cuota queda máximo 60 días antes del viaje (regla del contrato). Con pago financiado, el
                  paquete de firma incluye automáticamente el pagaré en blanco y su carta de instrucciones.
                </p>
                {plan.cuotas.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-14 text-xs text-muted">Cuota {c.n}</span>
                    <input
                      type="date"
                      value={c.fecha}
                      onChange={(e) => setCuota(i, { fecha: e.target.value })}
                      className="border border-border rounded-md px-2 py-1 text-sm bg-white"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={c.monto_eur}
                      onChange={(e) => setCuota(i, { monto_eur: Number(e.target.value) || 0 })}
                      className="w-28 border border-border rounded-md px-2 py-1 text-sm bg-white"
                    />
                    <span className="text-xs text-muted">EUR</span>
                  </div>
                ))}
                <p className={`text-xs ${Math.abs(sumaCuotas - totalEur) > 0.01 ? "text-amber-700" : "text-muted"}`}>
                  Suma: {sumaCuotas.toFixed(2)} € · Total cotizado: {totalEur.toFixed(2)} €
                  {Math.abs(sumaCuotas - totalEur) > 0.01 ? " — las cuotas no cuadran con el total" : " ✓"}
                </p>
              </div>
            )}
          </fieldset>
        </div>
      )}

      {/* Botones — caso NUEVO: solo revisar y crear */}
      {!existe ? (
        <div className="px-5 py-3 border-t border-border flex flex-wrap items-center gap-2">
          <button
            onClick={() => run(() => createContract(quoteId, vars, plan), "Contrato creado. Ya puedes generar la vista previa y enviarlo a firma.")}
            disabled={pending}
            className="text-xs px-3.5 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50 font-medium"
          >
            {pending ? "Creando…" : "Crear contrato con estos datos"}
          </button>
          <button
            onClick={() =>
              run(async () => {
                const r = await refreshContractVariables(quoteId);
                if (r.error) return { error: r.error };
                if (r.variables) setVars(r.variables);
              }, "Datos recargados desde la cotización.")
            }
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50 ml-auto"
          >
            Recargar desde cotización
          </button>
        </div>
      ) : (
        /* Flujo: Guardar (revisión) → Ver vista previa → Aprobar y enviar para firma */
        <div className="px-5 py-3 border-t border-border flex flex-wrap items-center gap-2">
          <button
            onClick={() => run(() => saveContract(quoteId, vars, plan), "Cambios guardados.")}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
          <button
            onClick={verVistaPrevia}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
          >
            Ver vista previa
          </button>
          <button
            onClick={() =>
              run(async () => {
                const s = await saveContract(quoteId, vars, plan);
                if (s.error) return s;
                const r = await sendContractLink(quoteId, { email: true });
                if (r.error) return r;
                setInfo(
                  r.emailEnviado
                    ? "Contrato aprobado y enviado al correo del viajero para su firma."
                    : `Contrato aprobado. El correo no salió (revisa el webhook n8n); envíale este link por WhatsApp: ${r.url}`,
                );
              })
            }
            disabled={pending}
            className="text-xs px-3.5 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50 font-medium"
          >
            {contract!.status === "enviado" ? "Reenviar para firma" : "Aprobar y enviar para firma"}
          </button>
          {contract!.status === "enviado" && (
            <>
              <button
                onClick={() =>
                  run(async () => {
                    const r = await sendContractLink(quoteId, { email: false });
                    if (r.error) return r;
                    if (r.url) {
                      await navigator.clipboard.writeText(r.url).catch(() => {});
                      setInfo(`Link copiado al portapapeles: ${r.url}`);
                    }
                  })
                }
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
              >
                Copiar link
              </button>
              <button
                onClick={() => run(() => revokeContractLink(quoteId), "Link anulado; el contrato volvió a revisión.")}
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50 transition disabled:opacity-50"
              >
                Anular link
              </button>
            </>
          )}
          <button
            onClick={() =>
              run(async () => {
                const r = await refreshContractVariables(quoteId);
                if (r.error) return { error: r.error };
                if (r.variables) setVars(r.variables);
              }, "Variables recargadas desde la cotización (recuerda guardar).")
            }
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50 ml-auto"
          >
            Recargar desde cotización
          </button>
        </div>
      )}

      {existe && contract!.status === "enviado" && contract!.token && (
        <div className="px-5 pb-3 text-[11px] text-muted">
          Link activo hasta{" "}
          {contract!.token_expires_at ? new Date(contract!.token_expires_at).toLocaleDateString("es-CO") : "—"} ·{" "}
          <span className="font-mono">/contrato/{contract!.token.slice(0, 8)}…</span>
        </div>
      )}

      {info && <div className="px-5 py-2 text-sm text-bosque bg-taupe/30 border-t border-border break-all">{info}</div>}
      {error && <div className="px-5 py-2 text-sm text-red-700 bg-red-50 border-t border-red-200">{error}</div>}
    </section>
  );
}
