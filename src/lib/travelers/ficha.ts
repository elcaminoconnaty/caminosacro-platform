import "server-only";

// Ficha del viajero: el enlace que recoge los datos de cada persona del grupo.
//
// Nació con el contrato de empresa. Ahí firma el representante legal y los viajeros nunca
// entran a ninguna pantalla, así que no había forma de pedirles su pasaporte ni sus
// autorizaciones — y el Anexo No. 2 salía con "pendiente" en todas las filas.
//
// La ficha NO muestra el contrato: eso lo firma la empresa. Solo recoge datos, y con
// trazabilidad, porque una autorización de tratamiento de datos sin registro de quién la
// dio y cuándo no prueba nada (Ley 1581 de 2012).

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/** Días que dura el enlace. Más largo que el del contrato (21) a propósito: acá no hay
 *  nada que se venza y un grupo grande responde con calma. */
export const FICHA_TTL_DAYS = 45;

export function newFichaToken(): string {
  return randomBytes(32).toString("hex");
}

export type FichaViajero = {
  id: string;
  quote_id: string;
  position: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  document_number: string | null;
  passport_path: string | null;
  birth_date: string | null;
  nationality: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  autoriza_imagen: boolean | null;
  marketing_optin: boolean | null;
  ficha_completed_at: string | null;
  token_expires_at: string | null;
};

/** Datos del viaje que la ficha le muestra al viajero para que sepa de qué va. */
export type ContextoFicha = {
  code: string;
  ruta: string | null;
  fecha_inicio: string | null;
  empresa: string | null;
};

/** ¿Sigue vivo el enlace? Se decide acá y no en el componente: en la página sería una
 *  llamada impura en pleno render (la misma regla que ya marca /contrato/[token]). */
export function fichaVencida(viajero: Pick<FichaViajero, "token_expires_at">): boolean {
  if (!viajero.token_expires_at) return false;
  return new Date(viajero.token_expires_at).getTime() < Date.now();
}

export async function leerFichaPorToken(
  supabase: AnyClient,
  token: string,
): Promise<{ viajero: FichaViajero; contexto: ContextoFicha; vencida: boolean } | null> {
  const { data: t } = await supabase
    .from("quote_travelers")
    .select(
      "id,quote_id,position,full_name,email,phone,document_number,passport_path,birth_date,nationality,emergency_name,emergency_phone,autoriza_imagen,marketing_optin,ficha_completed_at,token_expires_at",
    )
    .eq("token", token)
    .maybeSingle();
  if (!t) return null;

  const { data: q } = await supabase
    .from("quotes")
    .select("code,route_name,start_date,company_id")
    .eq("id", t.quote_id)
    .maybeSingle();

  let empresa: string | null = null;
  if (q?.company_id) {
    const { data: c } = await supabase.from("companies").select("legal_name").eq("id", q.company_id).maybeSingle();
    empresa = (c?.legal_name as string | null) ?? null;
  }

  return {
    viajero: t as FichaViajero,
    vencida: fichaVencida(t as FichaViajero),
    contexto: {
      code: String(q?.code ?? ""),
      ruta: (q?.route_name as string | null) ?? null,
      fecha_inicio: (q?.start_date as string | null) ?? null,
      empresa,
    },
  };
}
