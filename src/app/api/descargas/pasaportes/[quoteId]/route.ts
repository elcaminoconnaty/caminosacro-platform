// GET /api/descargas/pasaportes/[quoteId] — todos los pasaportes de un grupo en un .zip.
//
// Lo usa el botón "Descargar los N pasaportes (.zip)" de la tarjeta de contratos en
// Seguimiento. Va detrás del login del CRM (el proxy no lo lista como público), así que
// solo el equipo puede bajarlo. Cada archivo se llama
// `Pasaporte-<código>-<posición>-<nombre>.<ext>` para que Pilgrim los reconozca de un vistazo.
//
// El pasaporte de un viajero vive en `quote_travelers.passport_path` (ficha o carga
// desde el CRM); si no está ahí, se mira `contracts.passport_path` (lo subió al firmar
// su contrato individual). Las fotos ya vienen comprimidas, por eso el zip solo guarda
// (nivel 0): comprimir de nuevo un JPG no ahorra nada.

import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { createCommercialClient } from "@/lib/supabase/server";
import { sinBucket } from "@/lib/storage/paths";

export const dynamic = "force-dynamic";

function limpio(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(_req: Request, ctx: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await ctx.params;
  const supabase = await createCommercialClient();

  const [{ data: quote }, { data: travelers }, { data: contracts }] = await Promise.all([
    supabase.from("quotes").select("code").eq("id", quoteId).maybeSingle(),
    supabase
      .from("quote_travelers")
      .select("id,position,full_name,passport_path")
      .eq("quote_id", quoteId)
      .order("position"),
    supabase.from("contracts").select("traveler_id,passport_path").eq("quote_id", quoteId),
  ]);
  if (!quote) return NextResponse.json({ error: "La cotización no existe." }, { status: 404 });

  const porViajero = new Map<string, string>();
  for (const c of contracts ?? []) {
    if (c.traveler_id && c.passport_path) porViajero.set(String(c.traveler_id), String(c.passport_path));
  }

  const archivos: Record<string, Uint8Array> = {};
  const faltantes: string[] = [];
  for (const t of travelers ?? []) {
    const path = (t.passport_path as string | null) ?? porViajero.get(String(t.id)) ?? null;
    if (!path) continue;
    const [bucket] = path.split("/");
    const { data, error } = await supabase.storage.from(bucket).download(sinBucket(path));
    if (error || !data) {
      faltantes.push(`${t.position}. ${t.full_name}`);
      continue;
    }
    const ext = (path.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();
    const nombre = limpio(String(t.full_name || `viajero-${t.position}`));
    archivos[`Pasaporte-${quote.code}-${t.position}-${nombre}.${ext}`] = new Uint8Array(await data.arrayBuffer());
  }

  if (Object.keys(archivos).length === 0) {
    return NextResponse.json(
      { error: "Ningún viajero de esta cotización tiene pasaporte cargado.", faltantes },
      { status: 404 },
    );
  }
  if (faltantes.length) {
    // Un archivo que figura en la base pero no está en storage: se deja constancia dentro del zip.
    archivos["FALTANTES.txt"] = new TextEncoder().encode(
      `Estos viajeros figuran con pasaporte pero el archivo no se encontró en el almacenamiento:\n- ${faltantes.join("\n- ")}\n`,
    );
  }

  const zip = zipSync(archivos, { level: 0 });
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Pasaportes-${quote.code}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
