// Humo: renderiza los dos PDF nuevos contra los datos reales y los deja en /tmp.
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { AsistenciaPDF } from "../src/lib/asistenciaPdf";
import { TravelDocPDF } from "../src/lib/travelDocPdf";

const OUT = process.env.SMOKE_OUT || "/tmp";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "comercial" },
});

async function main() {
  const { data: a } = await db.from("settings").select("value").eq("key", "asistencia_viaje").maybeSingle();
  const asis = await renderToBuffer(React.createElement(AsistenciaPDF as never, { texts: a!.value }) as never);
  writeFileSync(`${OUT}/asistencia.pdf`, asis);
  console.log("asistencia.pdf", asis.length, "bytes");

  const { data: t } = await db.from("settings").select("value").eq("key", "travel_doc").maybeSingle();
  const cover = readFileSync("src/lib/cover.jpg");
  const doc = await renderToBuffer(
    React.createElement(TravelDocPDF as never, {
      quote: {
        code: "CS-2026-034", client_name: "AMALIA MATALLANA", client_phone: "+57 350 567 0378",
        client_email: "amalia@ejemplo.com", route_name: "Camino Francés — Sarria a Santiago",
        start_date: "2026-09-24", end_date: "2026-09-30", people: 1, modality: "Pensión individual",
      },
      nights: [
        { day: 1, night_date: "2026-09-24", stage_label: "Sarria", km: null, city: "Sarria",
          hotel_name: "Siete en el Camino", category: "Pensión", address: "Camiño de Pintin, 10, 27600 Sarria",
          phone: "+34 615 334 367", email: "info@sieteenelcamino.com", room_label: "1 Habitación individual",
          regimen: "AD", hotel_notes: "Horario de desayunos: a partir de las 6:30. El desayuno se sirve en un restaurante cercano. Check-in a partir de las 12:00. No hay recepción 24 h, avisa si llegas tarde. Check-out a las 10:00.",
          night_notes: null, photos: [] },
        { day: 2, night_date: "2026-09-25", stage_label: "Sarria - Portomarín", km: 22.2, city: "Portomarín",
          hotel_name: "Pensión Mar", category: "Pensión", address: "Rúa Fraga Iribarne, 5, 27170 Portomarín",
          phone: "+34 622 611 211", email: "info@pensionmar.com", room_label: "1 Habitación individual",
          regimen: "AD", hotel_notes: "Horario de desayunos: a partir de las 7:00.", night_notes: "Llegada prevista tarde: avisada al alojamiento.", photos: [] },
      ],
      texts: t!.value,
      services: ["asistencia_telefonica", "credencial", "seguro", "mochilas"],
      coverImage: cover,
    }) as never,
  );
  writeFileSync(`${OUT}/documento-viaje.pdf`, doc);
  console.log("documento-viaje.pdf", doc.length, "bytes");
}
main().catch((e) => { console.error(e); process.exit(1); });
