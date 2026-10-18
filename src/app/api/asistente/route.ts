import { createCommercialClient } from "@/lib/supabase/server";
import { preguntar, MODELO, type EventoAsistente, type Turno, type Uso } from "@/lib/asistente/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Una pregunta que recorre varios correos y PDF puede tardar; Railway corta a los 300 s.
export const maxDuration = 300;

/**
 * POST { conversacionId?, pregunta } → NDJSON en vivo: una línea por evento
 * (`{t:"conversacion"}` primero, luego `texto` y `herramienta`, y al final `fin` o `error`).
 *
 * La pregunta y la respuesta se guardan con su autor (RLS: `user_id = auth.uid()`), así que
 * queda registro de quién preguntó qué y qué fuentes se usaron.
 */
export async function POST(request: Request) {
  const supabase = await createCommercialClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const body = await request.json().catch(() => null);
  const pregunta = String(body?.pregunta ?? "").trim().slice(0, 4000);
  if (!pregunta) return new Response("Falta la pregunta", { status: 400 });

  let conversacionId: string | null = body?.conversacionId ?? null;
  let historial: Turno[] = [];

  if (conversacionId) {
    const { data: conv } = await supabase.from("asistente_conversaciones").select("id, user_id").eq("id", conversacionId).maybeSingle();
    if (!conv || conv.user_id !== user.id) conversacionId = null; // solo se continúa una conversación propia
    else {
      const { data: previos } = await supabase
        .from("asistente_mensajes")
        .select("rol, contenido")
        .eq("conversacion_id", conversacionId)
        .order("created_at", { ascending: false })
        .limit(10);
      historial = (previos ?? []).reverse().map((m) => ({ role: m.rol as Turno["role"], content: m.contenido as string }));
    }
  }
  if (!conversacionId) {
    const { data: nueva, error } = await supabase
      .from("asistente_conversaciones")
      .insert({ user_id: user.id, user_email: user.email, titulo: pregunta.slice(0, 80) })
      .select("id")
      .single();
    if (error) return new Response(`No pude abrir la conversación: ${error.message}`, { status: 500 });
    conversacionId = nueva.id as string;
  }

  await supabase.from("asistente_mensajes").insert({ conversacion_id: conversacionId, user_id: user.id, rol: "user", contenido: pregunta });

  const quien = user.email ?? "alguien del equipo";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enviar = (ev: EventoAsistente | { t: "conversacion"; id: string }) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        } catch {
          /* el cliente se fue; igual terminamos y guardamos */
        }
      };
      enviar({ t: "conversacion", id: conversacionId! });

      let texto = "";
      let herramientas: Uso[] = [];
      let modelo: string | null = MODELO;
      let ms = 0;
      let error: string | null = null;
      const inicio = Date.now();

      // Sin `request.signal` a propósito: en el iPhone basta cambiar de app para cortar la
      // conexión, y la respuesta igual tiene que terminar y quedar guardada en la conversación.
      for await (const ev of preguntar({ supabase, quien, pregunta, historial })) {
        if (ev.t === "texto") texto += ev.d;
        if (ev.t === "herramienta") herramientas.push({ nombre: ev.nombre, detalle: ev.detalle });
        if (ev.t === "fin") {
          texto = ev.texto;
          herramientas = ev.herramientas;
          ms = ev.ms;
          modelo = ev.modelo ?? MODELO;
        }
        if (ev.t === "error") error = ev.mensaje;
        enviar(ev);
      }

      await supabase.from("asistente_mensajes").insert({
        conversacion_id: conversacionId,
        user_id: user.id,
        rol: "assistant",
        contenido: texto || (error ? `⚠️ ${error}` : "(sin respuesta)"),
        herramientas: herramientas.length ? herramientas : null,
        error,
        modelo,
        duracion_ms: ms || Date.now() - inicio,
      });
      await supabase.from("asistente_conversaciones").update({ updated_at: new Date().toISOString() }).eq("id", conversacionId);
      try {
        controller.close();
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
