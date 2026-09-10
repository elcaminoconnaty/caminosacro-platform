"use client";

// Card "Contratos de servicios" en Seguimiento.
//
// Una cotización de N personas tiene N viajeros y N contratos personalizados: cada
// uno recibe su propio enlace, firma con su nombre y sube su pasaporte. Por eso la
// tarjeta tiene tres bloques:
//
//   1. Viajeros          — nombres, correos y pasaportes (se editan una vez)
//   2. Datos del viaje   — comunes a todos los contratos (se editan una vez)
//   3. Contratos         — una fila por viajero, con sus acciones y las masivas
//
// MODALIDAD EMPRESA (migración 0036). Si la cotización tiene empresa contratante, el
// bloque 3 se convierte en UNA sola fila: el contrato de la empresa, que firma su
// representante legal y que lleva la relación de viajeros como Anexo No. 2. Los bloques 1
// y 2 no cambian — salvo que ahí los pasaportes los carga el equipo, porque en esa
// modalidad nadie firma individualmente.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSignedUrl } from "./actions";
import {
  refreshContractVariables,
  saveContract,
  saveTravelers,
  seedTravelersFromQuote,
  createContractForTraveler,
  createAllContracts,
  createCompanyContract,
  refreshCompanyTravelers,
  applySharedToAll,
  generateContractPdf,
  sendContractLink,
  sendAllContractLinks,
  revokeContractLink,
  subirPasaporteViajero,
  quitarPasaporteViajero,
  enviarFichaViajero,
  enviarFichasATodos,
  setOrgSignerForQuote,
  type ContractRow,
  type TravelerRow,
} from "./contractActions";
import {
  buildCronograma,
  VARIABLE_LABELS,
  type ContractVariables,
  type PaymentPlan,
  type Cuota,
  type Firmante,
} from "@/lib/contracts/template";

// Igual que MAX_RECORDATORIOS en /api/cron/recordatorios-contrato: solo para el rótulo.
const MAX_RECORDATORIOS = 5;

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  borrador: { label: "En revisión", cls: "bg-taupe/60 text-fg" },
  enviado: { label: "Esperando firma", cls: "bg-amber-100 text-amber-800" },
  firmado: { label: "Firmado", cls: "bg-bosque text-white" },
  anulado: { label: "Anulado", cls: "bg-red-100 text-red-700" },
};

/** "Recordatorio 2 de 5 · último el 14 de agosto", o null si aún no se ha enviado ninguno. */
function rotuloRecordatorios(c: ContractRow | undefined): string | null {
  if (c?.status !== "enviado" || !c.reminder_count) return null;
  const fecha = c.last_reminder_at
    ? new Date(c.last_reminder_at).toLocaleDateString("es-CO", { day: "numeric", month: "long" })
    : null;
  const tope = c.reminder_count >= MAX_RECORDATORIOS ? " · conviene llamarlo" : "";
  return `Recordatorio ${c.reminder_count}/${MAX_RECORDATORIOS}${fecha ? ` · ${fecha}` : ""}${tope}`;
}

// Los datos del firmante ya no viven acá: son por viajero (bloque 1) y cada uno los
// confirma al firmar. Acá solo quedan los campos comunes a todos los contratos.
const GRUPOS: { titulo: string; campos: (keyof ContractVariables)[] }[] = [
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

type FilaViajero = {
  id: string | null;
  full_name: string;
  email: string;
  document_number: string;
};

/** En qué va la ficha de un viajero: sin enviar, enviada sin responder, o completa. */
function estadoFicha(t: TravelerRow): { label: string; cls: string; title: string } {
  if (t.ficha_completed_at) {
    const cuando = new Date(t.ficha_completed_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    return { label: "Ficha ✓", cls: "bg-bosque text-white", title: `Completó su ficha el ${cuando}` };
  }
  if (t.ficha_sent_at) {
    const cuando = new Date(t.ficha_sent_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    return { label: "Ficha enviada", cls: "bg-amber-100 text-amber-800", title: `Se le envió el ${cuando} y no ha respondido` };
  }
  return { label: "Sin ficha", cls: "bg-taupe/60 text-fg", title: "Todavía no se le ha enviado la ficha" };
}

/** Sube el pasaporte de un viajero desde el CRM (input de archivo por fila). */
function BotonPasaporte({
  travelerId,
  cargado,
  disabled,
  onSubir,
  onQuitar,
  onVer,
  onDescargar,
}: {
  travelerId: string;
  cargado: boolean;
  disabled: boolean;
  onSubir: (id: string, archivo: File) => void;
  onQuitar: (id: string) => void;
  onVer: (id: string) => void;
  onDescargar: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {cargado ? (
        <>
          <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider bg-bosque text-white">
            Pasaporte ✓
          </span>
          <button
            type="button"
            onClick={() => onVer(travelerId)}
            disabled={disabled}
            className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-taupe/40 disabled:opacity-50"
            title="Abrir la foto del pasaporte en otra pestaña"
          >
            Ver
          </button>
          <button
            type="button"
            onClick={() => onDescargar(travelerId)}
            disabled={disabled}
            className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-taupe/40 disabled:opacity-50"
            title="Descargar la foto del pasaporte"
          >
            Descargar
          </button>
          <button
            type="button"
            onClick={() => onQuitar(travelerId)}
            disabled={disabled}
            className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:bg-taupe/40 disabled:opacity-50"
            title="Quitar el pasaporte de este viajero"
          >
            ×
          </button>
        </>
      ) : (
        <label className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider bg-dorado/30 text-dorado-oscuro cursor-pointer hover:bg-dorado/50">
          Subir pasaporte
          <input
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSubir(travelerId, f);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

export default function ContractCard({
  quoteId,
  quoteCode,
  people,
  travelers,
  contracts,
  sharedVariables,
  totalEur,
  companyName = null,
  firmantes = [],
}: {
  quoteId: string;
  quoteCode: string;
  people: number;
  travelers: TravelerRow[];
  contracts: ContractRow[];
  sharedVariables: ContractVariables | null;
  totalEur: number;
  /** Razón social si la cotización tiene empresa contratante. Null = modalidad de siempre. */
  companyName?: string | null;
  /** Quiénes pueden firmar por Camino Sacro (settings.firmantes). */
  firmantes?: Firmante[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [openDatos, setOpenDatos] = useState(contracts.length === 0);
  // Quién firma por Camino Sacro. Sale del primer contrato existente; si no hay ninguno,
  // del primero de la lista de firmantes (Nico).
  const [firmanteActual, setFirmanteActual] = useState<string>(
    contracts[0]?.org_signer || firmantes[0]?.slug || "nico",
  );

  // Las variables compartidas salen del primer contrato existente (ya revisado por
  // el equipo) y, si aún no hay ninguno, de la precarga de la cotización.
  const [vars, setVars] = useState<ContractVariables | null>(
    (contracts[0]?.variables_json as ContractVariables) ?? sharedVariables ?? null,
  );
  const [plan, setPlan] = useState<PaymentPlan>(
    (contracts[0]?.payment_plan_json as PaymentPlan) ?? { type: "contado" },
  );
  const [numCuotas, setNumCuotas] = useState<number>(
    contracts[0]?.payment_plan_json?.type === "financiado" ? contracts[0].payment_plan_json.cuotas.length : 3,
  );

  const [filas, setFilas] = useState<FilaViajero[]>(
    travelers.map((t) => ({
      id: t.id,
      full_name: t.full_name,
      email: t.email ?? "",
      document_number: t.document_number ?? "",
    })),
  );

  // Modo prueba: desvía TODOS los correos a una sola dirección, sin tocar los
  // destinatarios reales. Es lo que permite ensayar un grupo de 20 sin escribirle
  // a nadie de verdad.
  const [modoPrueba, setModoPrueba] = useState(false);
  const [emailPrueba, setEmailPrueba] = useState("");
  const pruebaEmail = modoPrueba ? emailPrueba.trim() || null : null;

  const porViajero = useMemo(() => {
    const m = new Map<string, ContractRow>();
    // El contrato de empresa no cuelga de ningún viajero: su `traveler_id` es nulo.
    for (const c of contracts) if (c.traveler_id) m.set(c.traveler_id, c);
    return m;
  }, [contracts]);

  // Modalidad: la marca la cotización (tiene empresa) o un contrato de empresa ya creado.
  const contratoEmpresa = contracts.find((c) => c.kind === "empresa") ?? null;
  const modoEmpresa = !!companyName || !!contratoEmpresa;

  const firmados = contracts.filter((c) => c.status === "firmado").length;
  const sinContrato = travelers.filter((t) => !porViajero.has(t.id)).length;
  const conPasaporte = travelers.filter((t) => t.passport_path).length;
  const fichasCompletas = travelers.filter((t) => t.ficha_completed_at).length;
  const fichasPendientes = travelers.length - fichasCompletas;

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

  // Abre el archivo en otra pestaña. Con `descargarComo` el navegador lo baja con ese
  // nombre en vez de mostrarlo (Supabase manda el Content-Disposition de descarga).
  async function abrirArchivo(path: string | null, descargarComo?: string) {
    if (!path) return;
    setError(null);
    startTransition(async () => {
      const r = await getSignedUrl(path, descargarComo ? { download: descargarComo } : undefined);
      if (r.url) window.open(r.url, "_blank");
      else if (r.error) setError(r.error);
    });
  }

  /** Nombre con el que se baja el pasaporte de un viajero: conserva la extensión del archivo. */
  function nombrePasaporte(t: TravelerRow, path: string | null) {
    const ext = (path?.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();
    const nombre = (t.full_name || `viajero-${t.position}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `Pasaporte-${quoteCode}-${t.position}-${nombre}.${ext}`;
  }
  const pasaportesCargados = travelers.filter((t) => !!t.passport_path).length;

  // Guarda + genera + abre el PDF en una sola acción. Abrimos la pestaña en blanco
  // de inmediato (gesto del usuario) y luego le fijamos la URL, para que el
  // navegador no bloquee el pop-up tras el await.
  function verVistaPrevia(c: ContractRow) {
    setError(null);
    setInfo(null);
    const win = window.open("", "_blank");
    startTransition(async () => {
      const g = await generateContractPdf(c.id);
      if (g.error || !g.url) {
        win?.close();
        setError(g.error ?? "No se pudo generar la vista previa.");
        return;
      }
      if (win) win.location.href = g.url;
      else window.open(g.url, "_blank");
      router.refresh();
    });
  }

  function setVar(k: keyof ContractVariables, v: string) {
    setVars((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  function generarCuotas() {
    if (!vars) return;
    setPlan((prev) => ({
      type: "financiado",
      cuotas: buildCronograma(totalEur, numCuotas, vars.fecha_inicio || null),
      // Regenerar el cronograma no puede volver a meter el pagaré por la puerta de atrás:
      // si se había quitado, sigue quitado.
      con_pagare: prev.type === "financiado" ? prev.con_pagare : undefined,
    }));
  }

  function setCuota(i: number, patch: Partial<Cuota>) {
    setPlan((prev) => {
      if (prev.type !== "financiado") return prev;
      return { ...prev, cuotas: prev.cuotas.map((c, j) => (j === i ? { ...c, ...patch } : c)) };
    });
  }

  function setConPagare(valor: boolean) {
    setPlan((prev) => (prev.type === "financiado" ? { ...prev, con_pagare: valor } : prev));
  }

  /**
   * La única fila del contrato de empresa. Mismas acciones que las de un viajero, pero el
   * destinatario es la empresa y no hay pasaporte que abrir: quien firma es el
   * representante legal.
   */
  function filaContratoEmpresa() {
    const c = contratoEmpresa;
    if (!c) return null;
    const chip = STATUS_CHIP[c.status];
    const recordatorios = rotuloRecordatorios(c);
    const v = c.variables_json as ContractVariables;
    const anexo = c.travelers_json?.length ?? 0;
    // Comparar solo la CANTIDAD no alcanza: renombrar a un viajero o cargarle el pasaporte
    // deja el anexo desactualizado sin cambiar cuántos son, y eso es justo lo que se
    // imprime en el contrato. La huella lleva EXACTAMENTE los campos que dibuja
    // `AnexoViajeros` — el tipo de documento incluido, que sale impreso junto al número
    // ("Pasaporte 123") y cambia solo cuando el viajero responde su ficha.
    type FilaAnexo = {
      position: number;
      nombre: string;
      documento_tipo: string;
      documento: string;
      autoriza_imagen: boolean | null;
    };
    const huella = (filas: FilaAnexo[]) =>
      filas
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((f) => `${f.position}|${f.nombre}|${f.documento_tipo}|${f.documento}|${f.autoriza_imagen}`)
        .join("~");
    const actual = huella(
      travelers.map((t) => ({
        position: t.position,
        nombre: t.full_name,
        documento_tipo: t.document_type ?? "Pasaporte",
        documento: t.document_number ?? "",
        autoriza_imagen: t.autoriza_imagen,
      })),
    );
    const congelado = huella(
      (c.travelers_json ?? []).map((t) => ({
        position: t.position,
        nombre: t.nombre,
        documento_tipo: t.documento_tipo || "Pasaporte",
        documento: t.documento,
        autoriza_imagen: t.autoriza_imagen,
      })),
    );
    const desfasado = actual !== congelado && c.status !== "firmado";
    return (
      <div className="py-2.5 flex flex-wrap items-center gap-2 border-b border-border">
        <div className="flex-1 min-w-[12rem]">
          <div className="text-sm font-medium">{v.empresa_razon_social || companyName || "Empresa"}</div>
          <div className="text-[11px] text-muted">
            {v.empresa_nit ? `NIT ${v.empresa_nit} · ` : ""}
            {v.empresa_email || <span className="text-amber-700">sin correo de notificaciones</span>}
            {v.rep_nombre ? ` · rep. ${v.rep_nombre}` : ""}
            {recordatorios ? ` · ${recordatorios}` : ""}
          </div>
          <div className={`text-[11px] ${desfasado ? "text-amber-700" : "text-muted"}`}>
            Anexo No. 2: {anexo} viajero(s)
            {desfasado
              ? anexo !== travelers.length
                ? ` — la lista tiene ${travelers.length}; actualiza el anexo antes de enviar`
                : " — los datos de la lista cambiaron; actualiza el anexo antes de enviar"
              : ""}
          </div>
        </div>

        <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${chip.cls}`}>{chip.label}</span>

        <div className="flex flex-wrap gap-1.5">
          {c.status === "firmado" ? (
            <>
              <button
                onClick={() => abrirArchivo(c.signed_pdf_path)}
                disabled={pending || !c.signed_pdf_path}
                className="text-xs px-2.5 py-1 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
                title="Abrir el contrato firmado en otra pestaña"
              >
                Ver contrato firmado
              </button>
              <button
                onClick={() => abrirArchivo(c.signed_pdf_path, `Contrato-${quoteCode}-empresa-firmado.pdf`)}
                disabled={pending || !c.signed_pdf_path}
                className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
                title="Descargar el PDF firmado"
              >
                Descargar
              </button>
              {c.doc_hash && (
                <a
                  href={`/verificar/${c.doc_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Comprobación pública de integridad: la misma que ve el cliente"
                  className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition"
                >
                  Verificar
                </a>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => verVistaPrevia(c)}
                disabled={pending}
                className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
              >
                Vista previa
              </button>
              <button
                onClick={() =>
                  run(async () => {
                    if (modoPrueba && !pruebaEmail) return { error: "Escribe el correo de prueba." };
                    const g = await saveContract(c.id, c.variables_json, plan);
                    if (g.error) return g;
                    const r = await sendContractLink(c.id, { email: true, pruebaEmail });
                    if (r.error && !r.url) return r;
                    setInfo(
                      r.emailEnviado
                        ? `Contrato enviado a ${pruebaEmail || v.empresa_email} para firma.`
                        : `El correo no salió (${r.error ?? "revisa el webhook n8n"}); envíale este link: ${r.url}`,
                    );
                  })
                }
                disabled={pending}
                className="text-xs px-2.5 py-1 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
              >
                {c.status === "enviado" ? "Reenviar" : "Enviar para firma"}
              </button>
              {c.status === "enviado" && (
                <>
                  <button
                    onClick={() =>
                      run(async () => {
                        const r = await sendContractLink(c.id, { email: false });
                        if (r.error) return r;
                        if (r.url) {
                          await navigator.clipboard.writeText(r.url).catch(() => {});
                          setInfo(`Link de firma copiado: ${r.url}`);
                        }
                      })
                    }
                    disabled={pending}
                    className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
                  >
                    Copiar link
                  </button>
                  <button
                    onClick={() => run(() => revokeContractLink(c.id), "Link anulado.")}
                    disabled={pending}
                    className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-700 hover:bg-red-50 transition disabled:opacity-50"
                  >
                    Anular
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  function subirPasaporte(travelerId: string, archivo: File) {
    const fd = new FormData();
    fd.set("pasaporte", archivo);
    run(() => subirPasaporteViajero(travelerId, fd), "Pasaporte cargado.");
  }

  function setFila(i: number, patch: Partial<FilaViajero>) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }

  if (!vars) {
    return (
      <section className="bg-bg-card border border-border rounded-xl px-5 py-4">
        <h2 className="font-display text-lg text-bosque">Contratos de servicios</h2>
        <p className="text-xs text-muted mt-0.5">
          No pude precargar los datos de esta cotización. Completa la ruta, el cliente y el valor, y vuelve a entrar.
        </p>
        {error && <div role="alert" className="text-sm text-red-800 mt-2">{error}</div>}
      </section>
    );
  }

  return (
    <section className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg text-bosque">
            {modoEmpresa ? "Contrato de empresa" : "Contratos de servicios"}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {modoEmpresa ? (
              <>
                Un solo contrato a nombre de {companyName || vars?.empresa_razon_social || "la empresa"}, firmado por su
                representante legal, con los {travelers.length} viajeros en el Anexo No. 2.{" "}
                {contratoEmpresa
                  ? contratoEmpresa.status === "firmado"
                    ? "Firmado."
                    : "Todavía sin firmar."
                  : "Todavía no está creado."}
              </>
            ) : (
              <>
                Un contrato por viajero: cada uno firma el suyo con su enlace y su pasaporte.{" "}
                {contracts.length > 0
                  ? `${firmados} de ${contracts.length} firmado(s)${sinContrato > 0 ? ` · ${sinContrato} viajero(s) sin contrato` : ""}.`
                  : "Todavía no hay contratos creados."}
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setOpenDatos((o) => !o)}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
        >
          {openDatos ? "Cerrar datos del viaje" : "Ver / editar datos del viaje"}
        </button>
      </div>

      {/* ---------- 1. Viajeros ---------- */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Viajeros ({filas.length} de {people} persona{people === 1 ? "" : "s"} cotizada{people === 1 ? "" : "s"})
          </h3>
          <div className="flex flex-wrap gap-2">
            {filas.length < people && (
              <button
                onClick={() => run(() => seedTravelersFromQuote(quoteId), `Se completaron las ${people} filas.`)}
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
              >
                Crear las {people} filas
              </button>
            )}
            <button
              onClick={() => setFilas((p) => [...p, { id: null, full_name: "", email: "", document_number: "" }])}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
            >
              + Agregar viajero
            </button>
            {pasaportesCargados > 0 && (
              <a
                href={`/api/descargas/pasaportes/${quoteId}`}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition"
                title="Baja en un solo .zip todos los pasaportes cargados de este grupo"
              >
                Descargar {pasaportesCargados === 1 ? "el pasaporte" : `los ${pasaportesCargados} pasaportes`} (.zip)
              </a>
            )}
            {travelers.length > 0 && fichasPendientes > 0 && (
              <button
                onClick={() =>
                  run(async () => {
                    if (modoPrueba && !pruebaEmail) return { error: "Escribe el correo de prueba." };
                    const r = await enviarFichasATodos(quoteId, { pruebaEmail });
                    if (r.error) return r;
                    setInfo(
                      `Ficha enviada a ${r.enviados} viajero(s)${pruebaEmail ? ` (prueba a ${pruebaEmail})` : ""}.` +
                        (r.fallos?.length ? ` No salieron: ${r.fallos.join(" · ")}` : ""),
                    );
                  })
                }
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded-md border border-bosque text-bosque hover:bg-bosque hover:text-white transition disabled:opacity-50"
                title="Le manda a cada viajero su enlace para completar pasaporte y autorizaciones"
              >
                Enviar la ficha a los {fichasPendientes} que faltan
              </button>
            )}
            <button
              onClick={() =>
                run(async () => {
                  const r = await saveTravelers(
                    quoteId,
                    filas.map((f) => ({
                      id: f.id,
                      full_name: f.full_name,
                      email: f.email || null,
                      document_number: f.document_number || null,
                    })),
                  );
                  if (r.error) return r;
                  if (r.aviso) setInfo(r.aviso);
                }, "Viajeros guardados.")
              }
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
            >
              Guardar viajeros
            </button>
          </div>
        </div>

        <p className="text-[11px] text-muted mb-2">
          {modoEmpresa ? (
            <>
              Estos son los viajeros del Anexo No. 2. Lo normal es <strong>mandarles la ficha</strong>: cada uno
              completa su pasaporte y sus autorizaciones desde su propio enlace, sin ver el contrato. También puedes
              cargar tú los pasaportes que te lleguen por correo. Fichas completas: {fichasCompletas} de{" "}
              {travelers.length} · pasaportes: {conPasaporte} de {travelers.length}.
            </>
          ) : (
            "El número de pasaporte lo escribe cada viajero al firmar; si ya lo tienes, puedes adelantarlo aquí. También puedes mandarle la ficha para que complete sus datos y autorizaciones."
          )}
        </p>

        <div className="space-y-1.5">
          {filas.map((f, i) => {
            const t = f.id ? travelers.find((x) => x.id === f.id) : null;
            const c = t ? porViajero.get(t.id) : undefined;
            return (
              <div key={f.id ?? `nueva-${i}`} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted w-6 tabular-nums">{i + 1}.</span>
                <input
                  value={f.full_name}
                  onChange={(e) => setFila(i, { full_name: e.target.value })}
                  placeholder="Nombre completo"
                  className="flex-1 min-w-[10rem] border border-border rounded-md px-2 py-1.5 text-sm bg-white"
                />
                <input
                  value={f.email}
                  onChange={(e) => setFila(i, { email: e.target.value })}
                  placeholder="correo@ejemplo.com"
                  type="email"
                  className="flex-1 min-w-[10rem] border border-border rounded-md px-2 py-1.5 text-sm bg-white"
                />
                <input
                  value={f.document_number}
                  onChange={(e) => setFila(i, { document_number: e.target.value })}
                  placeholder="Pasaporte"
                  className="w-32 border border-border rounded-md px-2 py-1.5 text-sm bg-white"
                />
                {t && (
                  <>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${estadoFicha(t).cls}`}
                      title={estadoFicha(t).title}
                    >
                      {estadoFicha(t).label}
                    </span>
                    <button
                      onClick={() =>
                        run(async () => {
                          if (modoPrueba && !pruebaEmail) return { error: "Escribe el correo de prueba." };
                          const r = await enviarFichaViajero(t.id, { pruebaEmail });
                          if (r.error && !r.url) return r;
                          setInfo(
                            r.emailEnviado
                              ? `Ficha enviada a ${pruebaEmail || t.email}.`
                              : `El correo no salió (${r.error ?? "revisa el webhook"}); envíale este link: ${r.url}`,
                          );
                        })
                      }
                      disabled={pending}
                      className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-taupe/40 transition disabled:opacity-50"
                      title="Enviarle (o reenviarle) su enlace de ficha"
                    >
                      {t.ficha_sent_at ? "Reenviar" : "Enviar ficha"}
                    </button>
                  </>
                )}
                {t && (
                  <BotonPasaporte
                    travelerId={t.id}
                    cargado={!!t.passport_path}
                    disabled={pending}
                    onSubir={subirPasaporte}
                    onQuitar={(id) => run(() => quitarPasaporteViajero(id), "Pasaporte quitado.")}
                    onVer={() => abrirArchivo(t.passport_path)}
                    onDescargar={() => abrirArchivo(t.passport_path, nombrePasaporte(t, t.passport_path))}
                  />
                )}
                {c ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${STATUS_CHIP[c.status].cls}`}>
                    {STATUS_CHIP[c.status].label}
                  </span>
                ) : (
                  <button
                    onClick={() => setFilas((p) => p.filter((_, j) => j !== i))}
                    className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-700 hover:bg-red-50 transition"
                    title="Quitar de la lista (se aplica al guardar)"
                  >
                    Quitar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- 2. Datos compartidos del viaje ---------- */}
      {openDatos && (
        <div className="px-5 py-4 space-y-5 border-b border-border">
          <p className="text-[11px] text-muted">
            Estos datos son idénticos en los {Math.max(filas.length, 1)} contratos. Los del firmante (nombre,
            pasaporte, dirección) salen de la lista de viajeros y de lo que cada uno confirma al firmar.
          </p>

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
                <input type="radio" checked={plan.type === "contado"} onChange={() => setPlan({ type: "contado" })} />
                100% al confirmar (por defecto)
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={plan.type === "financiado"} onChange={generarCuotas} />
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
                  La última cuota queda máximo 60 días antes del viaje (regla del contrato).
                </p>
                {/* El pagaré es una garantía de deuda: cuando el plan ya está pagado, pedirlo
                    sobra y es motivo para no firmar. Por eso se elige, no se da por hecho. */}
                <label className="flex items-start gap-2 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={plan.con_pagare !== false}
                    onChange={(e) => setConPagare(e.target.checked)}
                    className="mt-0.5 rounded border-border"
                  />
                  <span className="text-[11px] leading-relaxed">
                    <span className="text-fg font-medium">Incluir el pagaré en blanco y su carta de instrucciones</span>{" "}
                    (Anexo No. 2).
                    {plan.con_pagare === false ? (
                      <span className="text-muted">
                        {" "}Sin él, el contrato no lleva el Anexo No. 2 ni el parágrafo que lo respalda. Úsalo cuando el
                        plan ya esté pagado: el pagaré garantiza una deuda, y no hay deuda que garantizar.
                      </span>
                    ) : (
                      <span className="text-muted">
                        {" "}Garantiza las cuotas pendientes. Si el plan ya está cobrado, desmárcalo y vuelve a enviar el
                        contrato.
                      </span>
                    )}
                  </span>
                </label>
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

          {firmantes.length > 1 && (
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Firma por Camino Sacro
              </legend>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={firmanteActual}
                  onChange={(e) => {
                    const slug = e.target.value;
                    setFirmanteActual(slug);
                    run(async () => {
                      const r = await setOrgSignerForQuote(quoteId, slug);
                      if (r.error) return r;
                      if (r.actualizados) {
                        setInfo(
                          `Firmante cambiado en ${r.actualizados} contrato(s).` +
                            (r.omitidos ? ` ${r.omitidos} ya estaban firmados y no se tocaron.` : ""),
                        );
                      } else {
                        // Sin contratos todavía no hay nada que actualizar, pero la
                        // elección no se pierde: viaja a las acciones de creación.
                        setInfo(
                          `Firmará ${firmantes.find((f) => f.slug === slug)?.nombre ?? slug}. ` +
                            `Se aplicará a los contratos que crees.`,
                        );
                      }
                    });
                  }}
                  disabled={pending}
                  className="border border-border rounded-md px-2 py-1.5 text-sm bg-white disabled:opacity-50"
                >
                  {firmantes.map((f) => (
                    <option key={f.slug} value={f.slug}>
                      {f.nombre}
                      {f.data_url ? "" : " (sin firma capturada)"}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-muted">
                  Quien elijas queda como EL ORGANIZADOR en el contrato y es su firma la que sale en el PDF. Se aplica
                  a los contratos que aún no estén firmados y a los que crees después.
                </span>
              </div>
            </fieldset>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                run(async () => {
                  const r = await applySharedToAll(quoteId, vars, plan);
                  if (r.error) return r;
                  setInfo(
                    `Datos aplicados a ${r.actualizados} contrato(s).` +
                      (r.omitidos ? ` ${r.omitidos} ya estaban firmados y no se tocaron.` : ""),
                  );
                })
              }
              disabled={pending || contracts.length === 0}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
            >
              Aplicar a todos los contratos
            </button>
            <button
              onClick={() =>
                run(async () => {
                  const r = await refreshContractVariables(quoteId);
                  if (r.error) return { error: r.error };
                  if (r.variables) setVars(r.variables);
                }, "Datos recargados desde la cotización (recuerda aplicarlos).")
              }
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50 ml-auto"
            >
              Recargar desde cotización
            </button>
          </div>
        </div>
      )}

      {/* ---------- 3. Contratos ---------- */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {modoEmpresa ? "Contrato de la empresa" : "Contratos"}
          </h3>
          <div className="flex flex-wrap gap-2">
            {modoEmpresa && !contratoEmpresa && (
              <button
                onClick={() => run(() => createCompanyContract(quoteId, vars, plan, firmanteActual), "Contrato de empresa creado.")}
                disabled={pending || travelers.length === 0}
                className="text-xs px-3.5 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50 font-medium"
              >
                Crear el contrato de empresa
              </button>
            )}
            {modoEmpresa && contratoEmpresa && contratoEmpresa.status !== "firmado" && (
              <button
                onClick={() =>
                  run(async () => {
                    const r = await refreshCompanyTravelers(contratoEmpresa.id);
                    if (r.error) return r;
                    setInfo(`Anexo actualizado: ${r.viajeros} viajero(s).`);
                  })
                }
                disabled={pending}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
                title="Vuelve a copiar la lista de viajeros al Anexo No. 2 del contrato"
              >
                Actualizar la lista de viajeros del anexo
              </button>
            )}
            {!modoEmpresa && sinContrato > 0 && (
              <button
                onClick={() =>
                  run(async () => {
                    const r = await createAllContracts(quoteId, vars, plan, firmanteActual);
                    if (r.error) return r;
                    setInfo(`Listos ${r.creados} contrato(s), uno por viajero.`);
                  })
                }
                disabled={pending || travelers.length === 0}
                className="text-xs px-3.5 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50 font-medium"
              >
                Crear los {travelers.length} contratos
              </button>
            )}
            {!modoEmpresa && contracts.length > 0 && firmados < contracts.length && (
              <button
                onClick={() =>
                  run(async () => {
                    if (modoPrueba && !pruebaEmail) return { error: "Escribe el correo de prueba." };
                    const r = await sendAllContractLinks(quoteId, { pruebaEmail });
                    if (r.error) return r;
                    setInfo(
                      `Enviados ${r.enviados} contrato(s)${pruebaEmail ? ` a ${pruebaEmail} (prueba)` : ""}.` +
                        (r.fallos?.length ? ` No salieron: ${r.fallos.join(" · ")}` : ""),
                    );
                  })
                }
                disabled={pending}
                className="text-xs px-3.5 py-1.5 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50 font-medium"
              >
                Enviar todos para firma
              </button>
            )}
          </div>
        </div>

        {/* Modo prueba */}
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs bg-taupe/30 border border-border rounded-lg px-3 py-2">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={modoPrueba}
              onChange={(e) => setModoPrueba(e.target.checked)}
              className="rounded border-border"
            />
            <span>Enviar como prueba a…</span>
          </label>
          <input
            value={emailPrueba}
            onChange={(e) => setEmailPrueba(e.target.value)}
            disabled={!modoPrueba}
            placeholder="tucorreo@gmail.com"
            type="email"
            className="border border-border rounded-md px-2 py-1 bg-white disabled:opacity-40 min-w-[14rem]"
          />
          {modoPrueba && (
            <span className="text-muted">
              Los correos van a esta dirección en vez de{modoEmpresa ? " a la empresa" : " a los viajeros"}. No entra al
              ciclo de recordatorios.
            </span>
          )}
        </div>

        {travelers.length === 0 && (
          <p className="text-sm text-muted">
            {modoEmpresa
              ? "Carga primero los viajeros: son el Anexo No. 2 del contrato de empresa."
              : "Carga primero los viajeros para poder generar sus contratos."}
          </p>
        )}

        {modoEmpresa && contratoEmpresa && filaContratoEmpresa()}

        {!modoEmpresa && (
        <div className="divide-y divide-border">
          {travelers.map((t) => {
            const c = porViajero.get(t.id);
            const chip = STATUS_CHIP[c?.status ?? "borrador"];
            const recordatorios = rotuloRecordatorios(c);
            return (
              <div key={t.id} className="py-2.5 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[12rem]">
                  <div className="text-sm font-medium">
                    {t.position}. {t.full_name}
                  </div>
                  <div className="text-[11px] text-muted">
                    {t.email || <span className="text-amber-700">sin correo</span>}
                    {t.document_number ? ` · ${t.document_number}` : ""}
                    {recordatorios ? ` · ${recordatorios}` : ""}
                  </div>
                </div>

                {c ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${chip.cls}`}>{chip.label}</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider bg-dorado/30 text-dorado-oscuro">
                    Sin contrato
                  </span>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {!c && (
                    <button
                      onClick={() => run(() => createContractForTraveler(quoteId, t.id, vars, plan, firmanteActual), "Contrato creado.")}
                      disabled={pending}
                      className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
                    >
                      Crear
                    </button>
                  )}

                  {c && c.status === "firmado" && (
                    <>
                      <button
                        onClick={() => abrirArchivo(c.signed_pdf_path)}
                        disabled={pending || !c.signed_pdf_path}
                        className="text-xs px-2.5 py-1 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
                        title="Abrir el contrato firmado en otra pestaña"
                      >
                        Ver contrato
                      </button>
                      <button
                        onClick={() => abrirArchivo(c.signed_pdf_path, `Contrato-${quoteCode}-${t.position}-firmado.pdf`)}
                        disabled={pending || !c.signed_pdf_path}
                        className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
                        title="Descargar el PDF firmado"
                      >
                        Descargar contrato
                      </button>
                      {c.passport_path ? (
                        <>
                          <button
                            onClick={() => abrirArchivo(c.passport_path)}
                            disabled={pending}
                            className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
                            title="Abrir la foto del pasaporte en otra pestaña"
                          >
                            Ver pasaporte
                          </button>
                          <button
                            onClick={() => abrirArchivo(c.passport_path, nombrePasaporte(t, c.passport_path))}
                            disabled={pending}
                            className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
                            title="Descargar la foto del pasaporte"
                          >
                            Descargar pasaporte
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider bg-taupe/60 text-fg">
                          Sin pasaporte
                        </span>
                      )}
                      {c.doc_hash && (
                        <a
                          href={`/verificar/${c.doc_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Comprobación pública de integridad: la misma que ve el cliente"
                          className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition"
                        >
                          Verificar
                        </a>
                      )}
                    </>
                  )}

                  {c && c.status !== "firmado" && (
                    <>
                      <button
                        onClick={() => verVistaPrevia(c)}
                        disabled={pending}
                        className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
                      >
                        Vista previa
                      </button>
                      <button
                        onClick={() =>
                          run(async () => {
                            if (modoPrueba && !pruebaEmail) return { error: "Escribe el correo de prueba." };
                            const s = await saveContract(c.id, c.variables_json, plan);
                            if (s.error) return s;
                            const r = await sendContractLink(c.id, { email: true, pruebaEmail });
                            // Con `url` el enlace de firma SÍ quedó creado: entonces el error
                            // es solo del correo y hay que enseñar el motivo Y el link, no
                            // tragarse el link mostrando el error a secas.
                            if (r.error && !r.url) return r;
                            setInfo(
                              r.emailEnviado
                                ? `Contrato enviado a ${pruebaEmail || t.email} para firma.`
                                : `El correo no salió (${r.error ?? "revisa el webhook n8n"}); envíale este link: ${r.url}`,
                            );
                          })
                        }
                        disabled={pending}
                        className="text-xs px-2.5 py-1 rounded-md bg-bosque text-white hover:bg-bosque-medio transition disabled:opacity-50"
                      >
                        {c.status === "enviado" ? "Reenviar" : "Enviar para firma"}
                      </button>
                      {c.status === "enviado" && (
                        <>
                          <button
                            onClick={() =>
                              run(async () => {
                                const r = await sendContractLink(c.id, { email: false });
                                if (r.error) return r;
                                if (r.url) {
                                  await navigator.clipboard.writeText(r.url).catch(() => {});
                                  setInfo(`Link de ${t.full_name} copiado: ${r.url}`);
                                }
                              })
                            }
                            disabled={pending}
                            className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-taupe/40 transition disabled:opacity-50"
                          >
                            Copiar link
                          </button>
                          <button
                            onClick={() => run(() => revokeContractLink(c.id), "Link anulado.")}
                            disabled={pending}
                            className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-700 hover:bg-red-50 transition disabled:opacity-50"
                          >
                            Anular
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}

        <p className="text-[11px] text-muted mt-3">
          Expediente {quoteCode}.{" "}
          {modoEmpresa
            ? "Los pasaportes que cargues arriba son los que después se le adjuntan a Pilgrim."
            : "Los pasaportes que suban al firmar son los que después se le adjuntan a Pilgrim."}
        </p>
      </div>

      {info && <div className="px-5 py-2 text-sm text-bosque bg-taupe/30 border-t border-border break-all">{info}</div>}
      {error && <div role="alert" className="px-5 py-2 text-sm text-red-800 bg-red-50 border-t border-red-200">{error}</div>}
    </section>
  );
}
