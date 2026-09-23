// GET /seguimiento/[id]/carta-bienvenida — la carta de bienvenida de esta cotización, en PDF.
//
// La abre el botón de la tarjeta "Carta de bienvenida" del seguimiento, en una pestaña
// nueva. Va detrás del login del CRM (el proxy no la lista como pública). No guarda nada:
// se genera en cada clic con el itinerario vigente, así que un cambio de etapas se ve en
// la siguiente carta sin tener que "regenerar" nada.
//
// `titulo` e `intro` (opcionales) son los textos que Nico corrigió en la tarjeta; sin
// ellos van los sugeridos. `descargar=1` la baja como archivo en vez de abrirla.

import { NextResponse } from "next/server";
import { createCommercialClient } from "@/lib/supabase/server";
import { renderCartaBienvenida } from "@/lib/bienvenida/render";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const supabase = await createCommercialClient();

  const r = await renderCartaBienvenida(supabase, id, {
    titulo: url.searchParams.get("titulo"),
    intro: url.searchParams.get("intro"),
  });
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 422 });

  const modo = url.searchParams.get("descargar") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(r.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${modo}; filename="${r.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
