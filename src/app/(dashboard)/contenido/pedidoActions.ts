"use server";

import { revalidatePath } from "next/cache";
import { createPublicSchemaClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import { construirEncargoPedido, interpretarPedido, NOTA_PEDIDO } from "@/lib/contenido/pedido";
import { encolar, consultarTrabajo, marcarConsumido, estadoDelWorker } from "@/lib/contenido/cola";
import {
  esTipoPedido,
  MAX_LARGO_PEDIDO,
  MAX_POSTS,
  type TipoPedidoId,
} from "@/lib/contenido/pedidoOpciones";

/**
 * "Pídelo tú": el encargo que nace de una frase escrita, no de los datos.
 *
 * Misma tubería que las sugerencias (`ideasActions.ts`): NO habla con Claude, deja el
 * pedido en la cola y el worker del computador lo resuelve con la suscripción. El
 * resultado aterriza en `contenido_ideas` con `fuente = 'manual'`, así que la bandeja lo
 * pinta y "Armar" lo convierte en pieza sin una línea de código nueva.
 */

/**
 * Envuelto en try/catch a propósito, igual que `encargarIdeas`: esta acción la llama un
 * botón de un componente cliente, no un `<form action>`. Si algo lanza sin atraparse,
 * React tumba TODA la pantalla de `/contenido` con un "This page couldn't load".
 */
export async function encargarPedido(textoCrudo: string, cantidadCruda: string, tipoCrudo: string) {
  try {
    const texto = textoCrudo.trim().slice(0, MAX_LARGO_PEDIDO);
    if (!texto) return { error: "Escribe qué post quieres antes de pedirlo." };

    const tipo: TipoPedidoId = esTipoPedido(tipoCrudo) ? tipoCrudo : "auto";
    const n = Number.parseInt(cantidadCruda, 10);
    const cantidad = Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_POSTS) : null;

    const encargo = construirEncargoPedido({ texto, cantidad, tipo });
    const r = await encolar("pedido", encargo);
    if ("error" in r && r.error) return { error: r.error };

    const worker = await estadoDelWorker();
    return { ok: true as const, trabajoId: r.trabajoId, texto, tipo, workerEncendido: worker.encendido };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo preparar el pedido." };
  }
}

/**
 * Pregunta si el pedido ya está. Si lo está, guarda los posts en la bandeja de ideas.
 *
 * El texto del pedido viaja de ida y vuelta por el cliente (igual que `contexto` en
 * `recogerIdeas`) porque es lo que se guarda en `contenido_ideas.pedido`: sin él, la
 * tarjeta no podría decir de qué salió.
 */
export async function recogerPedido(trabajoId: number, texto: string, tipoCrudo: string) {
  // Mismo motivo que en `encargarPedido`: esto lo sondea un `setTimeout` del cliente.
  try {
    const tipo: TipoPedidoId = esTipoPedido(tipoCrudo) ? tipoCrudo : "auto";
    const t = await consultarTrabajo(trabajoId);

    if (t.estado === "pendiente" || t.estado === "tomado") {
      return { esperando: true as const, posicion: t.posicion };
    }
    if (t.estado === "error") return { error: t.error };
    if (t.estado !== "listo") return { error: "Ese pedido ya no existe." };

    const r = interpretarPedido(t.resultado, tipo);
    if (!("ok" in r) || !r.posts) return { error: "error" in r ? r.error : "Respuesta inesperada." };

    const supabase = await createPublicSchemaClient();
    const { error } = await supabase.from("contenido_ideas").insert(
      r.posts.map((p) => ({
        titular: p.titulo,
        pilar: p.pilar,
        formato: p.formato,
        // La plantilla del primer slide es la que define de qué tiene pinta el post; se
        // guarda por coherencia con las sugerencias, aunque `aceptarIdea` use `slides`.
        plantilla_sugerida: p.slides[0]?.plantilla ?? null,
        angulo: p.angulo,
        razon: p.enfoque,
        // `evidencia.nota` la pinta la bandeja con su triangulito de aviso. Aquí no hay
        // números que respalden nada —el tema lo puso una persona—, así que lo que se
        // muestra es justo eso: revisa las cifras antes de publicar.
        evidencia: { items: [], nota: NOTA_PEDIDO },
        ruta_nombre: p.ruta_nombre,
        slides: p.slides,
        // `fuente` (quién propuso la idea) es 'manual': la idea es de la persona, aunque
        // la redacción sea de Claude. `fuente_dato` queda null: no salió de ningún dato.
        fuente: "manual",
        fuente_dato: null,
        pedido: texto,
      })),
    );
    if (error) return { error: mensajeError(error) };

    await marcarConsumido(trabajoId);
    revalidatePath("/contenido");
    return { ok: true as const, cuantos: r.posts.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo recoger el pedido." };
  }
}
