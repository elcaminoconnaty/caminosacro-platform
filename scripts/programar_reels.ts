/**
 * Sube reels de VIDEO al Estudio de Contenido y los deja programados para que el cron los
 * publique (motor: src/lib/contenido/publicar.ts, rama `videoDelReel`).
 *
 *   npx tsx --env-file=.env.local scripts/programar_reels.ts <plan.json>            # ensayo: no escribe nada
 *   npx tsx --env-file=.env.local scripts/programar_reels.ts <plan.json> --aplicar  # sube y programa
 *
 * plan.json:
 *   { "hora": "19:30",
 *     "reels": [ { "slug": "ano-santo", "titulo": "…", "fecha": "2026-10-01",
 *                  "video": "/ruta/local.mp4", "portada": "/ruta/local.jpg",
 *                  "caption": "…", "hashtags": "#…", "pilar": "accion" } ] }
 *
 * Qué hace por reel:
 *  - Sube `reels/<slug>/video.mp4` y `reels/<slug>/portada.jpg` al bucket público
 *    `contenido-piezas` (upsert).
 *  - Crea la pieza (formato `reel`, estado `programado`) o, si ya existe una sin publicar
 *    con el mismo título, la actualiza. `export_paths = [portada, video]` (la portada primero:
 *    es la miniatura de la bandeja).
 *  - El slide es descriptivo (plantilla `video-reel`, con el nombre y la huella del mp4);
 *    `export_hash` se calcula sobre él con la misma función que usa el motor al publicar.
 *
 * Nunca toca `public.fotos` ni `fotos-instagram` (trampa n.º 1 de PLAN_CONTENIDO.md).
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { hashPieza } from "../src/lib/contenido/hashSlide";
import { aInstante, fechaLocal } from "../src/lib/contenido/fechas";

type Reel = {
  slug: string; titulo: string; fecha: string; video: string; portada: string;
  caption: string; hashtags: string; pilar: string | null;
};
type Plan = { hora: string; reels: Reel[] };

const BUCKET = "contenido-piezas";
const PILARES = ["tips", "ruta", "prueba_social", "latam", "servicios", "accion", "objeciones"];

async function main() {
  const [ruta, flag] = process.argv.slice(2);
  if (!ruta) throw new Error("Uso: programar_reels.ts <plan.json> [--aplicar]");
  const aplicar = flag === "--aplicar";
  const plan = JSON.parse(readFileSync(ruta, "utf8")) as Plan;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local).");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const hoy = fechaLocal();
  for (const r of plan.reels) {
    // --- validaciones antes de tocar nada ---
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha) || r.fecha <= hoy) throw new Error(`${r.slug}: fecha inválida o no futura (${r.fecha})`);
    if (r.pilar && !PILARES.includes(r.pilar)) throw new Error(`${r.slug}: pilar desconocido ${r.pilar}`);
    if ((r.caption + "\n\n" + r.hashtags).length > 2200) throw new Error(`${r.slug}: caption de más de 2.200 caracteres`);
    const instante = aInstante(r.fecha, plan.hora);
    if (!instante) throw new Error(`${r.slug}: no se pudo armar la hora ${r.fecha} ${plan.hora}`);
    const video = readFileSync(r.video);
    const portada = readFileSync(r.portada);
    const huellaVideo = createHash("sha1").update(video).digest("hex").slice(0, 12);

    const slides = [{ plantilla: "video-reel", valores: { video: r.slug, huella: huellaVideo }, foto: null }];
    const exportPaths = [`${BUCKET}/reels/${r.slug}/portada.jpg`, `${BUCKET}/reels/${r.slug}/video.mp4`];
    const fila = {
      titulo: r.titulo, formato: "reel", slides, caption: r.caption, hashtags: r.hashtags, pilar: r.pilar,
      export_paths: exportPaths, exportado_at: new Date().toISOString(), export_hash: hashPieza(slides, "reel"),
      estado: "programado", programada_para: instante, publicacion_error: null, publicacion_intentos: 0,
    };

    const { data: existente } = await sb.from("contenido_piezas").select("id,estado")
      .eq("titulo", r.titulo).eq("formato", "reel").neq("estado", "publicado").maybeSingle();

    console.log(`${aplicar ? "→" : "·"} ${r.fecha} ${plan.hora} · ${r.titulo} · ${(video.length / 1e6).toFixed(1)} MB${existente ? ` · actualiza ${existente.id}` : " · nueva"}`);
    if (!aplicar) continue;

    for (const [destino, bytes, tipo] of [[`reels/${r.slug}/video.mp4`, video, "video/mp4"], [`reels/${r.slug}/portada.jpg`, portada, "image/jpeg"]] as const) {
      const { error } = await sb.storage.from(BUCKET).upload(destino, bytes, { contentType: tipo, upsert: true, cacheControl: "300" });
      if (error) throw new Error(`${r.slug}: no se pudo subir ${destino}: ${error.message}`);
    }
    const res = existente
      ? await sb.from("contenido_piezas").update(fila).eq("id", existente.id).select("id").single()
      : await sb.from("contenido_piezas").insert(fila).select("id").single();
    if (res.error) throw new Error(`${r.slug}: ${res.error.message}`);
    console.log(`  ✓ pieza ${res.data.id}`);
  }
  if (!aplicar) console.log("\nEnsayo: no se escribió nada. Repite con --aplicar.");
}

main().catch((e) => { console.error(`✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
