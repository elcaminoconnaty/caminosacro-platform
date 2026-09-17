import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicarPiezaTomada, type PiezaTomada } from "@/lib/contenido/publicar";

/**
 * POST /api/cron/publicar-contenido
 *
 * Lo despierta pg_cron cada 5 minutos (job `camino-sacro-publicar-contenido`, creado con
 * scripts/programar_cron_publicaciones.sh). Toma las piezas cuya hora ya pasó y las
 * publica en Instagram.
 *
 * Responde 202 EN SEGUIDA y publica después de responder (`after`): pg_net corta la
 * petición a los 15 s y un carrusel de 6 tarda más que eso en pasar por Instagram. Si el
 * proceso muriera a mitad, `contenido_rescatar_publicaciones` devuelve la pieza a la cola
 * en el siguiente tick (hasta 3 intentos). Correrlo varias veces seguidas no duplica nada:
 * la toma es atómica (`for update skip locked`).
 */

export const dynamic = "force-dynamic";

const PIEZAS_POR_TICK = 3;

function autorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const a = Buffer.from(request.headers.get("x-cron-secret") ?? "");
  const b = Buffer.from(secreto);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return Response.json({ ok: false, error: "no_autorizado" }, { status: 401 });
  }

  const admin = createAdminClient("public");

  const { data: rescatadas, error: errRescate } = await admin.rpc("contenido_rescatar_publicaciones");
  if (errRescate) console.error("[publicar-contenido] rescate falló:", errRescate.message);

  const { data, error } = await admin.rpc("contenido_tomar_publicaciones", { p_limite: PIEZAS_POR_TICK });
  if (error) {
    console.error("[publicar-contenido] no se pudo tomar la cola:", error.message);
    return Response.json({ ok: false, error: "No se pudo consultar la cola." }, { status: 500 });
  }

  const tomadas = (data ?? []) as PiezaTomada[];
  if (tomadas.length) {
    after(async () => {
      // En serie a propósito: Instagram procesa cada contenedor por su cuenta y dos
      // publicaciones a la vez solo suman ruido en los límites de la API.
      for (const p of tomadas) {
        const r = await publicarPiezaTomada(p);
        console.log(`[publicar-contenido] ${p.id} «${p.titulo}» → ${r.ok ? `publicada ${r.permalink ?? r.mediaId}` : `falló: ${r.error}`}`);
      }
    });
  }

  return Response.json(
    { ok: true, tomadas: tomadas.length, rescatadas: (rescatadas as number | null) ?? 0, ids: tomadas.map((p) => p.id) },
    { status: 202 },
  );
}
