"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCommercialClient } from "@/lib/supabase/server";
import {
  alternarBici,
  cambiarCantidadBici,
  crearHijaConBici,
  type SeleccionBici,
} from "@/lib/quotes/bikeQuote";

/**
 * Las acciones de la tarjeta de bicicletas. La lógica vive en `@/lib/quotes/bikeQuote`
 * para que el endpoint del agente haga exactamente lo mismo que estos botones; acá solo
 * queda lo que es de Next: el cliente con sesión, revalidar y redirigir.
 */

export type { SeleccionBici };

export async function toggleQuoteBike(quoteId: string, bikeId: string, on: boolean, qtyHint?: number | null) {
  const supabase = await createCommercialClient();
  const r = await alternarBici(supabase, quoteId, bikeId, on, qtyHint);
  if (r.error) return { error: r.error };
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function updateBikeQuantity(quoteId: string, lineId: string, qty: number) {
  const supabase = await createCommercialClient();
  const r = await cambiarCantidadBici(supabase, quoteId, lineId, qty);
  if (r.error) return { error: r.error };
  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  return { ok: true };
}

export async function crearCotizacionConBici(quoteId: string, seleccion: SeleccionBici[]) {
  const supabase = await createCommercialClient();
  const r = await crearHijaConBici(supabase, quoteId, seleccion);
  if (!r.ok) return { error: r.error };

  revalidatePath(`/seguimiento/${quoteId}`);
  revalidatePath("/seguimiento");
  revalidatePath("/calendario");
  // Ojo: `redirect()` funciona tirando una excepción interna de Next, así que va afuera de
  // cualquier try/catch y al final de todo.
  redirect(`/seguimiento/${r.id}`);
}
