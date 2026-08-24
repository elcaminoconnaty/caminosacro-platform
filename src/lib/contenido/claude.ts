import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Único punto por el que el Estudio de Contenido habla con Claude.
 *
 * Usa el SDK oficial (`@anthropic-ai/sdk`) y salida estructurada con zod
 * (`messages.parse` + `zodOutputFormat`): el modelo devuelve un objeto ya validado, así
 * que no hay JSON dentro de texto que parsear a mano — que es de donde salen los fallos
 * cuando el copy trae comillas o saltos de línea sin escapar.
 *
 * El costo se registra en `public.token_usage` con `bot: 'contenido'`. Esa tabla ya la
 * lee la pantalla /tokens y el reporte diario por Telegram, así que el gasto de este
 * módulo aparece ahí sin tocar nada más. El precio del modelo vive en
 * `comercial.settings.token_pricing`.
 */

// El modelo por defecto de la casa. El bot de Instagram del otro repo usa Sonnet 4.6
// porque publica una vez al día; acá el uso es a demanda y humano-en-el-medio, así que
// conviene el mejor modelo: la voz de marca es justamente lo difícil de acertar.
const MODELO = "claude-opus-5";

export class FaltaClaveAnthropic extends Error {
  constructor() {
    super(
      "Falta ANTHROPIC_API_KEY. Agrégala a .env.local y a las variables de Railway " +
        "para que el estudio pueda sugerir copy e ideas.",
    );
    this.name = "FaltaClaveAnthropic";
  }
}

export function hayClaveAnthropic(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Deja constancia del gasto. Nunca hace fallar la acción del usuario. */
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
    // Perder el registro de costo es molesto; perder el copy que el usuario acaba de
    // pedir, mucho peor. Se traga el error a propósito.
    console.error("[contenido] no se pudo registrar el consumo de tokens", e);
  }
}

export type OpcionesClaude = {
  system: string;
  user: string;
  canal: string;
  maxTokens?: number;
  /** `low` para tareas mecánicas, `high` cuando la calidad manda. */
  esfuerzo?: "low" | "medium" | "high";
};

/**
 * Le pide a Claude una respuesta con la forma exacta del esquema zod que se le pase.
 * Devuelve el objeto ya validado.
 */
export async function pedirEstructurado<T extends z.ZodType>(
  esquema: T,
  { system, user, canal, maxTokens = 4000, esfuerzo = "high" }: OpcionesClaude,
): Promise<z.infer<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new FaltaClaveAnthropic();

  const client = new Anthropic({ apiKey });

  const respuesta = await client.messages.parse({
    model: MODELO,
    max_tokens: maxTokens,
    // El system prompt es estable entre llamadas (es la voz de marca): cachearlo abarata
    // mucho, porque es con diferencia la parte más larga del prompt.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: {
      effort: esfuerzo,
      format: zodOutputFormat(esquema),
    },
    messages: [{ role: "user", content: user }],
  });

  await registrarConsumo(
    respuesta.usage.input_tokens + (respuesta.usage.cache_read_input_tokens ?? 0),
    respuesta.usage.output_tokens,
    canal,
  );

  if (respuesta.stop_reason === "refusal") {
    throw new Error("Claude declinó responder a esta petición.");
  }
  if (!respuesta.parsed_output) {
    throw new Error("Claude respondió, pero no con la forma esperada. Vuelve a intentarlo.");
  }

  return respuesta.parsed_output as z.infer<T>;
}
