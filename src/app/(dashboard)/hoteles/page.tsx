import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import HotelsManager, { type Hotel, type HotelFoto } from "./HotelsManager";

// Las fotos se sirven con URL firmada, que caduca: la página no se puede cachear.
export const dynamic = "force-dynamic";

export default async function HotelesPage() {
  const supabase = await createCommercialClient();
  const { data, error } = await supabase
    .from("hotels")
    .select("id,slug,name,city,address,phone,email,website,category,notes,photos,active")
    .order("active", { ascending: false })
    .order("city")
    .order("name");

  if (error) {
    return <p className="text-sm text-red-700">{mensajeError(error)}</p>;
  }

  type Fila = Omit<Hotel, "photos"> & { photos: { path: string; position?: number }[] | null };
  const filas = (data || []) as Fila[];

  // Las miniaturas se firman todas de una: una firma por foto en el cliente serían 3
  // idas y vueltas por hotel cada vez que se abre la página.
  const rutas = filas.flatMap((h) => (h.photos || []).map((f) => f.path));
  const firmadas = new Map<string, string>();
  if (rutas.length > 0) {
    const porBucket = new Map<string, string[]>();
    for (const r of rutas) {
      const [bucket, ...rest] = r.split("/");
      porBucket.set(bucket, [...(porBucket.get(bucket) || []), rest.join("/")]);
    }
    for (const [bucket, claves] of porBucket) {
      const { data: urls } = await supabase.storage.from(bucket).createSignedUrls(claves, 60 * 30);
      for (const u of urls || []) {
        if (u.path && u.signedUrl) firmadas.set(`${bucket}/${u.path}`, u.signedUrl);
      }
    }
  }

  const hotels: Hotel[] = filas.map((h) => ({
    ...h,
    photos: [...(h.photos || [])]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map<HotelFoto>((f) => ({ ...f, url: firmadas.get(f.path) ?? null })),
  }));

  return <HotelsManager hotels={hotels} />;
}
