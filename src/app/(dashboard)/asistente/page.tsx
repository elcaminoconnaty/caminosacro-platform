import { createCommercialClient } from "@/lib/supabase/server";
import { Chat, type Mensaje } from "./Chat";
import { correosConectados, problemaDeConfiguracion } from "@/lib/asistente/config";
import type { Uso } from "@/lib/asistente/agente";

export const dynamic = "force-dynamic";

export default async function AsistentePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const supabase = await createCommercialClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: conversaciones, error } = await supabase
    .from("asistente_conversaciones")
    .select("id, titulo, updated_at")
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false })
    .limit(30);

  let mensajes: Mensaje[] = [];
  const actual = c && conversaciones?.some((x) => x.id === c) ? c : null;
  if (actual) {
    const { data } = await supabase
      .from("asistente_mensajes")
      .select("id, rol, contenido, herramientas, error")
      .eq("conversacion_id", actual)
      .order("created_at");
    mensajes = (data ?? []).map((m) => ({
      id: m.id as string,
      role: m.rol as Mensaje["role"],
      content: m.contenido as string,
      herramientas: (m.herramientas as Uso[] | null) ?? [],
      error: m.error as string | null,
    }));
  }

  // Sin la migración 0060 la tabla no existe: que la pantalla lo diga en vez de romperse.
  const aviso = problemaDeConfiguracion() ?? (error ? `Falta aplicar la migración 0060_asistente.sql (${error.message}).` : null);

  return (
    <Chat
      key={actual ?? "nueva"}
      conversacionId={actual}
      mensajesIniciales={mensajes}
      conversaciones={(conversaciones ?? []).map((x) => ({ id: x.id as string, titulo: (x.titulo as string) ?? "Sin título", fecha: x.updated_at as string }))}
      aviso={aviso}
      correos={correosConectados()}
    />
  );
}
