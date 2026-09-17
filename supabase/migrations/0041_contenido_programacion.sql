-- 0041_contenido_programacion.sql
--
-- Programar publicaciones desde el Estudio de Contenido (Fase 2 + calendario).
--
-- Hasta ahora una pieza se exportaba, se descargaba y alguien la subía a Instagram a
-- mano en el momento que tocara. Con esto la pieza lleva su fecha y hora de salida, y un
-- cron la publica solo por la Graph API. Nico revisa un día entero y deja el mes
-- programado; el calendario de /contenido/calendario muestra qué días ya tienen algo.
--
-- Dos estados nuevos en la pieza:
--   programado  → tiene `programada_para` y espera su turno.
--   publicando  → un tick del cron la tomó y está hablando con Instagram (transitorio).
-- El resto sigue igual: borrador · listo · publicado · archivado.
--
-- El bot viejo (foto de stock a las 7pm, otro repo) queda apagado: sus tres jobs de
-- pg_cron ya estaban en `active = false`. Sus 15 posts históricos siguen en `posts_log`
-- y el calendario los muestra como publicados. Se escribe en esa misma tabla (con
-- `origen = 'estudio'`) y no en una nueva para que, si algún día se reactiva el cron de
-- métricas, recoja los posts del estudio sin tocar nada.
--
-- Aditiva: ninguna pieza cambia de estado por esta migración.

-- ---------- Estados y columnas de programación ----------
alter table public.contenido_piezas
  drop constraint if exists contenido_piezas_estado_check;
alter table public.contenido_piezas
  add constraint contenido_piezas_estado_check
  check (estado in ('borrador','listo','programado','publicando','publicado','archivado'));

alter table public.contenido_piezas
  add column if not exists programada_para      timestamptz,   -- instante UTC; se elige en hora Bogotá
  add column if not exists publicado_at         timestamptz,
  add column if not exists permalink            text,
  add column if not exists ig_media_id          text,
  add column if not exists publicacion_intentos int not null default 0,
  add column if not exists publicacion_error    text,
  add column if not exists publicando_desde     timestamptz,
  -- Huella (djb2) de slides+formato en el momento de exportar. Si al publicar no coincide
  -- con lo que hay guardado, la pieza cambió después de exportar y NO se publica: los JPG
  -- del bucket no serían lo que se ve en pantalla.
  add column if not exists export_hash          text;

-- Lo que el cron consulta cada 5 minutos: solo las que esperan turno.
create index if not exists contenido_piezas_programadas_idx
  on public.contenido_piezas (programada_para)
  where estado in ('programado','publicando');

-- ---------- posts_log: de dónde salió cada post ----------
alter table public.posts_log
  add column if not exists origen   text not null default 'bot',
  add column if not exists pieza_id uuid;
alter table public.posts_log drop constraint if exists posts_log_origen_check;
alter table public.posts_log
  add constraint posts_log_origen_check check (origen in ('bot','estudio'));
create index if not exists posts_log_fecha_local_idx on public.posts_log (fecha_local);

-- ---------- Tomar publicaciones vencidas (para el cron) ----------
-- Mismo patrón que contenido_tomar_trabajo (0026): `for update skip locked` para que dos
-- ticks del cron que se solapen nunca publiquen la misma pieza dos veces. Cuenta el
-- intento al tomarla, no al fallar: si el proceso muere a mitad, el intento ya quedó.
create or replace function public.contenido_tomar_publicaciones(p_limite int default 3)
returns setof public.contenido_piezas
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.contenido_piezas p
     set estado = 'publicando',
         publicando_desde = now(),
         publicacion_intentos = p.publicacion_intentos + 1
   where p.id in (
     select id from public.contenido_piezas
      where estado = 'programado' and programada_para <= now()
      order by programada_para
      limit greatest(p_limite, 1)
      for update skip locked
   )
  returning p.*;
end $$;

-- Una pieza 'publicando' que lleve más de 10 minutos así es un proceso que murió a mitad
-- (redeploy de Railway, timeout). Vuelve a la cola; al tercer intento se rinde y vuelve a
-- 'listo' con el motivo escrito, para que se vea en la bandeja y en el calendario.
create or replace function public.contenido_rescatar_publicaciones()
returns int
language sql
security definer
set search_path = public
as $$
  with rescatadas as (
    update public.contenido_piezas
       set estado = case when publicacion_intentos >= 3 then 'listo' else 'programado' end,
           publicacion_error = case
             when publicacion_intentos >= 3
               then 'La publicación se quedó colgada 3 veces. Revisa y vuelve a programar.'
             else publicacion_error end,
           publicando_desde = null
     where estado = 'publicando' and publicando_desde < now() - interval '10 minutes'
    returning 1
  )
  select count(*)::int from rescatadas;
$$;

-- Solo el service_role (el cron) las llama; no hace falta exponerlas a authenticated.
revoke all on function public.contenido_tomar_publicaciones(int) from public, anon, authenticated;
revoke all on function public.contenido_rescatar_publicaciones() from public, anon, authenticated;

-- ---------- Preferencias del calendario ----------
-- Hora por defecto y cadencia con la que "Aprobar y programar" propone el siguiente día.
insert into comercial.settings (key, value)
  values ('contenido_programacion', '{"hora":"19:30","cadencia":"diario"}'::jsonb)
  on conflict (key) do nothing;

-- ---------- Cron (APLICAR A MANO, con el secreto real) ----------
-- No va dentro de la migración porque el secreto no puede viajar en git. Es el mismo
-- CRON_SECRET que ya usa Railway para /api/cron/recordatorios-contrato. Cada 5 minutos
-- el endpoint toma las piezas cuyo `programada_para` ya pasó y las publica. Responde en
-- seguida (202) y trabaja después de responder, así el timeout de pg_net no lo corta.
--
--   select cron.schedule(
--     'camino-sacro-publicar-contenido',
--     '*/5 * * * *',
--     $cron$
--     select net.http_post(
--       url     := 'https://caminosacro-platform-production.up.railway.app/api/cron/publicar-contenido',
--       headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','__CRON_SECRET__'),
--       body    := '{}'::jsonb,
--       timeout_milliseconds := 15000
--     );
--     $cron$
--   );
--
-- Para quitarlo: select cron.unschedule('camino-sacro-publicar-contenido');
