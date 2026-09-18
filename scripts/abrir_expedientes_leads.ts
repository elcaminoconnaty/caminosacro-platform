/**
 * Abre el expediente de los leads sin precio que se quedaron sin uno.
 *
 * Desde la migración 0045 cada solicitud que la web no puede cotizar crea su cotización
 * vacía al vuelo. Los leads anteriores a ese despliegue —Hugo, Marcela y las dos de
 * Martha— no la tienen, así que no salen en el listado de cotizaciones. Esto se la abre,
 * por el MISMO camino que usa el endpoint (`crearCotizacionSinPrecio`), para que no haya
 * dos formas distintas de crear lo mismo.
 *
 * Idempotente: solo toca los leads con `quote_id` en null, así que volver a correrlo no
 * duplica nada. Los envíos repetidos del cotizador comparten expediente: las dos filas de
 * Hugo son un solo viaje y una sola cotización.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/abrir_expedientes_leads.ts          (ensayo)
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/abrir_expedientes_leads.ts --aplicar
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { claveLead, type WebLead } from "@/lib/leads/webLeads";
import { crearCotizacionSinPrecio } from "@/lib/quotes/leadQuote";

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "comercial" } },
  );

  const { data, error } = await sb
    .from("web_leads")
    .select(
      "id,created_at,code,motivo,route_slug,route_name,tipo,start_date,people,full_name,email,phone,marketing_optin,email_sent,atendido_at,atendido_nota,precio_solicitado_at,quote_id",
    )
    .is("quote_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const leads = (data ?? []) as WebLead[];
  if (leads.length === 0) {
    console.log("No hay leads sin expediente. Nada que hacer.");
    return;
  }

  // Un envío repetido es un solo viaje: las filas se agrupan y comparten cotización.
  const grupos = new Map<string, WebLead[]>();
  for (const l of leads) {
    const k = claveLead(l);
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }

  console.log(`${leads.length} filas sin expediente → ${grupos.size} cotizaciones a abrir`);
  console.log(aplicar ? "MODO APLICAR\n" : "ENSAYO (sin --aplicar no se escribe nada)\n");

  for (const filas of grupos.values()) {
    const l = filas[0];
    const etiqueta = `${l.full_name} · ${l.route_name || l.route_slug} · salida ${l.start_date} · ${l.people} pax${filas.length > 1 ? ` (${filas.length} envíos)` : ""}`;
    if (!aplicar) {
      console.log(`  [ensayo] ${etiqueta}`);
      continue;
    }
    const r = await crearCotizacionSinPrecio(sb, {
      motivo: l.motivo,
      route_slug: l.route_slug,
      route_name: l.route_name,
      tipo: l.tipo,
      start_date: l.start_date,
      people: l.people,
      full_name: l.full_name,
      email: l.email,
      phone: l.phone,
      marketing_optin: l.marketing_optin,
      code_web: l.code,
    });
    if (!r.ok) {
      console.error(`  ✗ ${etiqueta} — ${r.error}`);
      continue;
    }
    const { error: upErr } = await sb
      .from("web_leads")
      .update({ quote_id: r.id })
      .in("id", filas.map((f) => f.id));
    if (upErr) {
      console.error(`  ✗ ${r.code} creada pero NO enlazada a ${etiqueta}:`, upErr.message);
      continue;
    }
    console.log(`  ✓ ${r.code} — ${etiqueta}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
