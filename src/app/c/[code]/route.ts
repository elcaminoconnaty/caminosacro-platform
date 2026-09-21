// Enlace corto de una cotización: /c/[code] → el PDF que se le entregó al peregrino.
//
// Sirve la ÚLTIMA ENTREGA (migración 0049), no el archivo vivo: si la cotización se corrige
// y todavía no se le ha vuelto a enviar, el peregrino tiene que seguir viendo lo que se le
// prometió, y no un precio nuevo del que nadie le ha hablado. En cuanto se le reenvía —por
// correo o por WhatsApp— se congela una entrega nueva y este mismo enlace pasa a mostrarla.
//
// Antes de la primera entrega cae en el PDF vigente: el enlace existe desde que se abre el
// expediente y tiene que abrir algo aunque todavía no se haya mandado nada.
//
// Sin sesión: el código de la URL hace de autenticación, igual que /contrato/[token] y
// /documentacion/[token]. Son 10 caracteres de un alfabeto de 56 (~8 × 10^17).
//
// Se responde con una redirección a una URL firmada de Storage y no sirviendo el archivo
// desde acá: así el PDF lo entrega Supabase (que sabe de rangos y de reanudar descargas) y
// el servidor de la app no se queda ocupado mandando megas a un celular con mala señal.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderAndStoreQuotePdf } from "@/lib/quotes/pdf";
import { ultimaEntrega } from "@/lib/quotes/entregas";

export const dynamic = "force-dynamic";

/** Minutos, no días: la redirección se pide en el momento de abrir el enlace. */
const TTL = 60 * 15;

const NO_VALIDO = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Camino Sacro</title></head>
<body style="margin:0;background:#f7f5f0;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:420px;margin:14vh auto;padding:36px 28px;background:#fff;border:1px solid #e8e3d8;border-radius:16px;text-align:center;">
    <div style="font-size:11px;letter-spacing:3px;color:#e0a840;">CAMINO SACRO</div>
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#1a3a2a;margin-top:12px;">Enlace no válido</div>
    <p style="font-size:14px;line-height:1.6;color:#666;margin-top:12px;">
      Este enlace no existe o ya no está disponible. Escríbenos y te reenviamos tu cotización.
    </p>
    <a href="https://wa.me/573105385516"
       style="display:inline-block;margin-top:22px;padding:10px 24px;border:1px solid #1a3a2a;border-radius:999px;
              color:#1a3a2a;text-decoration:none;font-size:14px;">Escríbenos</a>
  </div>
</body></html>`;

function noValido(status = 404) {
  return new Response(NO_VALIDO, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Se filtra antes de consultar: un código con otra pinta no es un código, y así no se
  // convierte cualquier basura de la URL en una consulta a la base.
  if (!code || !/^[0-9A-Za-z]{6,24}$/.test(code)) return noValido();

  const supabase = createAdminClient("comercial");
  const { data: quote } = await supabase
    .from("quotes")
    .select("id,code,pdf_path")
    .eq("share_code", code)
    .maybeSingle();
  if (!quote) return noValido();

  // Lo entregado manda. Solo si nunca se le ha mandado nada se cae en el archivo vivo.
  const entrega = await ultimaEntrega(supabase, quote.id as string);
  let pdfPath = entrega?.pdf_path ?? (quote.pdf_path as string | null) ?? null;
  if (!pdfPath) {
    // El cliente admin es uno de los dos que `ComercialClient` admite: el render no
    // necesita sesión, y acá no la hay por definición.
    const r = await renderAndStoreQuotePdf(supabase, quote.id as string);
    if (r.error) {
      console.error("[enlace corto] no pude generar el PDF de", quote.code, r.error);
      return noValido(500);
    }
    const { data } = await supabase.from("quotes").select("pdf_path").eq("id", quote.id).maybeSingle();
    pdfPath = (data?.pdf_path as string | null) ?? null;
  }
  if (!pdfPath) return noValido(500);

  const [bucket, ...resto] = pdfPath.split("/");
  const { data: firmada, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(resto.join("/"), TTL);
  if (error || !firmada?.signedUrl) {
    console.error("[enlace corto] no pude firmar el PDF de", quote.code, error);
    return noValido(500);
  }

  // 302 y no 301: la URL firmada caduca, y un 301 se queda cacheado en el navegador del
  // peregrino para siempre — el enlace le funcionaría hoy y mañana no.
  return NextResponse.redirect(firmada.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
