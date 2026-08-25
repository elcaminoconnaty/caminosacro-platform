/**
 * Siembra un post (pieza de contenido) ya armado para CADA ruta activa del catálogo, para
 * que Nico no tenga que partir de cero 27 veces.
 *
 * Por ruta se arma un carrusel 4x5 de 4 slides que SE ADAPTA a lo que esa ruta tiene:
 *   1. portada-ruta   — siempre. Con precio "desde X €" solo si el catálogo lo tiene.
 *   2. etapas-ruta     — si la ruta tiene etapas con km cargadas en comercial.route_stages.
 *      dato-grande     — si no las tiene: un dato real (km totales, días o dificultad).
 *   3. mito-realidad   — en las 3 rutas de bici (una objeción real del alquiler).
 *      tip-numerado    — en las demás: un consejo real de esa familia de Camino.
 *   4. cierre-cta      — siempre. Si la ruta no tiene precio, el motivo invita a
 *      preguntárselo a Clara en vez de repetir el CTA genérico.
 *
 * Por qué NO se importa `datosDeRuta()`/`etapasDeRuta()` de `src/lib/contenido/datos.ts`:
 * ese archivo lleva `import "server-only"`, que revienta bajo `tsx` (Node plano, sin el
 * bundler de Next). Este script replica la MISMA consulta y la MISMA fórmula de precio
 * ("desde": el mínimo `price_cs` en season='regular', prefiriendo el año de la fecha de
 * hoy y cayendo a lo que haya si ese año no está cargado) directamente en SQL, así que el
 * resultado es idéntico al que vería el editor.
 *
 *   npx tsx scripts/sembrar_posts_rutas.ts
 *
 * Idempotente: busca una pieza existente por `ruta_id` y la actualiza en vez de duplicar.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const sbComercial = createClient(URL, KEY, { db: { schema: "comercial" } });
const sbPublic = createClient(URL, KEY, { db: { schema: "public" } });

// ---------- Tipos que reflejan lo que lee el editor ----------

type RutaFila = {
  id: string;
  name: string;
  origin: string | null;
  destination: string | null;
  days: number | null;
  stages: number | null;
  km: string | null; // numeric llega como string por el driver
  modality: "senderismo" | "bici" | "mixto";
  difficulty: string | null;
  family: string | null;
  web: boolean;
};

type EtapaFila = { route_id: string; day: number; from_place: string | null; to_place: string | null; km: string | null };
type PrecioFila = { route_id: string; year: number; price_cs: string | null };

type Slide = { plantilla: string; valores: Record<string, string>; foto: null };

const ANIO_VIGENTE = new Date().getFullYear(); // hoy 2026-08-25 → 2026, igual que quoteYear(null)

// ---------- Carga en bloque (evita N+1) ----------

async function cargar() {
  const [{ data: rutas, error: e1 }, { data: etapas, error: e2 }, { data: precios, error: e3 }] = await Promise.all([
    sbComercial
      .from("routes")
      .select("id,name,origin,destination,days,stages,km,modality,difficulty,family,web")
      .eq("active", true)
      .order("name"),
    sbComercial.from("route_stages").select("route_id,day,from_place,to_place,km").order("day"),
    sbComercial.from("pricing").select("route_id,year,price_cs").eq("season", "regular").not("price_cs", "is", null),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  return { rutas: (rutas ?? []) as RutaFila[], etapas: (etapas ?? []) as EtapaFila[], precios: (precios ?? []) as PrecioFila[] };
}

/** Espejo de `precioDesde()` en src/lib/contenido/datos.ts. */
function precioDesde(precios: PrecioFila[], rutaId: string): number | null {
  const filas = precios.filter((p) => p.route_id === rutaId && p.price_cs != null);
  if (filas.length === 0) return null;
  const delAnio = filas.filter((p) => p.year === ANIO_VIGENTE);
  const usar = delAnio.length ? delAnio : filas;
  return Math.min(...usar.map((p) => Number(p.price_cs)));
}

/** Espejo de `etapasDeRuta()`: solo las etapas con km cargado, en orden. */
function etapasConKm(etapas: EtapaFila[], rutaId: string) {
  return etapas
    .filter((e) => e.route_id === rutaId && e.km != null)
    .sort((a, b) => a.day - b.day)
    .map((e) => ({ dia: e.day, desde: e.from_place ?? "", hasta: e.to_place ?? "", km: Number(e.km) }));
}

/** Espejo de la línea de datos de `datosDeRuta()`: solo con lo que existe. */
function lineaDatos(r: RutaFila): string {
  const partes: string[] = [];
  if (r.km) partes.push(`${Math.round(Number(r.km))} km`);
  if (r.days) partes.push(`${r.days} días`);
  if (r.stages) partes.push(`${r.stages} etapas`);
  return partes.join(" · ");
}

/** "Santiago de Compostela" es el mismo destino que "Santiago": lo abrevia sin inventar
 *  nada, solo para que el titular de portada quepa en el maxLargo de la plantilla. */
function destinoCorto(d: string | null): string {
  if (!d) return "Santiago";
  return d === "Santiago de Compostela" ? "Santiago" : d;
}

// ---------- Slide 1: portada-ruta (siempre) ----------

function slidePortada(r: RutaFila, precio: number | null): Slide {
  const origen = r.origin ?? r.name;
  const destino = destinoCorto(r.destination);
  const eyebrow = r.family ? `Camino ${r.family}` : r.name;

  // Ojo: portada-ruta NO lleva `whiteSpace: pre-wrap` en su titular (a diferencia de
  // cierre-cta), así que un "\n" a mano no fuerza el salto de línea — Satori lo ignora y
  // envuelve por ancho donde le queda, partiendo la frase en un punto raro. Por eso acá
  // se escribe como UNA frase natural y se deja que envuelva sola (hasta dos líneas).
  let cola: string;
  if (r.modality === "bici") {
    cola = r.days ? `, ${r.days} días en bici` : ", en bici";
  } else if (r.days) {
    cola = `, ${r.days} días caminando`;
  } else if (r.stages) {
    cola = `, ${r.stages} etapas caminando`;
  } else {
    cola = r.family ? ` por el Camino ${r.family}` : "";
  }
  const titular = `De ${origen} a ${destino}${cola}`;

  const valores: Record<string, string> = {
    ruta: r.id,
    ruta_nombre: r.name,
    eyebrow,
    titular,
    datos: lineaDatos(r),
  };
  if (precio != null) valores.precio = `desde ${Math.round(precio)} €`;

  return { plantilla: "portada-ruta", valores, foto: null };
}

// ---------- Slide 2: etapas-ruta si hay km, si no dato-grande con un hecho real ----------

/** Los 5 huecos conocidos del catálogo (ver PLAN_CONTENIDO.md): sin etapas con km. Para
 *  estos se escribió a mano un `dato-grande` con lo que sí hay, en vez de generar algo
 *  automático que sonara genérico. */
const DATO_GRANDE_A_MANO: Record<string, { numero: string; unidad: string; bajada: string }> = {
  // Espiritual desde Tui — km/días/etapas sí existen a nivel de ruta, solo faltan las
  // etapas día a día en route_stages.
  "73187297-59e5-4b03-a5a3-2d3c1874cbba": {
    numero: "146",
    unidad: "km",
    bajada: "Desde Tui hasta Santiago en 8 días y 6 etapas: la variante espiritual del Portugués, con la traslación en barco del cuerpo del Apóstol hasta Padrón.",
  },
  // Portugués Bici Oporto
  "4a4a5b3f-e791-4ef3-b52d-b9ddc43ef7e5": {
    numero: "240",
    unidad: "km",
    bajada: "De Oporto a Santiago en 7 días y 5 etapas, en bici. El Camino Portugués con menos desnivel de los tres que se pedalean.",
  },
  // Portugués desde Vigo
  "dbc28b0c-7235-49ee-b7bc-e5f9517efa3e": {
    numero: "100",
    unidad: "km",
    bajada: "De Vigo a Santiago en 6 días y 5 etapas. Cruza la ría y sube al Alto da Groba antes de entrar en Galicia interior.",
  },
  // Primitivo Bici Oviedo
  "279adae6-d531-4a8a-bd28-176d91e2fbde": {
    numero: "311",
    unidad: "km",
    bajada: "De Oviedo a Santiago en 9 días y 7 etapas, en bici. El más largo y con más desnivel de los tres Caminos que se pedalean.",
  },
  // Norte desde Vilalba — acá ni siquiera hay km ni días cargados: el único dato real es
  // la dificultad, así que es lo que se muestra.
  "7268fb8f-8ffb-43eb-bfff-217160d2887a": {
    numero: "Alta",
    unidad: "dificultad",
    bajada: "De Vilalba a Santiago por el Camino del Norte: relieve exigente y menos señalizado que el Francés. Para quien ya hizo un Camino y busca uno distinto de verdad.",
  },
};

function slideEtapasODato(r: RutaFila, etapas: ReturnType<typeof etapasConKm>): Slide {
  if (etapas.length > 0) {
    const titular = r.modality === "bici" ? "Las etapas hasta Santiago" : "Etapa por etapa";
    const nota =
      r.modality === "bici"
        ? "Ruta señalizada, con la maleta y la bici trasladadas cada día"
        : "Caminas a tu ritmo, con la maleta trasladada";
    return {
      plantilla: "etapas-ruta",
      valores: {
        ruta: r.id,
        ruta_nombre: r.name,
        titular,
        nota,
        etapas_json: JSON.stringify(etapas),
      },
      foto: null,
    };
  }

  const manual = DATO_GRANDE_A_MANO[r.id];
  const eyebrow = r.family ? `Camino ${r.family}` : r.name;
  if (manual) {
    return { plantilla: "dato-grande", valores: { eyebrow, ...manual }, foto: null };
  }
  // No debería pasar (los 5 huecos están cubiertos arriba), pero por si el catálogo cambia
  // y una ruta nueva pierde sus etapas: mejor un dato-grande genérico y verídico que nada.
  const numero = r.km ? String(Math.round(Number(r.km))) : r.days ? String(r.days) : (r.difficulty ?? "—");
  const unidad = r.km ? "km" : r.days ? "días" : "dificultad";
  return {
    plantilla: "dato-grande",
    valores: { eyebrow, numero, unidad, bajada: `${r.name}: de ${r.origin ?? "—"} a ${destinoCorto(r.destination)}.` },
    foto: null,
  };
}

// ---------- Slide 3: mito-realidad (bici) o tip-numerado (a pie), por familia ----------

const MITO_BICI: Record<string, { mito: string; realidad: string }> = {
  "23c7f506-9eee-4542-b01c-8734e8e4d215": {
    mito: "Hay que ser ciclista con experiencia para hacer el Camino en bici.",
    realidad: "Bicicleta de montaña o eléctrica según tu nivel, ruta señalizada y tu maleta viaja aparte cada día. Pedaleas, no compites.",
  },
  "4a4a5b3f-e791-4ef3-b52d-b9ddc43ef7e5": {
    mito: "En bici hay que llevar el equipaje encima como en una carrera.",
    realidad: "Tu maleta se traslada de hotel a hotel igual que a pie. En la bici solo llevas lo del día: agua, cámara, chubasquero.",
  },
  "279adae6-d531-4a8a-bd28-176d91e2fbde": {
    mito: "El Primitivo en bici es solo para quien entrena en montaña.",
    realidad: "Hay tramos exigentes, sí, y por eso está la eléctrica: mismo paisaje asturiano, con ayuda en las subidas cuando la necesitas.",
  },
};

type TipFamilia = (r: RutaFila) => { titular: string; cuerpo: string };

const TIP_POR_FAMILIA: Record<string, TipFamilia> = {
  Fisterra: (r) => ({
    titular: "El Camino no termina en Santiago",
    cuerpo: `Santiago es la meta oficial, pero el Camino de toda la vida seguía hasta el Atlántico. ${Math.round(Number(r.km ?? 0))} km más hasta el faro de Fisterra, el Km 0, donde antes se quemaba la ropa del camino.`,
  }),
  Costero: (r) => ({
    titular: "El Camino que huele a mar",
    cuerpo: `Desde ${r.origin} caminas pegado a la costa gallega: acantilados, pueblos de pescadores y menos peregrinos que en el Francés. ${r.days ?? "Varios"} días con el Atlántico casi siempre a la vista.`,
  }),
  Inglés: (r) => ({
    titular: "El Camino que llegaba en barco",
    cuerpo: `${r.name.replace("Inglés desde ", "")} recibía a los peregrinos ingleses e irlandeses que cruzaban el mar. Hoy es el más corto de los caminos históricos y uno de los menos transitados: ${r.days ?? "pocos"} días de Galicia interior sin aglomeraciones.`,
  }),
  Norte: () => ({
    titular: "El Camino de las multitudes justas",
    cuerpo: "El Camino del Norte bordea la cornisa cantábrica antes de virar hacia Santiago. Más exigente que el Francés y con una fracción de sus peregrinos: se camina en compañía del mar, no de multitudes.",
  }),
  Portugués: (r) => ({
    titular: "El Camino que cruza dos países",
    cuerpo: `${r.name} atraviesa Portugal y Galicia por caminos rurales y calzadas romanas, con menos desnivel que el Francés. ${r.days ? `${r.days} días` : "Varios días"} de aldeas, viñedos y el río Miño de fondo.`,
  }),
  Primitivo: (r) => ({
    titular: "El Camino original",
    cuerpo: `Antes de que existiera el Francés, el rey Alfonso II ya recorría esta ruta desde Oviedo: es el Camino más antiguo de todos. Atraviesa las montañas de Asturias y Lugo, ${r.days ? `${r.days} días` : "varios días"} exigentes y con mucha menos gente.`,
  }),
};

function slideTipOMito(r: RutaFila): Slide {
  if (r.modality === "bici") {
    const m = MITO_BICI[r.id];
    if (m) return { plantilla: "mito-realidad", valores: { mito: m.mito, realidad: m.realidad }, foto: null };
  }
  const familia = r.family ?? "Francés";
  const gen = TIP_POR_FAMILIA[familia] ?? TIP_POR_FAMILIA.Francés;
  const { titular, cuerpo } = gen
    ? gen(r)
    : {
        titular: "Un consejo antes de salir",
        cuerpo: `${r.name}: de ${r.origin ?? "—"} a ${destinoCorto(r.destination)}. Calzado ya domado y calcetines sin costuras: la mayoría de las molestias del Camino son ampollas evitables.`,
      };
  return { plantilla: "tip-numerado", valores: { numero: "1", titular, cuerpo }, foto: null };
}

// Francés se parte en dos ángulos: el tramo final desde Sarria (el más caminado, con
// certificado de Compostela) contra el Francés completo o los tramos largos (meseta,
// semanas de camino). Es información real distinta según cuántos días tenga la ruta.
TIP_POR_FAMILIA.Francés = (r) => {
  if (r.days != null && r.days <= 9) {
    return {
      titular: "Los últimos 100 km, los que cuentan",
      cuerpo: `Desde ${r.origin} caminas justo lo mínimo para recibir la Compostela en la Catedral: 100 km a pie. Es el tramo más caminado del Francés, con la infraestructura más rodada de todo el Camino.`,
    };
  }
  return {
    titular: "La meseta no es el enemigo",
    cuerpo: `${r.name} son ${r.days ?? "varias"} días y ${r.stages ?? "varias"} etapas, meseta castellana incluida. Es donde el Camino deja de ser paisaje y se vuelve rutina: la parte que más se recuerda al volver.`,
  };
};

// ---------- Slide 4: cierre-cta (siempre) ----------

function slideCierre(r: RutaFila, tienePrecio: boolean): Slide {
  const titular = r.modality === "bici" ? "Deja de investigar.\nEmpieza a pedalear." : "Deja de investigar.\nEmpieza a caminar.";
  const motivo = tienePrecio
    ? "En 4 preguntas te dice cuál es tu Camino y cuánto cuesta"
    : "Pregúntale a Clara el precio de esta ruta y arma tu itinerario";
  return { plantilla: "cierre-cta", valores: { titular, motivo }, foto: null };
}

// ---------- Orquestación ----------

async function main() {
  const { rutas, etapas, precios } = await cargar();
  console.log(`${rutas.length} rutas activas en el catálogo.\n`);

  let creadas = 0;
  let actualizadas = 0;

  for (const r of rutas) {
    const precio = precioDesde(precios, r.id);
    const etapasRuta = etapasConKm(etapas, r.id);

    const slides: Slide[] = [
      slidePortada(r, precio),
      slideEtapasODato(r, etapasRuta),
      slideTipOMito(r),
      slideCierre(r, precio != null),
    ];

    const fila = {
      titulo: r.name,
      formato: "4x5",
      estado: "borrador",
      ruta_id: r.id,
      slides,
    };

    const { data: existente, error: errBusqueda } = await sbPublic
      .from("contenido_piezas")
      .select("id")
      .eq("ruta_id", r.id)
      .maybeSingle();
    if (errBusqueda) {
      console.error(`  ✗ ${r.name}: ${errBusqueda.message}`);
      continue;
    }

    if (existente) {
      const { error } = await sbPublic.from("contenido_piezas").update(fila).eq("id", existente.id);
      if (error) console.error(`  ✗ ${r.name} (update): ${error.message}`);
      else {
        actualizadas++;
        console.log(`  ↻ ${r.name}  (${slides.length} slides, ${existente.id})`);
      }
    } else {
      const { error } = await sbPublic.from("contenido_piezas").insert(fila);
      if (error) console.error(`  ✗ ${r.name} (insert): ${error.message}`);
      else {
        creadas++;
        console.log(`  ✓ ${r.name}  (${slides.length} slides)`);
      }
    }
  }

  console.log(`\n${creadas} piezas creadas, ${actualizadas} actualizadas.`);
  const { count } = await sbPublic.from("contenido_piezas").select("id", { count: "exact", head: true }).not("ruta_id", "is", null);
  console.log(`${count} piezas con ruta_id en total en la base.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
