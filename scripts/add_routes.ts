/**
 * Carga rutas adicionales del Camino con sus etapas completas.
 * Datos basados en itinerarios estándar de Pilgrim y Federación de Asociaciones del Camino.
 *
 * Uso: npx tsx scripts/add_routes.ts
 */
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("✗ Falta env.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "comercial" },
});

type Stage = { day: number; from: string; to: string; km: number; alojamiento: string };
type Route = {
  slug: string;
  name: string;
  family: string;
  origin: string;
  destination: string;
  days: number;
  modality: "senderismo" | "bici";
  difficulty: string;
  stages: Stage[];
};

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

// =============================================================
// CAMINO FRANCÉS — itinerario completo desde Saint Jean Pied de Port
// =============================================================
const FRANCES_MASTER: Stage[] = [
  { day: 1, from: "Saint Jean Pied de Port", to: "Roncesvalles", km: 25.1, alojamiento: "Roncesvalles" },
  { day: 2, from: "Roncesvalles", to: "Zubiri", km: 21.8, alojamiento: "Zubiri" },
  { day: 3, from: "Zubiri", to: "Pamplona", km: 20.9, alojamiento: "Pamplona" },
  { day: 4, from: "Pamplona", to: "Puente la Reina", km: 23.8, alojamiento: "Puente la Reina" },
  { day: 5, from: "Puente la Reina", to: "Estella", km: 21.9, alojamiento: "Estella" },
  { day: 6, from: "Estella", to: "Los Arcos", km: 21.5, alojamiento: "Los Arcos" },
  { day: 7, from: "Los Arcos", to: "Logroño", km: 27.6, alojamiento: "Logroño" },
  { day: 8, from: "Logroño", to: "Nájera", km: 29.4, alojamiento: "Nájera" },
  { day: 9, from: "Nájera", to: "Santo Domingo de la Calzada", km: 21, alojamiento: "Santo Domingo" },
  { day: 10, from: "Santo Domingo", to: "Belorado", km: 22.9, alojamiento: "Belorado" },
  { day: 11, from: "Belorado", to: "San Juan de Ortega", km: 24, alojamiento: "San Juan de Ortega" },
  { day: 12, from: "San Juan de Ortega", to: "Burgos", km: 25.8, alojamiento: "Burgos" },
  { day: 13, from: "Burgos", to: "Hornillos del Camino", km: 21.1, alojamiento: "Hornillos" },
  { day: 14, from: "Hornillos", to: "Castrojeriz", km: 19.9, alojamiento: "Castrojeriz" },
  { day: 15, from: "Castrojeriz", to: "Frómista", km: 24.7, alojamiento: "Frómista" },
  { day: 16, from: "Frómista", to: "Carrión de los Condes", km: 19.3, alojamiento: "Carrión" },
  { day: 17, from: "Carrión", to: "Terradillos de los Templarios", km: 26.6, alojamiento: "Terradillos" },
  { day: 18, from: "Terradillos", to: "Bercianos del Real Camino", km: 23.7, alojamiento: "Bercianos" },
  { day: 19, from: "Bercianos", to: "Mansilla de las Mulas", km: 26.3, alojamiento: "Mansilla" },
  { day: 20, from: "Mansilla", to: "León", km: 18.5, alojamiento: "León" },
  { day: 21, from: "León", to: "San Martín del Camino", km: 24.6, alojamiento: "San Martín" },
  { day: 22, from: "San Martín", to: "Astorga", km: 24.1, alojamiento: "Astorga" },
  { day: 23, from: "Astorga", to: "Foncebadón", km: 25.9, alojamiento: "Foncebadón" },
  { day: 24, from: "Foncebadón", to: "Ponferrada", km: 27.4, alojamiento: "Ponferrada" },
  { day: 25, from: "Ponferrada", to: "Villafranca del Bierzo", km: 24.2, alojamiento: "Villafranca" },
  { day: 26, from: "Villafranca", to: "O Cebreiro", km: 28.4, alojamiento: "O Cebreiro" },
  { day: 27, from: "O Cebreiro", to: "Triacastela", km: 21.4, alojamiento: "Triacastela" },
  { day: 28, from: "Triacastela", to: "Sarria", km: 18.4, alojamiento: "Sarria" },
  { day: 29, from: "Sarria", to: "Portomarín", km: 22.4, alojamiento: "Portomarín" },
  { day: 30, from: "Portomarín", to: "Palas de Rei", km: 24.8, alojamiento: "Palas de Rei" },
  { day: 31, from: "Palas de Rei", to: "Arzúa", km: 28.5, alojamiento: "Arzúa" },
  { day: 32, from: "Arzúa", to: "Pedrouzo", km: 19.3, alojamiento: "Pedrouzo" },
  { day: 33, from: "Pedrouzo", to: "Santiago de Compostela", km: 19.4, alojamiento: "Santiago" },
];

// =============================================================
// CAMINO PORTUGUÉS CENTRAL — desde Lisboa
// =============================================================
const PORTUGUES_CENTRAL_MASTER: Stage[] = [
  { day: 1, from: "Lisboa", to: "Vila Franca de Xira", km: 32, alojamiento: "Vila Franca" },
  { day: 2, from: "Vila Franca", to: "Azambuja", km: 19.5, alojamiento: "Azambuja" },
  { day: 3, from: "Azambuja", to: "Santarém", km: 31.5, alojamiento: "Santarém" },
  { day: 4, from: "Santarém", to: "Golegã", km: 32, alojamiento: "Golegã" },
  { day: 5, from: "Golegã", to: "Tomar", km: 30.5, alojamiento: "Tomar" },
  { day: 6, from: "Tomar", to: "Alvaiázere", km: 32, alojamiento: "Alvaiázere" },
  { day: 7, from: "Alvaiázere", to: "Rabaçal", km: 32, alojamiento: "Rabaçal" },
  { day: 8, from: "Rabaçal", to: "Coimbra", km: 27.5, alojamiento: "Coimbra" },
  { day: 9, from: "Coimbra", to: "Mealhada", km: 23.5, alojamiento: "Mealhada" },
  { day: 10, from: "Mealhada", to: "Águeda", km: 25, alojamiento: "Águeda" },
  { day: 11, from: "Águeda", to: "Albergaria-a-Velha", km: 16, alojamiento: "Albergaria" },
  { day: 12, from: "Albergaria", to: "São João da Madeira", km: 28.5, alojamiento: "São João" },
  { day: 13, from: "São João da Madeira", to: "Porto", km: 32, alojamiento: "Porto" },
  { day: 14, from: "Porto", to: "Vairão", km: 26, alojamiento: "Vairão" },
  { day: 15, from: "Vairão", to: "Barcelos", km: 28, alojamiento: "Barcelos" },
  { day: 16, from: "Barcelos", to: "Ponte de Lima", km: 33, alojamiento: "Ponte de Lima" },
  { day: 17, from: "Ponte de Lima", to: "Rubiães", km: 17.5, alojamiento: "Rubiães" },
  { day: 18, from: "Rubiães", to: "Tui", km: 19, alojamiento: "Tui" },
  { day: 19, from: "Tui", to: "O Porriño", km: 18.6, alojamiento: "O Porriño" },
  { day: 20, from: "O Porriño", to: "Redondela", km: 15.3, alojamiento: "Redondela" },
  { day: 21, from: "Redondela", to: "Pontevedra", km: 19.2, alojamiento: "Pontevedra" },
  { day: 22, from: "Pontevedra", to: "Caldas de Reis", km: 21.1, alojamiento: "Caldas de Reis" },
  { day: 23, from: "Caldas de Reis", to: "Padrón", km: 18.5, alojamiento: "Padrón" },
  { day: 24, from: "Padrón", to: "Santiago de Compostela", km: 25.2, alojamiento: "Santiago" },
];

// =============================================================
// CAMINO PORTUGUÉS COSTERO — desde Porto
// =============================================================
const PORTUGUES_COSTERO_MASTER: Stage[] = [
  { day: 1, from: "Porto", to: "Vila do Conde", km: 27.5, alojamiento: "Vila do Conde" },
  { day: 2, from: "Vila do Conde", to: "Esposende", km: 23, alojamiento: "Esposende" },
  { day: 3, from: "Esposende", to: "Viana do Castelo", km: 24.5, alojamiento: "Viana do Castelo" },
  { day: 4, from: "Viana do Castelo", to: "Vila Praia de Âncora", km: 19, alojamiento: "Âncora" },
  { day: 5, from: "Âncora", to: "A Guarda", km: 13.5, alojamiento: "A Guarda" },
  { day: 6, from: "A Guarda", to: "Oia", km: 16, alojamiento: "Oia" },
  { day: 7, from: "Oia", to: "Baiona", km: 14, alojamiento: "Baiona" },
  { day: 8, from: "Baiona", to: "Vigo", km: 24, alojamiento: "Vigo" },
  { day: 9, from: "Vigo", to: "Redondela", km: 16, alojamiento: "Redondela" },
  { day: 10, from: "Redondela", to: "Pontevedra", km: 19, alojamiento: "Pontevedra" },
  { day: 11, from: "Pontevedra", to: "Caldas de Reis", km: 21, alojamiento: "Caldas de Reis" },
  { day: 12, from: "Caldas de Reis", to: "Padrón", km: 18.5, alojamiento: "Padrón" },
  { day: 13, from: "Padrón", to: "Santiago de Compostela", km: 25, alojamiento: "Santiago" },
];

// =============================================================
// CAMINO PRIMITIVO — desde Oviedo
// =============================================================
const PRIMITIVO_MASTER: Stage[] = [
  { day: 1, from: "Oviedo", to: "Grado", km: 25.5, alojamiento: "Grado" },
  { day: 2, from: "Grado", to: "Salas", km: 21.5, alojamiento: "Salas" },
  { day: 3, from: "Salas", to: "Tineo", km: 20, alojamiento: "Tineo" },
  { day: 4, from: "Tineo", to: "Pola de Allande", km: 27, alojamiento: "Pola de Allande" },
  { day: 5, from: "Pola de Allande", to: "Berducedo", km: 19, alojamiento: "Berducedo" },
  { day: 6, from: "Berducedo", to: "Grandas de Salime", km: 20, alojamiento: "Grandas de Salime" },
  { day: 7, from: "Grandas de Salime", to: "A Fonsagrada", km: 25.5, alojamiento: "A Fonsagrada" },
  { day: 8, from: "A Fonsagrada", to: "O Cádavo", km: 24, alojamiento: "O Cádavo" },
  { day: 9, from: "O Cádavo", to: "Lugo", km: 30, alojamiento: "Lugo" },
  { day: 10, from: "Lugo", to: "San Romao", km: 20.6, alojamiento: "San Romao" },
  { day: 11, from: "San Romao", to: "Melide", km: 22.8, alojamiento: "Melide" },
  { day: 12, from: "Melide", to: "Arzúa", km: 14.3, alojamiento: "Arzúa" },
  { day: 13, from: "Arzúa", to: "Pedrouzo", km: 19, alojamiento: "Pedrouzo" },
  { day: 14, from: "Pedrouzo", to: "Santiago de Compostela", km: 19.5, alojamiento: "Santiago" },
];

// =============================================================
// CAMINO INGLÉS — desde Ferrol (5 etapas) y desde A Coruña (4 etapas)
// =============================================================
const INGLES_FERROL: Stage[] = [
  { day: 1, from: "Ferrol", to: "Pontedeume", km: 28, alojamiento: "Pontedeume" },
  { day: 2, from: "Pontedeume", to: "Betanzos", km: 20, alojamiento: "Betanzos" },
  { day: 3, from: "Betanzos", to: "Hospital de Bruma", km: 25, alojamiento: "Hospital de Bruma" },
  { day: 4, from: "Hospital de Bruma", to: "Sigüeiro", km: 22, alojamiento: "Sigüeiro" },
  { day: 5, from: "Sigüeiro", to: "Santiago de Compostela", km: 16, alojamiento: "Santiago" },
];
const INGLES_CORUNA: Stage[] = [
  { day: 1, from: "A Coruña", to: "Hospital de Bruma", km: 31, alojamiento: "Hospital de Bruma" },
  { day: 2, from: "Hospital de Bruma", to: "Sigüeiro", km: 22, alojamiento: "Sigüeiro" },
  { day: 3, from: "Sigüeiro", to: "Santiago de Compostela", km: 16, alojamiento: "Santiago" },
];

// =============================================================
// Helper: dado un master + start_place, devuelve etapas renumeradas
// =============================================================
function sliceFromStart(master: Stage[], startFrom: string): Stage[] {
  const startIdx = master.findIndex((s) => s.from === startFrom);
  if (startIdx === -1) {
    console.warn(`! No encontré start "${startFrom}" en master`);
    return master.slice();
  }
  return master.slice(startIdx).map((s, i) => ({ ...s, day: i + 1 }));
}

function totalKm(stages: Stage[]): number {
  return Math.round(stages.reduce((s, x) => s + x.km, 0));
}

// =============================================================
// Definición de rutas a cargar
// =============================================================
const ROUTES: Route[] = [
  // FRANCÉS
  {
    slug: "frances_desde_saint_jean", family: "Francés",
    name: "Francés desde Saint Jean Pied de Port",
    origin: "Saint Jean Pied de Port", destination: "Santiago",
    days: FRANCES_MASTER.length, modality: "senderismo", difficulty: "Media-Alta",
    stages: FRANCES_MASTER,
  },
  {
    slug: "frances_desde_pamplona", family: "Francés",
    name: "Francés desde Pamplona",
    origin: "Pamplona", destination: "Santiago",
    days: 30, modality: "senderismo", difficulty: "Media",
    stages: sliceFromStart(FRANCES_MASTER, "Pamplona"),
  },
  {
    slug: "frances_desde_logrono", family: "Francés",
    name: "Francés desde Logroño",
    origin: "Logroño", destination: "Santiago",
    days: 26, modality: "senderismo", difficulty: "Media",
    stages: sliceFromStart(FRANCES_MASTER, "Logroño"),
  },
  {
    slug: "frances_desde_burgos", family: "Francés",
    name: "Francés desde Burgos",
    origin: "Burgos", destination: "Santiago",
    days: 21, modality: "senderismo", difficulty: "Media",
    stages: sliceFromStart(FRANCES_MASTER, "Burgos"),
  },
  {
    slug: "frances_desde_leon", family: "Francés",
    name: "Francés desde León",
    origin: "León", destination: "Santiago",
    days: 13, modality: "senderismo", difficulty: "Media",
    stages: sliceFromStart(FRANCES_MASTER, "León"),
  },
  {
    slug: "frances_desde_astorga", family: "Francés",
    name: "Francés desde Astorga",
    origin: "Astorga", destination: "Santiago",
    days: 11, modality: "senderismo", difficulty: "Media",
    stages: sliceFromStart(FRANCES_MASTER, "Astorga"),
  },
  {
    slug: "frances_desde_ponferrada", family: "Francés",
    name: "Francés desde Ponferrada",
    origin: "Ponferrada", destination: "Santiago",
    days: 8, modality: "senderismo", difficulty: "Media",
    stages: sliceFromStart(FRANCES_MASTER, "Ponferrada"),
  },

  // PORTUGUÉS CENTRAL
  {
    slug: "portugues_desde_lisboa", family: "Portugués",
    name: "Portugués desde Lisboa",
    origin: "Lisboa", destination: "Santiago",
    days: PORTUGUES_CENTRAL_MASTER.length, modality: "senderismo", difficulty: "Media",
    stages: PORTUGUES_CENTRAL_MASTER,
  },
  {
    slug: "portugues_desde_porto", family: "Portugués",
    name: "Portugués desde Porto",
    origin: "Porto", destination: "Santiago",
    days: 12, modality: "senderismo", difficulty: "Media",
    stages: sliceFromStart(PORTUGUES_CENTRAL_MASTER, "Porto"),
  },

  // COSTERO
  {
    slug: "costero_desde_porto", family: "Costero",
    name: "Costero desde Porto",
    origin: "Porto", destination: "Santiago",
    days: PORTUGUES_COSTERO_MASTER.length, modality: "senderismo", difficulty: "Media",
    stages: PORTUGUES_COSTERO_MASTER,
  },
  {
    slug: "costero_desde_vigo", family: "Costero",
    name: "Costero desde Vigo",
    origin: "Vigo", destination: "Santiago",
    days: 6, modality: "senderismo", difficulty: "Media",
    stages: sliceFromStart(PORTUGUES_COSTERO_MASTER, "Vigo"),
  },

  // PRIMITIVO
  {
    slug: "primitivo_desde_oviedo_a_pie", family: "Primitivo",
    name: "Primitivo desde Oviedo",
    origin: "Oviedo", destination: "Santiago",
    days: PRIMITIVO_MASTER.length, modality: "senderismo", difficulty: "Alta",
    stages: PRIMITIVO_MASTER,
  },

  // INGLÉS desde A Coruña
  {
    slug: "ingles_desde_coruna", family: "Inglés",
    name: "Inglés desde A Coruña",
    origin: "A Coruña", destination: "Santiago",
    days: INGLES_CORUNA.length, modality: "senderismo", difficulty: "Media",
    stages: INGLES_CORUNA,
  },
];

// =============================================================
async function loadRoute(r: Route) {
  const { data: route, error } = await supabase
    .from("routes")
    .upsert(
      {
        slug: r.slug, name: r.name, family: r.family,
        origin: r.origin, destination: r.destination,
        days: r.days, nights: r.days - 1, stages: r.stages.length,
        km: totalKm(r.stages), modality: r.modality, difficulty: r.difficulty,
        active: true,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (error) throw error;

  // Etapas: borramos y reinsertamos (limpio)
  await supabase.from("route_stages").delete().eq("route_id", route!.id);
  if (r.stages.length > 0) {
    const rows = r.stages.map((s) => ({
      route_id: route!.id, day: s.day, from_place: s.from, to_place: s.to,
      km: s.km, accommodation: s.alojamiento,
    }));
    const { error: e2 } = await supabase.from("route_stages").insert(rows);
    if (e2) throw e2;
  }
  console.log(`  ✓ ${r.name} (${r.stages.length} etapas, ${totalKm(r.stages)} km)`);
}

async function main() {
  console.log(`Cargando ${ROUTES.length} rutas con etapas completas`);
  for (const r of ROUTES) {
    await loadRoute(r);
  }
  console.log("\n✓ Listo");
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
