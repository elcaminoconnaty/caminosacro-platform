import { createCommercialClient } from "@/lib/supabase/server";
import { enviarCorreo, vencida, type PropuestaCorreo } from "@/lib/asistente/acciones";
import type { Uso } from "@/lib/asistente/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Propuestas que se están enviando en este proceso: un doble toque no manda dos correos. */
const enCurso = new Set<string>();

/**
 * POST { mensajeId, propuestaId, decision: "enviar" | "cancelar", cuerpo? }
 *
 * Relee la propuesta del mensaje guardado (RLS: solo quien la pidió la ve, así que solo esa
 * persona la confirma), comprueba que siga pendiente y no haya vencido, y la ejecuta tal cual.
 * Lo único que se acepta del navegador es el texto retocado del cuerpo.
 */
export async function POST(request: Request) {
  const supabase = await createCommercialClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const b = (await request.json().catch(() => null)) as { mensajeId?: string; propuestaId?: string; decision?: string; cuerpo?: string } | null;
  if (!b?.mensajeId || !b.propuestaId || !["enviar", "cancelar"].includes(b.decision ?? "")) {
    return Response.json({ error: "Petición incompleta" }, { status: 400 });
  }

  const { data: msg } = await supabase.from("asistente_mensajes").select("id, user_id, herramientas").eq("id", b.mensajeId).maybeSingle();
  if (!msg || msg.user_id !== user.id) return Response.json({ error: "No encontré esa propuesta." }, { status: 404 });
  const usos = (msg.herramientas as Uso[] | null) ?? [];
  const i = usos.findIndex((u) => u.propuesta?.id === b.propuestaId);
  if (i < 0) return Response.json({ error: "No encontré esa propuesta." }, { status: 404 });
  const p = usos[i].propuesta as PropuestaCorreo;

  // Si falló el envío (Outlook caído, un adjunto), se puede volver a intentar.
  const pendiente = p.estado === "propuesta" || (p.estado === "fallida" && b.decision === "enviar");
  if (!pendiente) return Response.json({ propuesta: p, error: "Esta propuesta ya se decidió." }, { status: 409 });
  if (b.decision === "enviar" && vencida(p)) {
    return Response.json({ propuesta: p, error: "La propuesta venció (24 h). Pídele al asistente que la vuelva a armar." }, { status: 409 });
  }
  if (enCurso.has(p.id)) return Response.json({ propuesta: p, error: "Ya se está enviando." }, { status: 409 });

  let final: PropuestaCorreo;
  if (b.decision === "cancelar") {
    final = { ...p, estado: "cancelada", decididaEn: new Date().toISOString() };
  } else {
    const cuerpo = (b.cuerpo ?? p.cuerpo).trim();
    if (cuerpo.length < 5) return Response.json({ propuesta: p, error: "El correo quedó vacío." }, { status: 400 });
    enCurso.add(p.id);
    try {
      const r = await enviarCorreo(supabase, { ...p, cuerpo });
      final = { ...p, cuerpo, estado: r.ok ? "enviada" : "fallida", resultado: r.resultado, decididaEn: new Date().toISOString() };
    } finally {
      enCurso.delete(p.id);
    }
  }

  const nuevos = usos.map((u, j) => (j === i ? { ...u, propuesta: final } : u));
  await supabase.from("asistente_mensajes").update({ herramientas: nuevos }).eq("id", msg.id);

  return Response.json({ propuesta: final, ...(final.estado === "fallida" ? { error: final.resultado } : {}) }, { status: final.estado === "fallida" ? 502 : 200 });
}
