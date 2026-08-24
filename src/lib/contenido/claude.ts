import "server-only";

import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Único punto por el que el Estudio de Contenido habla con Claude.
 *
 * POR QUÉ EL SDK DE AGENTES Y NO LA API: este SDK se apoya en el CLI de Claude Code que ya
 * está instalado y con sesión iniciada en el computador de Nico, así que **usa la
 * suscripción y no consume créditos de API**. No hace falta ninguna clave.
 *
 * LA CONTRAPARTIDA, QUE HAY QUE TENER PRESENTE: esa sesión vive en el computador. Cuando la
 * plataforma corre en Railway no hay CLI ni sesión, así que estos dos botones —sugerir copy
 * y sugerir ideas— no funcionan allá. Todo lo demás del módulo (diseñar, elegir ruta, poner
 * fotos, exportar) funciona igual en los dos lados. Cuando falta el CLI se avisa con un
 * mensaje claro en vez de fallar de forma rara.
 *
 * El agente corre AISLADO: sin herramientas, sin leer el disco y sin cargar los CLAUDE.md
 * del proyecto (`settingSources: []`). No queremos que las instrucciones del repo se
 * mezclen con la voz de la marca; esto es un generador de texto, no un agente que trabaja.
 */

// El CLI decide el modelo por defecto de la suscripción. Se puede fijar uno, pero dejarlo
// al CLI evita quedar clavado en un id que mañana no sea el mejor disponible.
const MODELO: string | undefined = undefined;

export class ClaudeNoDisponible extends Error {
  constructor(detalle?: string) {
    super(
      "Sugerir copy e ideas necesita Claude Code con sesión iniciada en este computador. " +
        "Funciona cuando abres la plataforma desde tu máquina; en el servidor de Railway no. " +
        (detalle ? `Detalle: ${detalle}` : ""),
    );
    this.name = "ClaudeNoDisponible";
  }
}

/** Deja constancia del consumo. Nunca hace fallar la acción del usuario. */
async function registrarConsumo(input: number, output: number, canal: string) {
  try {
    const admin = createAdminClient("public");
    await admin.from("token_usage").insert({
      bot: "contenido",
      channel: canal,
      input_tokens: input,
      output_tokens: output,
    });
  } catch (e) {
    // Perder el registro de consumo es molesto; perder el copy que el usuario acaba de
    // pedir, mucho peor. Se traga el error a propósito.
    console.error("[contenido] no se pudo registrar el consumo", e);
  }
}

export type OpcionesClaude = {
  system: string;
  user: string;
  canal: string;
};

/**
 * Le pide a Claude una respuesta con la forma exacta del esquema zod que se le pase, y
 * devuelve el objeto ya validado.
 */
export async function pedirEstructurado<T extends z.ZodType>(
  esquema: T,
  { system, user, canal }: OpcionesClaude,
): Promise<z.infer<T>> {
  // z.toJSONSchema es de zod v4, la que trae el proyecto. Hay que QUITARLE el `$schema`:
  // zod v4 escribe la referencia al draft 2020-12 y el validador del CLI la rechaza con
  // "no schema with key or ref ...". Cuesta media hora encontrarlo, así que queda escrito.
  const { $schema: _descartado, ...schema } = z.toJSONSchema(esquema) as Record<string, unknown>;
  void _descartado;

  let estructurado: unknown = null;
  let texto = "";
  let entrada = 0;
  let salida = 0;

  try {
    const conversacion = query({
      prompt: user,
      options: {
        systemPrompt: system,
        ...(MODELO ? { model: MODELO } : {}),
        outputFormat: { type: "json_schema", schema },
        // Generador de texto puro: sin herramientas y sin permisos que pedir. Si algo
        // intentara leer el disco, se deniega en vez de quedarse esperando una respuesta
        // que nadie va a dar (esto corre dentro de una Server Action, sin terminal).
        allowedTools: [],
        permissionMode: "dontAsk",
        // Aislamiento: nada de CLAUDE.md ni ajustes del repo mezclados con la voz de marca.
        settingSources: [],
        maxTurns: 1,
      },
    });

    for await (const mensaje of conversacion) {
      if (mensaje.type !== "result") continue;
      if (mensaje.subtype === "success") {
        estructurado = mensaje.structured_output ?? null;
        texto = mensaje.result ?? "";
      }
      // `usage` puede venir en cero en resultados de error; se registra igual lo que haya.
      entrada = mensaje.usage?.input_tokens ?? 0;
      salida = mensaje.usage?.output_tokens ?? 0;
      if (mensaje.subtype !== "success") {
        throw new Error(`Claude terminó con "${mensaje.subtype}". ${(mensaje.errors ?? []).join(" ")}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // El caso típico fuera del computador de Nico: no hay binario o no hay sesión.
    if (/ENOENT|not found|executable|spawn|authenticat|credential|login/i.test(msg)) {
      throw new ClaudeNoDisponible(msg);
    }
    throw e;
  }

  await registrarConsumo(entrada, salida, canal);

  // Con outputFormat el SDK devuelve el objeto en structured_output. Si por lo que sea
  // vino solo texto, se intenta parsear antes de rendirse.
  const crudo = estructurado ?? (texto ? intentarJson(texto) : null);
  if (!crudo) throw new Error("Claude respondió, pero no con la forma esperada. Vuelve a intentarlo.");

  const r = esquema.safeParse(crudo);
  if (!r.success) {
    throw new Error("Claude respondió con campos que no encajan. Vuelve a intentarlo.");
  }
  return r.data;
}

function intentarJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    // A veces el JSON viene envuelto en explicación o en una valla de código.
    const m = texto.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/** Para que la interfaz pueda avisar antes de que el usuario apriete el botón. */
export function claudePuedeCorrer(): boolean {
  // No se puede saber con certeza sin lanzarlo; en Railway no hay HOME de usuario con
  // sesión de Claude Code. Es una heurística para el aviso, no una garantía.
  return process.env.RAILWAY_ENVIRONMENT === undefined;
}
