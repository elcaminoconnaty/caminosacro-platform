import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { tarifarRuta } from "@/lib/quotes/tarifar";
import { INCLUIDO_DEFAULT, NO_INCLUIDO_DEFAULT } from "@/lib/quotePdf";
import { autorizadoLectura, noAutorizado } from "../auth";

export const dynamic = "force-dynamic";

const consultaSchema = z.object({
  ruta: z.string().trim().min(1).max(80),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  personas: z.coerce.number().int().min(1).max(30),
  tipo: z.enum(["pension", "hotel"]),
  individual: z.enum(["0", "1"]).default("0"),
});

/**
 * GET /api/agente/precio?ruta=&fecha=&personas=&tipo=pension|hotel&individual=0|1
 *
 * El precio de una salida SIN crear cotización. Existe para Isabel: cuando un lead
 * pregunta "¿y si vamos 3 en vez de 2?" o "¿y en hotel?", la respuesta tiene que salir
 * del mismo `tarifarRuta` que usan la web y el CRM, no de una lista copiada en su
 * prompt (que es justo lo que hacía inventar a Clara).
 *
 * Devuelve lo que se le puede decir a un cliente: nunca el costo de Pilgrim.
 * También viajan las listas de incluido/no incluido del PDF, para que lo que dice
 * Isabel y lo que dice la cotización sean la misma frase.
 */
export async function GET(request: Request) {
  if (!autorizadoLectura(request)) return noAutorizado();

  const parsed = consultaSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validacion", faltantes: parsed.error.issues.map((i) => i.path.join(".")) },
      { status: 422 },
    );
  }
  const q = parsed.data;

  const supabase = createAdminClient("comercial");
  const { data: route } = await supabase
    .from("routes")
    .select("id,name,days,nights,stages,km,modality")
    .eq("slug", q.ruta)
    .eq("active", true)
    .maybeSingle();
  if (!route) return Response.json({ ok: false, error: "ruta_no_encontrada" }, { status: 404 });

  const r = await tarifarRuta(supabase, {
    route: { id: route.id, name: route.name, days: route.days },
    tipo: q.tipo,
    todosIndividuales: q.individual === "1",
    personas: q.personas,
    startDate: q.fecha,
  });
  if (!r.ok) return Response.json({ ok: false, error: r.error, detalle: r.detalle }, { status: r.status });
  const t = r.tarifa;
  const enBici = String(route.modality || "").toLowerCase() === "bici";

  return Response.json({
    ok: true,
    ruta: { slug: q.ruta, nombre: route.name, dias: route.days, noches: route.nights, etapas: route.stages, km: route.km, en_bici: enBici },
    ano_tarifa: t.year,
    salida: q.fecha,
    regreso: t.endDate,
    personas: t.personas,
    modalidad: t.modalityLabel,
    habitaciones: { dobles: t.dobles, individuales: t.individuales },
    tarifa_por_persona: { doble: t.tarifaDoble, individual: t.tarifaSingle },
    base_eur: t.baseEur,
    temporada: { tipo: t.season.type, nombre: t.season.label, suplemento_por_persona: t.season.surcharge_per_person_cs, suplemento_total: t.suplementoEur },
    total_eur: t.totalEur,
    total_por_persona_eur: Math.round((t.totalEur / t.personas) * 100) / 100,
    incluye: INCLUIDO_DEFAULT(route.nights ?? Math.max((route.days ?? 1) - 1, 0)),
    no_incluye: NO_INCLUIDO_DEFAULT(enBici),
    nota: "Precio sin opcionales (seguro de cancelación, noches extra, traslados, tours, bicicleta).",
  });
}
