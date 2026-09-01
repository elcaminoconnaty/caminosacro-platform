/**
 * Carga los seis alojamientos del Sarria → Santiago en el catálogo de hoteles.
 *
 * Datos y fotos: la documentación de viaje de Pilgrim del expediente A47397
 * (Sarria → Santiago, septiembre de 2026). Son los alojamientos que Pilgrim usa de
 * forma habitual en ese tramo, así que sirven de arranque del catálogo; cualquiera se
 * edita después desde /hoteles.
 *
 * Idempotente: si el slug ya existe, actualiza la ficha y NO vuelve a subir las fotos.
 *
 *   FOTOS_DIR=/ruta/con/h-001.jpg npx tsx --env-file=.env.local scripts/seed_hoteles_sarria_santiago.ts
 *
 * Las fotos se extraen del PDF de Pilgrim con:
 *   pdfimages -f 3 -l 6 -j -png "Documento_Viaje_A47397.pdf" h
 * y quedan en grupos de tres por alojamiento, en el orden del documento.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const FOTOS_DIR = process.env.FOTOS_DIR || "";

const HOTELES = [
  {
    slug: "siete-en-el-camino",
    name: "Siete en el Camino",
    city: "Sarria",
    category: "pension",
    address: "Camiño de Pintin, 10, 27600 Sarria",
    phone: "+34 615 334 367",
    email: "info@sieteenelcamino.com",
    notes:
      "Horario de desayunos: a partir de las 6:30. El desayuno se sirve en un restaurante cercano. " +
      "Horario de check-in: a partir de las 12:00. No hay recepción 24 h, por lo que debe avisar al " +
      "alojamiento si llega tarde. Horario de check-out: a las 10:00.",
    fotos: ["h-001.jpg", "h-002.jpg", "h-003.jpg"],
  },
  {
    slug: "pension-mar",
    name: "Pensión Mar",
    city: "Portomarín",
    category: "pension",
    address: "Rúa Fraga Iribarne, 5, 27170 Portomarín",
    phone: "+34 622 611 211",
    email: "info@pensionmar.com",
    notes: "Horario de desayunos: a partir de las 7:00.",
    fotos: ["h-004.jpg", "h-005.jpg", "h-006.jpg"],
  },
  {
    slug: "pension-a-fonte",
    name: "Pensión A Fonte",
    city: "Palas de Rei",
    category: "pension",
    address: "Av. Compostela, 24, 27200 Palas de Rei, Lugo",
    phone: "+34 671 231 991",
    email: "info@pensionafonte.com",
    notes:
      "Horario de desayuno de 06:00 a 09:00, ofrecido por el proveedor externo Bar Britania, a 30 metros " +
      "de la pensión. Horario de entrada: de 12:00 a 18:00.",
    fotos: ["h-007.jpg", "h-008.jpg", "h-009.jpg"],
  },
  {
    slug: "pension-o-retiro",
    name: "Pensión O Retiro",
    city: "Arzúa",
    category: "pension",
    address: "Rúa Lugo, s/n, 15810 Arzúa, A Coruña",
    phone: "+34 981 500 554",
    email: "oretiroarzua@gmail.com",
    notes: "Horario de desayuno: a partir de las 06:00.",
    fotos: ["h-010.jpg", "h-011.jpg", "h-012.jpg"],
  },
  {
    slug: "pension-rosella",
    name: "Pensión Rosella",
    city: "O Pedrouzo (O Pino)",
    category: "pension",
    address: "Avenida de Lugo 21 2D, 15821 O Pedrouzo",
    phone: "+34 600 350 346",
    email: "pensionrosella@gmail.com",
    notes:
      "Horario de desayunos: a partir de las 6:00. Si viaja con bicicleta deberá realizar el check-in " +
      "antes de las 17:00.",
    fotos: ["h-013.jpg", "h-014.jpg", "h-015.jpg"],
  },
  {
    slug: "hostal-suso",
    name: "Hostal Suso",
    city: "Santiago de Compostela",
    category: "hostal",
    address: "Rúa do Vilar 65-1º, 15705 Santiago de Compostela",
    phone: "+34 981 586 611",
    email: "hostalsuso@gmail.com",
    notes:
      "Horario de desayunos: de 7:30 a 11:30. El alojamiento ofrece desayuno tipo picnic para llevar; " +
      "solicítelo en recepción. Horario de check-in: de 14:00 a 21:00; si llega más tarde debe contactar " +
      "al alojamiento. No dispone de ascensor. En caso de llevar bicicleta debe entregarla antes de ir al " +
      "alojamiento, pues no tienen espacio para guardarlas. Está a 300 metros de la catedral. " +
      "Tasa turística: 1,65 € por persona y día (excepto menores de edad), de pago directo en el alojamiento.",
    fotos: ["h-016.jpg", "h-017.jpg", "h-018.jpg"],
  },
];

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "comercial" },
});

async function main() {
  for (const h of HOTELES) {
    const { fotos, ...ficha } = h;

    const { data: ya } = await db.from("hotels").select("id,photos").eq("slug", h.slug).maybeSingle();

    let id: string;
    if (ya) {
      const { error } = await db.from("hotels").update(ficha).eq("id", ya.id);
      if (error) throw error;
      id = ya.id as string;
      const tiene = ((ya.photos as unknown[]) || []).length;
      if (tiene > 0) {
        console.log(`· ${h.name}: ficha actualizada (ya tenía ${tiene} fotos, no se tocan)`);
        continue;
      }
    } else {
      const { data, error } = await db.from("hotels").insert(ficha).select("id").single();
      if (error) throw error;
      id = data.id as string;
    }

    if (!FOTOS_DIR) {
      console.log(`✓ ${h.name}: ficha lista (sin FOTOS_DIR, no se suben fotos)`);
      continue;
    }

    const subidas: { path: string; position: number }[] = [];
    for (const [i, nombre] of fotos.entries()) {
      const origen = path.join(FOTOS_DIR, nombre);
      if (!existsSync(origen)) {
        console.warn(`  ! falta ${origen}`);
        continue;
      }
      const destino = `comercial-hotel-fotos/${h.slug}/${i + 1}.jpg`;
      const { error } = await db.storage
        .from("comercial-hotel-fotos")
        .upload(destino.split("/").slice(1).join("/"), readFileSync(origen), {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (error) throw error;
      subidas.push({ path: destino, position: i });
    }

    const { error: upErr } = await db.from("hotels").update({ photos: subidas }).eq("id", id);
    if (upErr) throw upErr;
    console.log(`✓ ${h.name}: ficha y ${subidas.length} fotos`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
