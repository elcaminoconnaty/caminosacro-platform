/**
 * EL PUENTE — el programita que corre en el computador de Nico.
 *
 * Qué hace: mira la cola `public.contenido_trabajos` cada pocos segundos, toma el
 * siguiente encargo, se lo pasa a Claude usando la SUSCRIPCIÓN de Claude Code (no la API)
 * y escribe la respuesta de vuelta. La plataforma —esté quien esté mirándola, desde donde
 * sea— ve aparecer el resultado.
 *
 * Por qué así y no un túnel: este proceso SOLO HACE LLAMADAS SALIENTES a Supabase. No hay
 * puertos que abrir, ni IP fija que mantener, ni router que configurar. Funciona con el
 * portátil conectado a la wifi de un café.
 *
 * Es deliberadamente TONTO: no sabe de rutas, ni de precios, ni de la voz de la marca. El
 * prompt ya viene armado desde la plataforma. Así la lógica de negocio se despliega con la
 * app y este archivo puede quedarse quieto meses.
 *
 *   Arrancarlo a mano:   npm run puente
 *   Dejarlo siempre:     npm run puente:instalar   (lo registra en launchd de macOS)
 */

import { hostname } from "node:os";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { query } from "@anthropic-ai/claude-agent-sdk";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !LLAVE) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.\n" +
      "El puente las necesita para leer la cola.",
  );
  process.exit(1);
}

const sb = createClient(URL, LLAVE, { db: { schema: "public" } });
const YO = `${hostname()}`;

// Cada cuánto se mira la cola cuando está vacía. Tres segundos es imperceptible para quien
// espera y no hace ni cosquillas a Supabase.
const ESPERA_MS = 3000;
// El latido tiene que ser más frecuente que el umbral de "encendido" de la plataforma (90 s).
const LATIDO_MS = 30000;

type Trabajo = {
  id: number;
  tipo: string;
  entrada: { system: string; user: string; schema: Record<string, unknown> };
};

async function latir() {
  try {
    await sb.from("contenido_worker").upsert({ id: 1, visto_at: new Date().toISOString(), host: YO });
  } catch {
    // Un latido perdido no es nada: el siguiente llega en 30 segundos.
  }
}

/** Le pasa el encargo a Claude usando la suscripción y devuelve el objeto estructurado. */
async function resolver(t: Trabajo): Promise<unknown> {
  const conversacion = query({
    prompt: t.entrada.user,
    options: {
      systemPrompt: t.entrada.system,
      outputFormat: { type: "json_schema", schema: t.entrada.schema },
      // Generador de texto puro: sin herramientas, sin permisos que pedir, y sin cargar
      // los CLAUDE.md del repo (mezclarían las instrucciones del proyecto con la voz de
      // la marca).
      allowedTools: [],
      permissionMode: "dontAsk",
      settingSources: [],
      maxTurns: 1,
    },
  });

  let estructurado: unknown = null;
  let texto = "";

  for await (const m of conversacion) {
    if (m.type !== "result") continue;
    if (m.subtype === "success") {
      estructurado = m.structured_output ?? null;
      texto = m.result ?? "";
    } else {
      throw new Error(`Claude terminó con "${m.subtype}". ${(m.errors ?? []).join(" ")}`);
    }
  }

  if (estructurado) return estructurado;
  // Red de seguridad por si vino como texto: a veces el JSON llega envuelto.
  try {
    return JSON.parse(texto);
  } catch {
    const m = texto.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Claude respondió, pero no con la forma esperada.");
  }
}

async function unaVuelta() {
  // Devuelve a la cola lo que quedó colgado de una caída anterior.
  await sb.rpc("contenido_rescatar_trabajos");

  const { data, error } = await sb.rpc("contenido_tomar_trabajo", { p_worker: YO });
  if (error) {
    console.error(`[puente] no se pudo mirar la cola: ${error.message}`);
    return false;
  }
  const t = data as Trabajo | null;
  if (!t?.id) return false;

  const t0 = Date.now();
  console.log(`[puente] encargo #${t.id} (${t.tipo}) — trabajando…`);

  try {
    const resultado = await resolver(t);
    await sb
      .from("contenido_trabajos")
      .update({ estado: "listo", resultado, terminado_at: new Date().toISOString() })
      .eq("id", t.id);
    console.log(`[puente] encargo #${t.id} listo en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Vuelve a 'pendiente' para que se reintente; a los 3 intentos la función de rescate
    // lo marca como error definitivo.
    await sb
      .from("contenido_trabajos")
      .update({ estado: "pendiente", error: msg })
      .eq("id", t.id);
    console.error(`[puente] encargo #${t.id} falló: ${msg}`);
  }
  return true;
}

async function main() {
  console.log(`[puente] escuchando la cola como "${YO}". Ctrl+C para parar.`);
  await latir();
  setInterval(() => void latir(), LATIDO_MS);

  // Bucle honesto: si había trabajo, se vuelve a mirar de inmediato (puede haber más).
  for (;;) {
    let hubo = false;
    try {
      hubo = await unaVuelta();
    } catch (e) {
      console.error("[puente] vuelta fallida:", e instanceof Error ? e.message : e);
    }
    if (!hubo) await new Promise((r) => setTimeout(r, ESPERA_MS));
  }
}

main().catch((e) => {
  console.error("[puente] se cayó:", e);
  process.exit(1);
});
