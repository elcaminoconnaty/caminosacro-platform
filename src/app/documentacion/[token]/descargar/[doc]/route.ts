// Descarga de un documento de viaje: /documentacion/[token]/descargar/[doc]
//
// Este handler es lo que hace que el enlace del correo no caduque. Valida el token,
// firma la URL de Storage EN ESE MOMENTO (60 s, lo justo para el redirect) y manda al
// navegador ahí. El enlace que tiene el cliente nunca cambia; lo que cambia es la firma,
// que se emite fresca en cada clic.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rutaAsistencia } from "@/lib/storage/paths";

export const dynamic = "force-dynamic";

const CLAVES = ["documento", "asistencia", "seguro", "etiqueta"] as const;
type Clave = (typeof CLAVES)[number];

function esClave(v: string): v is Clave {
  return (CLAVES as readonly string[]).includes(v);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; doc: string }> },
) {
  const { token, doc: clave } = await params;
  if (!token || token.length < 32 || !esClave(clave)) {
    return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  }

  const supabase = createAdminClient("comercial");
  const { data: exp } = await supabase
    .from("travel_docs")
    .select("quote_id,doc_pdf_path,insurance_pdf_path,luggage_tag_pdf_path,revoked_at,quotes(code)")
    .eq("token", token)
    .maybeSingle();

  if (!exp) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  if (exp.revoked_at) return NextResponse.json({ error: "Enlace anulado" }, { status: 410 });

  // La asistencia es la misma para todos y no vive en el expediente: siempre se sirve la
  // versión vigente, así que corregir un teléfono arregla también los viajes ya enviados.
  const ruta =
    clave === "documento" ? (exp.doc_pdf_path as string | null)
    : clave === "seguro" ? (exp.insurance_pdf_path as string | null)
    : clave === "etiqueta" ? (exp.luggage_tag_pdf_path as string | null)
    : rutaAsistencia();

  if (!ruta) return NextResponse.json({ error: "Ese documento todavía no está disponible" }, { status: 404 });

  // El código de la reserva es lo que el peregrino reconoce en su carpeta de descargas.
  const code = (exp as { quotes?: { code?: string } | null }).quotes?.code || "Camino-Sacro";

  const [bucket, ...rest] = ruta.split("/");
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(rest.join("/"), 60, { download: nombreArchivo(clave, code) });

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "No se pudo preparar la descarga" }, { status: 502 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}

/**
 * Nombre con el que se guarda el archivo. Sin esto, todos se descargan con el nombre
 * interno de Storage y el peregrino termina con cuatro PDF que no distingue.
 */
function nombreArchivo(clave: Clave, code: string): string {
  switch (clave) {
    case "documento": return `Documento-de-Viaje-${code}.pdf`;
    case "seguro": return `Seguro-de-Viaje-${code}.pdf`;
    case "etiqueta": return `Etiqueta-Equipaje-${code}.pdf`;
    case "asistencia": return "Asistencia-en-Viaje-Camino-Sacro.pdf";
  }
}
