"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createCommercialClient } from "@/lib/supabase/server";

const str = (v: FormDataEntryValue | null) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const num = (v: FormDataEntryValue | null) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export type ClientLite = { id: string; full_name: string; phone: string | null; email: string | null };

export async function findClientByPhone(phone: string): Promise<ClientLite | null> {
  if (!phone || phone.trim().length < 4) return null;
  const supabase = await createCommercialClient();
  const { data } = await supabase
    .from("clients")
    .select("id,full_name,phone,email")
    .eq("phone", phone.trim())
    .maybeSingle();
  return data;
}

export async function createQuote(formData: FormData) {
  const supabase = await createCommercialClient();

  const fullName = str(formData.get("client_name"));
  const phone = str(formData.get("client_phone"));
  const email = str(formData.get("client_email"));

  // Cliente: dedup por teléfono
  let clientId: string | null = null;
  if (phone) {
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (existing) {
      clientId = existing.id;
      // Actualizar campos no vacíos
      const patch: Record<string, string> = {};
      if (fullName) patch.full_name = fullName;
      if (email) patch.email = email;
      if (Object.keys(patch).length) {
        await supabase.from("clients").update(patch).eq("id", existing.id);
      }
    } else if (fullName) {
      const { data: created } = await supabase
        .from("clients")
        .insert({ full_name: fullName, phone, email })
        .select("id")
        .single();
      clientId = created?.id ?? null;
    }
  }

  // Código auto
  const { data: code, error: codeErr } = await supabase.rpc("next_quote_code");
  if (codeErr) return { error: codeErr.message };

  // Validez por defecto: 30 días desde hoy
  const validUntil = str(formData.get("valid_until")) ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const baseEur = num(formData.get("total_eur")) ?? 0; // En el wizard, "Total €" = base ruta + aloj
  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({
      code,
      client_id: clientId,
      client_name: fullName,
      client_phone: phone,
      client_email: email,
      route_name: str(formData.get("route_name")),
      start_date: str(formData.get("start_date")),
      end_date: str(formData.get("end_date")),
      valid_until: validUntil,
      people: num(formData.get("people")) ?? 1,
      modality: str(formData.get("modality")),
      base_eur: baseEur,
      total_eur: baseEur, // sin opcionales aún → total = base
      cost_eur: num(formData.get("cost_eur")) ?? 0,
      status: str(formData.get("status")) || "borrador",
      notes: str(formData.get("notes")),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/seguimiento");
  revalidatePath("/cotizaciones");
  redirect(`/seguimiento/${quote.id}`);
}
