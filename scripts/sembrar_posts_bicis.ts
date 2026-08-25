/**
 * Siembra los posts de bicicletas: lo que le falta a las 3 rutas de bici que ya sembró
 * `sembrar_posts_rutas.ts` (esos posts hablan de la RUTA; estos hablan de la BICI).
 *
 * Dos piezas, con los datos que de verdad hay en `comercial.bikes` / `comercial.bike_prices`:
 *
 *   1. "La flota" — un carrusel de 9 slides, uno por cada una de las 7 bicicletas reales
 *      (ficha + foto ya subida en Etapa previa a `contenido-fotos`), con portada y cierre.
 *      Sin ruta_id: no es de una ruta, es del catálogo completo de bicis.
 *
 *   2. "Precio del alquiler — Francés Bici Ponferrada" — SOLO esta ruta tiene las 7
 *      tarifas cargadas en `comercial.bike_prices` (las otras dos rutas de bici no
 *      tienen ninguna: no se inventan). Un slide por bici con su precio real + un slide
 *      de la fianza (`FIANZA_POR_BICI_EUR`, real, de `src/lib/bikes/catalog.ts`).
 *
 * Plantillas elegidas a propósito tras revisar el render con los ojos:
 *   - Las portadas (slide 0 de cada pieza) van SIN foto. Las 7 fotos de bici son tomas de
 *     estudio sobre fondo gris claro, y portada-ruta solo oscurece la foto con un degradado
 *     que en la parte de ARRIBA queda casi transparente (25%) — pensado para fotos de
 *     paisaje, no para un fondo claro de estudio. Con esas fotos el logo y el eyebrow de la
 *     cabecera quedaban casi ilegibles. Sin foto, portada-ruta cae al degradado de marca:
 *     100% legible y sigue vendiendo bien la idea.
 *   - Las tarjetas de "La flota" van en `ficha-bici` (id, modelo, tipo, descripción; sin
 *     catálogo de rutas): apareció en el repo, de otro agente, MIENTRAS se escribía este
 *     script, y resulta que resuelve el mismo problema de contraste con una banda propia
 *     detrás de la cabecera — así que se adoptó en vez de mantener el rodeo original.
 *   - Las tarjetas de precio van en `dato-grande` (no tiene campo de precio ficha-bici):
 *     esa plantilla tapa la foto completa con un velo PLANO de 72% en cuanto hay foto y no
 *     se eligió un velo a mano, así que la cabecera queda legible en cualquier punto de la
 *     imagen, y el precio real de cada bici sale como "número grande".
 * Ver Notas de esta siembra en PLAN_CONTENIDO.md para el detalle de cómo se detectó y probó.
 *
 *   npx tsx scripts/sembrar_posts_bicis.ts
 *
 * Idempotente: busca la pieza existente por `titulo` (no hay ruta_id que las identifique,
 * son piezas de catálogo, no de ruta) y la actualiza en vez de duplicar.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { FIANZA_POR_BICI_EUR } from "../src/lib/bikes/catalog";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const sbComercial = createClient(URL, KEY, { db: { schema: "comercial" } });
const sbPublic = createClient(URL, KEY, { db: { schema: "public" } });

const RUTA_PONFERRADA_ID = "23c7f506-9eee-4542-b01c-8734e8e4d215"; // Francés Bici Ponferrada
const ANIO_VIGENTE = new Date().getFullYear();

type Slide = { plantilla: string; valores: Record<string, string>; foto: { url: string; origen: "subida" } | null };

type BikeFila = {
  id: string;
  slug: string;
  name: string;
  category_label: string;
  tagline: string | null;
  photo: string | null;
  position: number;
};

// Etiquetas cortas para el eyebrow (maxLargo 32): `category_label` de la base se pasa de
// largo en dos casos ("Eléctrica doble suspensión · E-Bike" = 36, "MTB de carbono y doble
// suspensión" = 34), así que acá van las versiones que sí caben, sin inventar nada nuevo.
const EYEBROW_POR_SLUG: Record<string, string> = {
  mtb: "MTB · Montaña",
  gravel: "Gravel",
  mtb_doble_suspension: "MTB doble suspensión",
  mtb_carbono: "MTB de carbono",
  mtb_carbono_doble_suspension: "MTB carbono · doble susp",
  ebike: "Eléctrica · E-Bike",
  ebike_doble_suspension: "Eléctrica · doble susp.",
};

/**
 * Descripción corta por bici (maxLargo 90 de `ficha-bici`), con un dato real de
 * `comercial.bikes.specs`/`motor`/`luggage` leído a mano — son solo 7. NO se copia
 * `description`/`ideal_para` de la base: esos campos vienen en voseo rioplatense
 * ("buscás", "querés"), que la estrategia de marca prohíbe expresamente.
 */
const DESCRIPCION_FICHA_POR_SLUG: Record<string, string> = {
  mtb: "Robusta y polivalente, con ruedas casi imposibles de pinchar. Alforjas de 20 L.",
  gravel: "Ligera y cómoda en asfalto y en tierra. Alforjas de 15 L y buen ritmo.",
  mtb_doble_suspension: "Doble suspensión para bajadas y tramos técnicos. 120 mm de recorrido.",
  mtb_carbono: "Cuadro de carbono ultraligero: la más rápida de la flota.",
  mtb_carbono_doble_suspension: "Carbono y doble suspensión: control total en el tramo más exigente.",
  ebike: "La más elegida por los peregrinos. 630 Wh de batería para cada cuesta.",
  ebike_doble_suspension: "Doble suspensión eléctrica, 720 Wh: para los tramos más rotos del Camino.",
};

async function cargar() {
  const [{ data: bikes, error: e1 }, { data: fotos, error: e2 }, { data: precios, error: e3 }] = await Promise.all([
    sbComercial
      .from("bikes")
      .select("id,slug,name,category_label,tagline,photo,position")
      .eq("active", true)
      .order("position"),
    sbPublic.from("contenido_fotos").select("storage_path,public_url").eq("ruta_tag", "bicis"),
    sbComercial
      .from("bike_prices")
      .select("bike_id,price_cs,days,year")
      .eq("route_id", RUTA_PONFERRADA_ID)
      .not("price_cs", "is", null),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  return {
    bikes: (bikes ?? []) as BikeFila[],
    fotos: (fotos ?? []) as { storage_path: string; public_url: string }[],
    precios: (precios ?? []) as { bike_id: string; price_cs: string | null; days: number | null; year: number }[],
  };
}

async function existente(titulo: string): Promise<string | null> {
  const { data } = await sbPublic.from("contenido_piezas").select("id").eq("titulo", titulo).is("ruta_id", null).maybeSingle();
  return data?.id ?? null;
}

async function guardar(titulo: string, slides: Slide[]) {
  const fila = { titulo, formato: "4x5", estado: "borrador", ruta_id: null, slides };
  const id = await existente(titulo);
  if (id) {
    const { error } = await sbPublic.from("contenido_piezas").update(fila).eq("id", id);
    if (error) console.error(`  ✗ ${titulo} (update): ${error.message}`);
    else console.log(`  ↻ ${titulo}  (${slides.length} slides, ${id})`);
  } else {
    const { error } = await sbPublic.from("contenido_piezas").insert(fila);
    if (error) console.error(`  ✗ ${titulo} (insert): ${error.message}`);
    else console.log(`  ✓ ${titulo}  (${slides.length} slides)`);
  }
}

async function main() {
  const { bikes, fotos, precios } = await cargar();
  console.log(`${bikes.length} bicicletas activas · ${fotos.length} fotos con ruta_tag=bicis · ${precios.length} tarifas en Ponferrada.\n`);

  const fotoDe = (photo: string | null): Slide["foto"] => {
    if (!photo) return null;
    const f = fotos.find((x) => x.storage_path === `bicis/${photo}`);
    return f ? { url: f.public_url, origen: "subida" } : null;
  };

  // ---------- Pieza 1: La flota ----------

  const portadaFlota: Slide = {
    plantilla: "portada-ruta",
    valores: {
      eyebrow: "Alquiler de bicicletas",
      titular: "El Camino también se recorre en dos ruedas",
      datos: "7 bicicletas · de montaña a eléctrica",
    },
    foto: null, // ver el porqué en el comentario de cabecera del archivo
  };

  // `ficha-bici` no depende del catálogo de rutas: modelo, tipo (el pill dorado) y una
  // descripción real de esa bici. El pill NO envuelve texto ni encoge la letra: aunque
  // `category_label` completo ("Eléctrica doble suspensión · E-Bike", 36) cabe dentro del
  // maxLargo de 40 del campo, se salía del lienzo por la derecha al renderizarlo — visto
  // con los ojos, no lo caza tsc. Por eso el tipo usa la misma versión corta que ya se
  // armó para el eyebrow de dato-grande, verificada de sobra.
  const tarjetasFlota: Slide[] = bikes.map((b) => ({
    plantilla: "ficha-bici",
    valores: {
      modelo: b.name,
      tipo: EYEBROW_POR_SLUG[b.slug] ?? b.category_label.slice(0, 25),
      descripcion: DESCRIPCION_FICHA_POR_SLUG[b.slug] ?? b.tagline ?? "",
    },
    foto: fotoDe(b.photo),
  }));

  const cierreFlota: Slide = {
    plantilla: "cierre-cta",
    valores: {
      titular: "Deja de investigar.\nEmpieza a pedalear.",
      motivo: "Escríbele a Clara y elige tu bici para el Camino",
    },
    foto: null,
  };

  await guardar("La flota — bicicletas Camino Sacro", [portadaFlota, ...tarjetasFlota, cierreFlota]);

  // ---------- Pieza 2: precio del alquiler (solo Ponferrada tiene tarifas) ----------

  const delAnio = precios.filter((p) => p.year === ANIO_VIGENTE);
  const tarifas = (delAnio.length ? delAnio : precios).filter((p) => p.price_cs != null);
  const desde = tarifas.length ? Math.min(...tarifas.map((p) => Number(p.price_cs))) : null;
  const diasAlquiler = tarifas.find((t) => t.days != null)?.days ?? null;

  const portadaPrecio: Slide = {
    plantilla: "portada-ruta",
    valores: {
      ruta: RUTA_PONFERRADA_ID,
      ruta_nombre: "Francés Bici Ponferrada",
      eyebrow: "Camino Francés en bici",
      titular: "Cuánto cuesta alquilar tu bici en el Francés",
      datos: diasAlquiler ? `Alquiler por ${diasAlquiler} días · Ponferrada → Santiago` : "Ponferrada → Santiago",
      ...(desde != null ? { precio: `desde ${Math.round(desde)} €` } : {}),
    },
    foto: null, // ver el porqué en el comentario de cabecera del archivo
  };

  // Igual que en la flota: eyebrow = nombre de la bici, y acá el "número grande" es el
  // precio real de ESA bici para ESTA ruta — no inventado, tomado de bike_prices.
  const tarjetasPrecio: Slide[] = bikes.map((b) => {
    const tarifa = tarifas.find((t) => t.bike_id === b.id);
    const categoria = EYEBROW_POR_SLUG[b.slug] ?? b.category_label;
    const valores: Record<string, string> = {
      eyebrow: b.name,
      numero: tarifa?.price_cs != null ? String(Math.round(Number(tarifa.price_cs))) : "—",
      unidad: "€",
      bajada:
        tarifa?.price_cs != null
          ? `${categoria}. Alquiler por ${diasAlquiler ?? tarifa.days ?? "los"} días, Ponferrada → Santiago.`
          : `${categoria}. Sin tarifa cargada todavía para esta ruta: pregúntale a Clara.`,
    };
    return { plantilla: "dato-grande", valores, foto: fotoDe(b.photo) };
  });

  const slideFianza: Slide = {
    plantilla: "dato-grande",
    valores: {
      eyebrow: "Antes de salir",
      numero: String(FIANZA_POR_BICI_EUR),
      unidad: "€ de fianza",
      bajada: "Fianza reembolsable por bicicleta. Se devuelve completa al entregarla en buen estado en Santiago.",
    },
    foto: null,
  };

  const cierrePrecio: Slide = {
    plantilla: "cierre-cta",
    valores: {
      titular: "Deja de investigar.\nEmpieza a pedalear.",
      motivo: "Escríbele a Clara y suma tu bici a la reserva del Francés",
    },
    foto: null,
  };

  await guardar("Precio del alquiler — Francés Bici Ponferrada", [
    portadaPrecio,
    ...tarjetasPrecio,
    slideFianza,
    cierrePrecio,
  ]);

  const { count } = await sbPublic.from("contenido_piezas").select("id", { count: "exact", head: true }).is("ruta_id", null);
  console.log(`\n${count} piezas de catálogo (sin ruta_id) en total en la base.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
