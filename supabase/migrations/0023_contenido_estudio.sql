-- =============================================================
-- 0023_contenido_estudio.sql
-- Estudio de Contenido: piezas gráficas (carruseles, portadas de reel, historias
-- y piezas con gráficos) para Instagram, con la identidad de Camino Sacro.
-- Aditiva: no toca ni una fila existente.
--
-- POR QUÉ VIVE EN `public` Y NO EN UN SCHEMA `contenido` PROPIO:
--   1. Un schema nuevo NO se termina con una migración: hay que agregarlo a mano en
--      Settings → API → Exposed schemas (lo dice la cabecera de 0001_init_comercial.sql).
--      Ese paso no viaja en git, no es idempotente, y es justo el que se olvida en el
--      deploy y aparece como PGRST106 a las once de la noche.
--   2. PostgREST solo embebe recursos DENTRO del mismo schema, y este módulo cruza todo
--      el tiempo con public.fotos, posts_log, post_metricas, aprendizajes y
--      blog_calendario. Desde otro schema cada join sería un viaje extra a mano.
--   3. `comercial` está aparte porque es plata y tiene otro ciclo de vida. Contenido es
--      el vecino del pipeline de Instagram, no el de las cotizaciones.
--   El prefijo `contenido_` deja ver de un vistazo de quién es cada tabla.
--
-- LAS DOS TRAMPAS DEL BOT QUE ESTA MIGRACIÓN ESQUIVA A PROPÓSITO:
--   (a) public.registrar_fotos_nuevas() escanea el bucket `fotos-instagram` y mete todo
--       lo nuevo en public.fotos como 'disponible'. Por eso el estudio tiene buckets
--       propios y no escribe jamás en ese.
--   (b) MÁS GRAVE: la Edge Function `publicar` (repo caminosacro-ig-auto) elige de
--       public.fotos por status, SIN MIRAR EL BUCKET. O sea: basta insertar una fila en
--       public.fotos para que el bot publique esa foto sola a las 7pm en la cuenta real,
--       viva donde viva el archivo. Por eso las fotos del estudio tienen tabla propia
--       (contenido_fotos) y NUNCA se registran en public.fotos.
-- =============================================================

create or replace function public.contenido_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Piezas ----------
create table if not exists public.contenido_piezas (
  id       uuid primary key default gen_random_uuid(),
  titulo   text not null default 'Pieza sin título',
  formato  text not null default '4x5'
           check (formato in ('1x1','4x5','1.91x1','9x16','reel')),

  -- Los slides van en JSONB y NO en tabla aparte, a propósito: un carrusel se edita, se
  -- guarda y se exporta SIEMPRE como una unidad. Así el orden es el del array (cero
  -- columnas `position` que se desincronizan), el autoguardado es un solo UPDATE
  -- atómico y duplicar una pieza es copiar una columna. Lo que se pierde —una FK por
  -- slide a fotos(id)— no lo necesita nadie.
  -- Forma: [{ plantilla, valores: {campo: valor}, foto: {url, origen} | null }, …]
  -- Lo valida zod en src/lib/contenido/tipos.ts (SlideSchema): si el JSON no cumple, el
  -- render devuelve una pieza de error legible en vez de tumbar el endpoint.
  slides   jsonb not null default '[]'::jsonb,

  caption  text not null default '',
  hashtags text not null default '',

  -- Contexto de origen. Mismas dimensiones que posts_log.pilar / posts_log.ruta para
  -- poder cruzar rendimiento después sin traducir nada.
  pilar    text,
  ruta_id  uuid,     -- comercial.routes(id). Sin FK: cruza schema a propósito.
  idea_id  bigint,   -- se enlaza en 0025, cuando exista contenido_ideas.

  -- Rutas "bucket/archivo" de los JPG exportados, en orden de slide. Misma convención
  -- que el resto del repo: la ruta se guarda CON el bucket adelante (ver
  -- src/lib/storage/paths.ts).
  export_paths jsonb not null default '[]'::jsonb,
  exportado_at timestamptz,

  estado   text not null default 'borrador'
           check (estado in ('borrador','listo','publicado','archivado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.contenido_piezas is
  'Piezas gráficas para Instagram armadas en el Estudio de Contenido. Los slides viven en la columna jsonb `slides`, no en tabla aparte.';

drop trigger if exists contenido_piezas_touch on public.contenido_piezas;
create trigger contenido_piezas_touch before update on public.contenido_piezas
  for each row execute function public.contenido_touch_updated_at();

create index if not exists contenido_piezas_estado_idx
  on public.contenido_piezas (estado, updated_at desc);

-- ---------- Fotos del estudio ----------
-- Espejo funcional de public.fotos, PERO SEPARADA: ver trampa (b) de la cabecera.
create table if not exists public.contenido_fotos (
  id           bigint generated always as identity primary key,
  storage_path text not null unique,   -- ruta dentro del bucket `contenido-fotos`
  public_url   text not null,
  nombre       text,
  origen       text not null default 'subida' check (origen in ('subida','carpeta')),
  ruta_tag     text,                   -- misma semántica que fotos.ruta_tag
  ancho int, alto int, bytes int,
  created_at   timestamptz not null default now()
);

comment on table public.contenido_fotos is
  'Fotos subidas desde el Estudio de Contenido. Deliberadamente separada de public.fotos: la Edge Function `publicar` elige de esa tabla sin mirar el bucket, así que una fila ahí se publicaría sola a las 7pm.';

-- ---------- RLS ----------
-- La plataforma es de un solo equipo y ya está protegida por sesión (magic link) y por
-- src/proxy.ts. Acá basta con cerrarle la puerta a `anon`.
alter table public.contenido_piezas enable row level security;
alter table public.contenido_fotos  enable row level security;

drop policy if exists "contenido_piezas_auth" on public.contenido_piezas;
create policy "contenido_piezas_auth" on public.contenido_piezas
  for all to authenticated using (true) with check (true);

drop policy if exists "contenido_fotos_auth" on public.contenido_fotos;
create policy "contenido_fotos_auth" on public.contenido_fotos
  for all to authenticated using (true) with check (true);

grant all on public.contenido_piezas to authenticated;
grant all on public.contenido_fotos  to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- Buckets ----------
-- PÚBLICOS, y es a propósito: (a) en la fase 2 Instagram tiene que poder descargar la
-- imagen por URL desde sus servidores, (b) el preview del editor no necesita firmar
-- nada, y (c) no hay dato sensible: son fotos de marketing que van a salir publicadas.
-- NUNCA `fotos-instagram`.
insert into storage.buckets (id, name, public)
  values ('contenido-fotos','contenido-fotos', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('contenido-piezas','contenido-piezas', true)
  on conflict (id) do nothing;

-- La lectura la da `public = true`. Estas políticas son para que el navegador
-- autenticado pueda SUBIR sin service_role: así la subida de fotos esquiva el
-- bodySizeLimit de 15 MB de las Server Actions.
do $$
declare b text;
begin
  foreach b in array array['contenido-fotos','contenido-piezas'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_write');
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L)',
      b || '_write', b);
    execute format('drop policy if exists %I on storage.objects', b || '_update');
    execute format(
      'create policy %I on storage.objects for update to authenticated using (bucket_id = %L) with check (bucket_id = %L)',
      b || '_update', b, b);
    execute format('drop policy if exists %I on storage.objects', b || '_delete');
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L)',
      b || '_delete', b);
  end loop;
end $$;
