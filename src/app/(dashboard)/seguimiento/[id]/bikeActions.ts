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
 *
 * Ojo: un archivo "use server" SOLO puede exportar funciones async. Un `export type { X }`
 * (reexportar un tipo importado) parece inofensivo, pero el transform de Next lo cuenta como
 * export de verdad y emite `ensureServerEntryExports([..., X])` sobre un binding que TypeScript
 * ya borró: el chunk revienta con "X is not defined" al evaluarse y se caen TODAS las acciones
 * de /seguimiento/[id] —incluido "Generar PDF"—. Si necesitás el tipo, importalo directo de
 * `@/lib/quotes/bikeQuote`. (Un `export type X = {...}` declarado acá sí se borra entero y no molesta.)
 */

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
