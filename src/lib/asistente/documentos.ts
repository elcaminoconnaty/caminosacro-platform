import "server-only";
import type { SupabaseClient as Base } from "@supabase/supabase-js";
import { carpetaCotizacion } from "@/lib/storage/paths";
import { leerArchivo, type Contenido } from "@/lib/asistente/pdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = Base<any, any, any>;

/**
 * Los documentos que genera o recibe la plataforma, en Supabase Storage. Se leen con la sesión
 * de quien pregunta (las mismas políticas de Storage de la plataforma) y solo de los buckets
 * comerciales.
 */

export const BUCKETS_COTIZACION = [
  "comercial-quotes",
  "comercial-contracts",
  "comercial-receipts",
  "comercial-docs",
  "comercial-passports",
  "comercial-welcome",
] as const;
const BUCKETS_GENERALES = ["comercial-catalogs", "comercial-welcome", "comercial-hotels"] as const;
const PERMITIDOS = new Set<string>([...BUCKETS_COTIZACION, ...BUCKETS_GENERALES]);

const MAX_BYTES = 20_000_000;

type Item = { name: string; id: string | null; metadata?: { size?: number; mimetype?: string } | null; updated_at?: string | null };

async function listar(supabase: SupabaseClient, bucket: string, prefijo: string, profundidad = 0): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefijo, { limit: 200, sortBy: { column: "name", order: "asc" } });
  if (error || !data) return [];
  const out: string[] = [];
  for (const it of data as Item[]) {
    const ruta = prefijo ? `${prefijo}/${it.name}` : it.name;
    if (it.id === null) {
      if (profundidad < 2) out.push(...(await listar(supabase, bucket, ruta, profundidad + 1)));
    } else {
      const kb = it.metadata?.size ? `${Math.round(it.metadata.size / 1024)} KB` : "";
      out.push(`- ${bucket}/${ruta}${kb ? ` (${kb}${it.updated_at ? `, ${it.updated_at.slice(0, 10)}` : ""})` : ""}`);
    }
  }
  return out;
}

/** Con código de cotización: todo lo de esa carpeta en cada bucket. Sin código: catálogos,
 *  cartas de bienvenida y lo general. */
export async function documentosDe(supabase: SupabaseClient, codigo?: string | null): Promise<string> {
  if (codigo) {
    const cod = codigo.trim().toUpperCase();
    if (!/^CS-\d{4}-\d{2,4}$/.test(cod)) return `«${codigo}» no parece un código de cotización (CS-AAAA-NNN).`;
    const carpeta = carpetaCotizacion(cod);
    const listas = await Promise.all(BUCKETS_COTIZACION.map((b) => listar(supabase, b, carpeta)));
    const todo = listas.flat();
    return todo.length ? `Documentos de ${cod}:\n${todo.join("\n")}` : `No hay documentos guardados para ${cod} en Storage.`;
  }
  const listas = await Promise.all(BUCKETS_GENERALES.map((b) => listar(supabase, b, "")));
  return `Documentos generales:\n${listas.flat().join("\n") || "(ninguno)"}`;
}

/** `ruta` = "bucket/carpeta/archivo.pdf", como se guarda en la base y como sale en la lista. */
export async function leerDocumento(supabase: SupabaseClient, ruta: string): Promise<Contenido[]> {
  const limpia = ruta.trim().replace(/^\/+/, "");
  const [bucket, ...resto] = limpia.split("/");
  if (!PERMITIDOS.has(bucket) || !resto.length || limpia.includes("..")) {
    return [{ type: "text", text: `Ruta no válida: «${ruta}». Tiene que empezar por uno de estos buckets: ${[...PERMITIDOS].join(", ")}.` }];
  }
  const { data, error } = await supabase.storage.from(bucket).download(resto.join("/"));
  if (error || !data) return [{ type: "text", text: `No encontré «${limpia}» (${error?.message ?? "sin datos"}).` }];
  if (data.size > MAX_BYTES) return [{ type: "text", text: `«${limpia}» pesa demasiado para leerlo aquí.` }];
  return leerArchivo(new Uint8Array(await data.arrayBuffer()), resto[resto.length - 1], data.type);
}
