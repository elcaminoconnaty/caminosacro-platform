// Versión web de un correo enviado: /correo/[token]
//
// Es el "¿No ves bien este correo? Ábrelo aquí" de la barra de arriba. Maquetar correo es
// apostar contra treinta clientes distintos —Outlook de escritorio pinta con el motor de
// Word, alguno invierte los colores en modo oscuro, otro decide no aplicar los estilos— y
// esta página es el plan B cuando la apuesta se pierde.
//
// Es un route handler y no una página de React a propósito: lo guardado ya es un
// documento HTML completo, con su `<html>`, su `<head>` y su `<body>`. Meterlo en el árbol
// de la app obliga a un iframe con `srcDoc` —que además no pinta— y a cargar el CSS de
// todo el CRM para no mostrar nada de él. Servirlo tal cual es lo simple y lo correcto.
//
// Se sirve el HTML EXACTO que se envió, guardado en comercial.email_log. No se vuelve a
// armar: si se regenerara, un cambio de plantilla haría que esta página dijera algo
// distinto de lo que el cliente tiene en su bandeja, y en el caso de la cotización ese
// correo es la oferta comercial que aceptó.
//
// Sin sesión: el token de la URL hace de autenticación, igual que /contrato/[token] y
// /documentacion/[token].

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * El HTML lo armamos nosotros y no lleva JavaScript, pero esto es contenido guardado que
 * se sirve desde nuestro dominio: la CSP lo deja sin poder ejecutar nada aunque algún día
 * se cuele algo. `style-src unsafe-inline` es obligado — un correo es todo estilos en línea.
 */
const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data: https:",
  "font-src data:",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function respuesta(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP,
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

const NO_VALIDO = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Camino Sacro</title></head>
<body style="margin:0;background:#f7f5f0;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:420px;margin:14vh auto;padding:36px 28px;background:#fff;border:1px solid #e8e3d8;border-radius:16px;text-align:center;">
    <div style="font-size:11px;letter-spacing:3px;color:#e0a840;">CAMINO SACRO</div>
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#1a3a2a;margin-top:12px;">Enlace no válido</div>
    <p style="font-size:14px;line-height:1.6;color:#666;margin-top:12px;">
      Este enlace no existe o ya no está disponible. Escríbenos y te reenviamos el correo.
    </p>
    <a href="mailto:reservas@caminosacro.com"
       style="display:inline-block;margin-top:22px;padding:10px 24px;border:1px solid #1a3a2a;border-radius:999px;
              color:#1a3a2a;text-decoration:none;font-size:14px;">Escríbenos</a>
  </div>
</body></html>`;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 32) return respuesta(NO_VALIDO, 404);

  const supabase = createAdminClient("comercial");
  const { data } = await supabase
    .from("email_log")
    .select("html")
    .eq("token", token)
    .maybeSingle();

  const html = (data?.html as string | null) ?? null;
  if (!html) return respuesta(NO_VALIDO, 404);
  return respuesta(html);
}
