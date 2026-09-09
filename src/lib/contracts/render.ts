// Utilidades de servidor para el contrato: variables por defecto desde la
// cotización, render del PDF (con o sin firma) y hash de integridad.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ContractVariables,
  type PaymentPlan,
  type ViajeroAnexo,
  type Firmante,
  FIRMANTE_POR_DEFECTO,
  DEFAULT_INCLUYE,
  DEFAULT_NO_INCLUYE,
} from "./template";
import type { ContractSignature } from "./contractPdf";
import type { InformeFirmasProps } from "./informeFirmas";

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
  { ok: true; variables: ContractVariables; totalEur: number; startDate: string | null; clientId: string | null; companyId: string | null }
  | { ok: false; error: string }
> {
  const { data: quote } = await supabase
    .from("quotes")
    .select("id,code,client_id,company_id,client_name,client_phone,client_email,route_name,start_date,end_date,people,modality,total_eur,valid_until,created_at,rooms_json")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { ok: false, error: "Cotización no encontrada" };

  const [{ data: route }, { data: client }, { data: company }, { data: optLines }, trmRow] = await Promise.all([
    quote.route_name
      ? supabase.from("routes").select("origin,destination").eq("name", quote.route_name).maybeSingle()
      : Promise.resolve({ data: null }),
    quote.client_id
      ? supabase.from("clients").select("document_type,document_number,address").eq("id", quote.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // La empresa contratante, si la cotización la tiene. Su presencia ES la modalidad.
    quote.company_id
      ? supabase
          .from("companies")
          .select("legal_name,nit,address,city,email,phone,rep_name,rep_document_type,rep_document_number")
          .eq("id", quote.company_id)
          .maybeSingle()
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
    // Sin empresa NO se escribe ninguna de estas claves: `contratante_tipo` ausente es lo
    // que hace que el contrato salga exactamente igual que siempre.
    ...(company
      ? {
          contratante_tipo: "empresa" as const,
          empresa_razon_social: String(company.legal_name || ""),
          empresa_nit: String(company.nit || ""),
          empresa_direccion: String(company.address || ""),
          empresa_ciudad: String(company.city || ""),
          empresa_email: String(company.email || ""),
          empresa_telefono: String(company.phone || ""),
          rep_nombre: String(company.rep_name || ""),
          rep_tipo_documento: String(company.rep_document_type || "Cédula de ciudadanía"),
          rep_documento: String(company.rep_document_number || ""),
        }
      : {}),
  };

  return {
    ok: true,
    variables,
    totalEur: total,
    startDate: quote.start_date ? String(quote.start_date) : null,
    clientId: quote.client_id ?? null,
    companyId: quote.company_id ?? null,
  };
}

/**
 * Relación de viajeros para el Anexo No. 2 del contrato de empresa.
 *
 * Lo que devuelve se **congela** en `contracts.travelers_json` al crear el contrato: no se
 * vuelve a leer al renderizar. Un PDF firmado no puede cambiar de contenido después, y el
 * anexo es parte de lo que se firmó.
 */
export async function buildTravelersAnexo(supabase: AnyClient, quoteId: string): Promise<ViajeroAnexo[]> {
  const { data } = await supabase
    .from("quote_travelers")
    .select("position,full_name,document_type,document_number,autoriza_imagen")
    .eq("quote_id", quoteId)
    .order("position");
  return (data || []).map((t) => ({
    position: Number(t.position),
    nombre: String(t.full_name || ""),
    documento_tipo: String(t.document_type || "Pasaporte"),
    documento: String(t.document_number || ""),
    // null = no ha respondido su ficha. Se propaga tal cual y el anexo dice "pendiente":
    // afirmar que autoriza sin que nadie se lo haya preguntado no es consentimiento.
    autoriza_imagen: (t.autoriza_imagen as boolean | null) ?? null,
  }));
}

/**
 * Renderiza el PDF del contrato (sin firmar o firmado) y devuelve el buffer.
 *
 * `informe` es el Informe de Firmas que va como última página del PDF sellado; `numero` es
 * el identificador del documento para el pie de todas las páginas. Los dos van solo al
 * firmar: el PDF de vista previa sigue saliendo igual que siempre.
 */
export async function renderContractPdfBuffer(
  variables: ContractVariables,
  plan: PaymentPlan,
  signature?: ContractSignature | null,
  orgSignature?: string | null,
  travelers?: ViajeroAnexo[] | null,
  extras?: { informe?: InformeFirmasProps | null; numero?: string | null },
): Promise<Buffer> {
  const React = await import("react");
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { ContractPDF } = await import("./contractPdf");
  const element = React.createElement(ContractPDF as never, {
    variables,
    plan,
    signature: signature ?? null,
    orgSignature: orgSignature ?? null,
    travelers: travelers ?? [],
    informe: extras?.informe ?? null,
    numero: extras?.numero ?? null,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any);
}

/**
 * Cuenta las páginas del PDF leyendo su catálogo. Hace falta porque el Informe de Firmas
 * dice de cuántas páginas consta el documento y ese número tiene que salir del archivo
 * real, no de una estimación.
 */
export function contarPaginas(pdf: Buffer): number {
  const texto = pdf.toString("latin1");
  const paginas = (texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  return paginas || 1;
}

/**
 * Quiénes pueden firmar por Camino Sacro (`settings.firmantes`, migración 0037).
 * Cada uno captura su firma una sola vez en /configuracion y se reutiliza.
 */
export async function getFirmantes(supabase: AnyClient): Promise<Firmante[]> {
  const { data } = await supabase.from("settings").select("value").eq("key", "firmantes").maybeSingle();
  const lista = (data?.value as Firmante[] | null) ?? [];
  return lista.length > 0 ? lista : [{ ...FIRMANTE_POR_DEFECTO }];
}

export async function getFirmante(supabase: AnyClient, slug: string | null | undefined): Promise<Firmante> {
  const lista = await getFirmantes(supabase);
  return lista.find((f) => f.slug === (slug || FIRMANTE_POR_DEFECTO.slug)) ?? lista[0];
}

/**
 * Firma dibujada de quien firma ESTE contrato. Si todavía no la capturó, el PDF cae en la
 * firma mecánica en cursiva, que es igual de válida bajo la Ley 527.
 */
export async function getOrgSignature(supabase: AnyClient, slug?: string | null): Promise<string | null> {
  const f = await getFirmante(supabase, slug);
  if (f.data_url) return f.data_url;

  // El respaldo a `settings.org_signature` (la firma suelta de antes de la 0037) vale SOLO
  // para el firmante por defecto, que es de quien era esa firma. Aplicarlo a cualquiera
  // estampaba la firma de Nico bajo el nombre de Nathalia: un contrato firmado por alguien
  // que no lo firmó. Sin firma capturada se cae en la mecánica en cursiva, que lleva el
  // nombre correcto y es igual de válida bajo la Ley 527.
  if (f.slug !== FIRMANTE_POR_DEFECTO.slug) return null;
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
