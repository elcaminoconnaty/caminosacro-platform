import "server-only";

// Empresa contratante de una cotización (migración 0036).
//
// Una empresa vuelve cada año — el programa de bienestar es anual — así que vive en su
// propia tabla y se deduplica por NIT, igual que `clients` se deduplica por teléfono.
// `quotes.company_id` es lo único que marca la modalidad: donde hay empresa, el contrato
// es uno solo a su nombre en vez de uno por viajero.

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type CompanyInput = {
  legal_name: string;
  nit: string;
  address?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  rep_name?: string | null;
  rep_document_type?: string | null;
  rep_document_number?: string | null;
};

export type CompanyRow = CompanyInput & { id: string };

/** El NIT es la llave: se compara sin puntos, guiones ni espacios. */
export function normalizaNit(nit: string): string {
  return (nit || "").replace(/[\s.\-]/g, "").toUpperCase();
}

/**
 * Crea o actualiza la empresa y devuelve su id. Deduplica por NIT normalizado.
 *
 * Devuelve `null` sin tocar nada cuando no llegan los dos datos mínimos (razón social y
 * NIT): una empresa a medias en el contrato es peor que ninguna.
 *
 * `formularioPrecargado` dice si quien llama le mostró al usuario los datos que ya tenía la
 * empresa. Solo entonces una casilla vacía significa «bórralo». Desde el asistente de
 * cotización nueva, que no precarga nada, vacío significa «no lo escribí»: la cotización
 * del año siguiente para el mismo NIT llegaba con la razón social y el NIT a secas y le
 * borraba a la empresa el representante legal, la dirección y el correo — y después
 * `createCompanyContract` se negaba por «faltan datos» sin que se entendiera por qué.
 */
export async function upsertCompany(
  supabase: AnyClient,
  datos: CompanyInput,
  { formularioPrecargado = false }: { formularioPrecargado?: boolean } = {},
): Promise<{ id: string } | { error: string } | null> {
  const legalName = (datos.legal_name || "").trim();
  const nit = (datos.nit || "").trim();
  if (!legalName && !nit) return null;
  if (!legalName || !nit) {
    return { error: "Para el contrato de empresa hacen falta la razón social y el NIT." };
  }

  const patch = {
    legal_name: legalName,
    nit,
    address: datos.address?.trim() || null,
    city: datos.city?.trim() || null,
    email: datos.email?.trim() || null,
    phone: datos.phone?.trim() || null,
    rep_name: datos.rep_name?.trim() || null,
    rep_document_type: datos.rep_document_type?.trim() || "Cédula de ciudadanía",
    rep_document_number: datos.rep_document_number?.trim() || null,
  };

  // Se busca por NIT normalizado para que "900.123.456-7" y "9001234567" sean la misma
  // empresa. El de la fila se conserva tal como lo escribieron: es el que sale impreso.
  const { data: existentes } = await supabase.from("companies").select("id,nit");
  const objetivo = normalizaNit(nit);
  const ya = (existentes || []).find((c: { id: string; nit: string }) => normalizaNit(c.nit) === objetivo);

  if (ya) {
    const cambios = formularioPrecargado
      ? patch
      : Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null && v !== ""));
    const { error } = await supabase.from("companies").update(cambios).eq("id", ya.id);
    if (error) return { error: error.message };
    return { id: ya.id as string };
  }

  const { data, error } = await supabase.from("companies").insert(patch).select("id").maybeSingle();
  if (error || !data) return { error: error?.message ?? "No se pudo guardar la empresa." };
  return { id: data.id as string };
}

/** Lee de un FormData los campos de empresa del editor y del asistente. */
export function companyDeFormData(formData: FormData): CompanyInput {
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  return {
    legal_name: s("company_legal_name"),
    nit: s("company_nit"),
    address: s("company_address"),
    city: s("company_city"),
    email: s("company_email"),
    phone: s("company_phone"),
    rep_name: s("company_rep_name"),
    rep_document_type: s("company_rep_document_type"),
    rep_document_number: s("company_rep_document_number"),
  };
}
