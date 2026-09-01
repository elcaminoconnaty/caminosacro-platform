import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// /cotizar es el cotizador público que enlaza caminosacro.com: no exige sesión.
// /api/wp son los endpoints del cotizador de WordPress: traen su propia
// autenticación por secreto compartido (x-cs-api-key), no sesión de usuario.
// /contrato es la firma pública del contrato: autentica por token único con
// expiración en la URL (ver src/app/contrato/[token]).
// /api/cron son los disparadores programados de n8n: autentican por secreto
// compartido (x-cron-secret), no por sesión de usuario.
// /api/agente son los endpoints con los que BayMax cotiza: secreto propio
// (x-cs-api-key vs AGENTE_API_SECRET). Sin esto el proxy los manda a /login con
// un 307 y el agente recibe una página de sesión en vez de su JSON.
// /documentacion es la documentación de viaje del peregrino: autentica por el token
// único de la URL (ver src/app/documentacion/[token]). Es el enlace que va en el correo
// y que el cliente abre durante el viaje; sin esto lo mandaría a iniciar sesión en el CRM.
// /correo es la versión web de un correo enviado ("¿No ves bien este correo? Ábrelo
// aquí"): mismo patrón de token, y lo abre el mismo cliente sin sesión.
const PUBLIC_PATHS = [
  "/login", "/auth/callback", "/cotizar", "/api/wp", "/contrato",
  "/api/cron", "/api/agente", "/documentacion", "/correo",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/clara";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg).*)"],
};
