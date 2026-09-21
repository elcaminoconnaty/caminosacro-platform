import "server-only";

import type { ComercialClient } from "@/lib/quotes/pdf";

/** 7 días, igual que el resto de la plataforma (y que el enlace del contrato). */
export const PDF_URL_TTL = 60 * 60 * 24 * 7;

/**
 * URL firmada del PDF de una cotización, releyendo `pdf_path` de la base.
 *
 * Se relee a propósito: quien acaba de generar el PDF no conoce la ruta final —la arma
 * `renderAndStoreQuotePdf` con el código, el cliente y la ruta— y si el render falló hay
 * que devolver `null` en vez de un enlace roto.
 */
export async function firmarPdf(supabase: ComercialClient, quoteId: string): Promise<string | null> {
  const { data: fresh } = await supabase.from("quotes").select("pdf_path").eq("id", quoteId).maybeSingle();
  const filePath = (fresh?.pdf_path ?? "").replace(/^comercial-quotes\//, "");
  if (!filePath) return null;
  const { data: signed } = await supabase.storage.from("comercial-quotes").createSignedUrl(filePath, PDF_URL_TTL);
  return signed?.signedUrl ?? null;
}

/**
 * URL firmada de un archivo concreto del bucket de cotizaciones.
 *
 * Existe para las copias congeladas de `quote_deliveries` (migración 0049): ahí la ruta ya
 * se conoce y NO hay que releer `quotes.pdf_path` —que es justo el archivo que puede haber
 * cambiado—. `firmarPdf` sigue sirviendo para el PDF vigente.
 */
export async function firmarRuta(supabase: ComercialClient, storagePath: string): Promise<string | null> {
  if (!storagePath) return null;
  const [bucket, ...resto] = storagePath.split("/");
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(resto.join("/"), PDF_URL_TTL);
  return signed?.signedUrl ?? null;
}
