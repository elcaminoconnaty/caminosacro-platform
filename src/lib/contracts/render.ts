// Utilidades de servidor para el contrato: variables por defecto desde la
// cotización, render del PDF (con o sin firma) y hash de integridad.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ContractVariables,
  type PaymentPlan,
  DEFAULT_INCLUYE,
  DEFAULT_NO_INCLUYE,
} from "./template";
import type { ContractSignature } from "./contractPdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

const fmtEntero = (n: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n);

/** Datos del viajero que personalizan SU contrato. El resto de variables (el viaje,
 *  los valores, los anexos) son comunes a todos los contratos de la cotización. */
export type TravelerSeed = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  document_type?: string | null;
  document_number?: string | null;
};

/**
 * Variables por defecto del contrato a partir de la cotización + cliente + catálogo.
 *
 * Con `traveler`, los campos del firmante se toman de ese viajero en vez del titular
 * de la cotización: es lo que hace que los 20 contratos de un grupo salgan
 * personalizados, cada uno a nombre de quien lo firma.
 */
export async function buildDefaultVariables(
  supabase: AnyClient,
  quoteId: string,
  traveler?: TravelerSeed | null,
): Promise<
  { ok: true; variables: ContractVariables; totalEur: number; startDate: string | null; clientId: string | null }
  | { ok: false; error: string }
> {
  const { data: quote } = await supabase
    .from("quotes")
    .select("id,code,client_id,client_name,client_phone,client_email,route_name,start_date,end_date,people,modality,total_eur,valid_until,created_at,rooms_json")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { ok: false, error: "Cotización no encontrada" };

  const [{ data: route }, { data: client }, { data: optLines }, trmRow] = await Promise.all([
    quote.route_name
      ? supabase.from("routes").select("origin,destination").eq("name", quote.route_name).maybeSingle()
      : Promise.resolve({ data: null }),
    quote.client_id
      ? supabase.from("clients").select("document_type,document_number,address").eq("id", quote.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("quote_lines").select("description").eq("quote_id", quoteId).eq("type", "optional"),
    // TRM del día para el referencial COP; si falla, se deja "—" y se edita a mano.
    (async () => {
      try {
        const { getTRMHoy } = await import("@/lib/trm");
        return await getTRMHoy(supabase);
      } catch {
        return null;
      }
    })(),
  ]);

  const total = Number(quote.total_eur) || 0;
  const trm = Number(trmRow?.eur_cop) || 0;
  const totalCop = trm > 0 ? Math.round(total * trm) : null;

  // Acomodación legible desde rooms_json si existe (grupos impares).
  let habitaciones = "";
  const rooms = quote.rooms_json as { dobles?: number; individuales?: number } | null;
  if (rooms && (rooms.dobles || rooms.individuales)) {
    const parts: string[] = [];
    if (rooms.dobles) parts.push(`${rooms.dobles} habitación(es) doble(s)`);
    if (rooms.individuales) parts.push(`${rooms.individuales} individual(es)`);
    habitaciones = parts.join(" + ");
  } else if (quote.modality) {
    habitaciones = String(quote.modality);
  }

  // Validez en días: diferencia entre creación y valid_until (por defecto 30).
  let validezDias = 30;
  if (quote.valid_until && quote.created_at) {
    const ms = new Date(String(quote.valid_until)).getTime() - new Date(String(quote.created_at)).getTime();
    const d = Math.round(ms / 86400000);
    if (d > 0 && d <= 365) validezDias = d;
  }

  const opcionales = (optLines || [])
    .map((l: { description: string | null }) => l.description)
    .filter(Boolean)
    .join("; ");

  const variables: ContractVariables = {
    codigo_cotizacion: String(quote.code || ""),
    // El viajero manda sobre el titular de la cotización cuando viene dado.
    viajero_nombre: String(traveler?.full_name || quote.client_name || ""),
    viajero_tipo_documento: String(traveler?.document_type || client?.document_type || "Pasaporte"),
    viajero_documento: String(traveler?.document_number || client?.document_number || ""),
    viajero_email: String(traveler?.email || quote.client_email || ""),
    viajero_telefono: String(traveler?.phone || quote.client_phone || ""),
    // La dirección solo se hereda del cliente para el titular: la de un acompañante
    // sería inventada, y el viajero la corrige al firmar.
    viajero_direccion: String(traveler ? "" : client?.address || ""),
    ruta_nombre: String(quote.route_name || ""),
    origen: String(route?.origin || ""),
    destino: String(route?.destination || "Santiago de Compostela"),
    fecha_inicio: String(quote.start_date || ""),
    fecha_fin: String(quote.end_date || ""),
    num_personas: String(quote.people || 1),
    modalidad: String(quote.modality || ""),
    habitaciones,
    valor_total_eur: fmtEntero(total),
    valor_total_cop: totalCop != null ? fmtEntero(totalCop) : "—",
    trm: trm > 0 ? fmtEntero(trm) : "—",
    moneda: "EUR",
    fecha_cotizacion: quote.created_at ? String(quote.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    validez: String(validezDias),
    incluye: DEFAULT_INCLUYE,
    no_incluye: DEFAULT_NO_INCLUYE,
    opcionales: opcionales || "ninguno",
    autoriza_imagen: "sí",
  };

  return { ok: true, variables, totalEur: total, startDate: quote.start_date ? String(quote.start_date) : null, clientId: quote.client_id ?? null };
}

/** Renderiza el PDF del contrato (sin firmar o firmado) y devuelve el buffer. */
export async function renderContractPdfBuffer(
  variables: ContractVariables,
  plan: PaymentPlan,
  signature?: ContractSignature | null,
  orgSignature?: string | null,
): Promise<Buffer> {
  const React = await import("react");
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ContractPDF } = await import("./contractPdf");
  const element = React.createElement(ContractPDF as never, {
    variables,
    plan,
    signature: signature ?? null,
    orgSignature: orgSignature ?? null,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any);
}

/** Firma guardada del organizador (Nico), en comercial.settings. La captura una
 *  sola vez desde su celular y se reutiliza en todos los contratos. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgSignature(supabase: AnyClient): Promise<string | null> {
  const { data } = await supabase.from("settings").select("value").eq("key", "org_signature").maybeSingle();
  const v = data?.value as { data_url?: string } | null;
  return v?.data_url ?? null;
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function newContractToken(): string {
  return randomBytes(32).toString("hex");
}
