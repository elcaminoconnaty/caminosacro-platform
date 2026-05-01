/**
 * Enrich existing comercial.quotes con datos de camino_sacro_seguimiento.xlsx.
 * Actualiza solo los campos que estén en NULL o vacíos — no sobreescribe ediciones manuales.
 *
 * Uso: npx tsx scripts/enrich.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ Falta env. Setear NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "comercial" },
});

const FILE = path.resolve(__dirname, "..", "..", "camino_sacro_seguimiento.xlsx");

// La xlsx tiene los headers desfasados respecto a los datos. Uso posiciones reales.
const COL = {
  CODE: 0,
  NAME: 1,
  PHONE: 2,
  ROUTE: 3,
  START_TEXT: 4,
  END_TEXT: 5,
  PEOPLE: 6,
  MODALITY: 7,
  STATUS: 8,
  QUOTED_AT_TEXT: 9,
  VALID_TEXT: 10,
  TOTAL: 12,
} as const;

const STATUS_MAP: Record<string, string> = {
  "Enviada": "enviada",
  "Aceptada": "aceptada",
  "Pagada": "pagada",
  "Cancelada": "cancelada",
  "Borrador": "borrador",
};

function normalizeCode(raw: string): string {
  // 'CS-2026-001' o 'CS2026001' → 'CS-2026-001'
  const m = raw.match(/CS-?(\d{4})-?(\d{3})/);
  return m ? `CS-${m[1]}-${m[2]}` : raw;
}

function tryParseDDMMYYYY(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function main() {
  console.log("Enriqueciendo cotizaciones desde seguimiento.xlsx");
  if (!fs.existsSync(FILE)) {
    console.error(`✗ ${FILE} no existe`);
    process.exit(1);
  }

  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets["Cotizaciones"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];

  // Cargar quotes existentes
  const { data: existing } = await supabase.from("quotes").select("id,code,client_name,client_phone,route_name,total_eur,status,people,modality,notes,valid_until");
  const byCode = new Map((existing || []).map((q) => [q.code, q]));

  let updated = 0, created = 0, skipped = 0;

  for (const r of rows) {
    const codeRaw = r[COL.CODE];
    if (typeof codeRaw !== "string" || !/^CS/.test(codeRaw)) continue;
    const code = normalizeCode(codeRaw);

    const name = (r[COL.NAME] ?? null) as string | null;
    const phone = (r[COL.PHONE] ?? null) as string | null;
    const route = (r[COL.ROUTE] ?? null) as string | null;
    const startText = (r[COL.START_TEXT] ?? null) as string | null;
    const endText = (r[COL.END_TEXT] ?? null) as string | null;
    const people = typeof r[COL.PEOPLE] === "number" ? (r[COL.PEOPLE] as number) : null;
    const modality = (r[COL.MODALITY] ?? null) as string | null;
    const statusRaw = (r[COL.STATUS] ?? null) as string | null;
    const status = statusRaw ? STATUS_MAP[statusRaw] || "enviada" : "enviada";
    const validText = (r[COL.VALID_TEXT] ?? null) as string | null;
    const total = typeof r[COL.TOTAL] === "number" ? (r[COL.TOTAL] as number) : null;
    const validIso = tryParseDDMMYYYY(validText);

    const fechasNote = startText && endText ? `Fechas (texto original): ${startText} → ${endText}` : startText || endText || null;

    const cur = byCode.get(code);
    const update = {
      client_name: name,
      client_phone: phone,
      route_name: route,
      people,
      modality,
      status,
      total_eur: total,
      valid_until: validIso,
      notes: fechasNote,
    };

    if (cur) {
      // Solo escribimos campos vacíos para no pisar ediciones del usuario
      const patch: Record<string, unknown> = {};
      if (!cur.client_name && update.client_name) patch.client_name = update.client_name;
      if (!cur.client_phone && update.client_phone) patch.client_phone = update.client_phone;
      if (!cur.route_name && update.route_name) patch.route_name = update.route_name;
      if (!cur.people && update.people) patch.people = update.people;
      if (!cur.modality && update.modality) patch.modality = update.modality;
      if (!cur.total_eur && update.total_eur) patch.total_eur = update.total_eur;
      if (!cur.valid_until && update.valid_until) patch.valid_until = update.valid_until;
      if (!cur.notes && update.notes) patch.notes = update.notes;

      if (Object.keys(patch).length === 0) {
        skipped++;
        continue;
      }
      const { error } = await supabase.from("quotes").update(patch).eq("id", cur.id);
      if (error) {
        console.error(`  ! ${code}: ${error.message}`);
        continue;
      }
      updated++;
      console.log(`  ↻ ${code} — ${name ?? "?"} (${Object.keys(patch).join(", ")})`);
    } else {
      const { error } = await supabase.from("quotes").insert({ code, ...update });
      if (error) {
        console.error(`  ! ${code}: ${error.message}`);
        continue;
      }
      created++;
      console.log(`  + ${code} — ${name ?? "?"}`);
    }
  }

  console.log(`\n✓ ${updated} actualizadas, ${created} creadas, ${skipped} sin cambios`);
}

main().catch((e) => {
  console.error("\n✗", e);
  process.exit(1);
});
