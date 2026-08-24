-- =============================================================
-- 0024_contenido_lectura_instagram.sql
-- Abre SOLO LECTURA de las tablas del pipeline de Instagram al dashboard.
--
-- POR QUÉ HACE FALTA: esas tablas las creó el otro repo (caminosacro-ig-auto) con RLS
-- activo y CERO políticas — sus migraciones 0001_init.sql y 0006_metricas_aprendizaje.sql
-- lo dicen tal cual: "sin policies => solo la service_role entra". La plataforma entra
-- como `authenticated`, así que hoy PostgREST le devuelve [] SIN ERROR.
-- Eso es peor que un 403: se lee como "todavía no hay datos", y el motor de sugerencias
-- del Estudio de Contenido mentiría en silencio sobre qué está rindiendo.
--
-- SOLO SELECT. Nada de escritura: quién publica y qué se publica lo sigue decidiendo el
-- pipeline. El estudio lee para sugerir, no para tocar la cola del bot.
--
-- ⚠️ ACOPLAMIENTO CROSS-REPO: si algún día caminosacro-ig-auto recrea estas tablas o sus
-- políticas, esto se pierde EN SILENCIO y el módulo Contenido vuelve a ver vacío. Queda
-- anotado también en el OPERACIONES.md de aquel repo.
-- =============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'fotos','posts_log','post_metricas','aprendizajes','borradores','blog_calendario'
  ] loop
    -- Idempotente y tolerante: si una tabla no existe todavía, se salta sin romper.
    if to_regclass('public.' || t) is null then
      raise notice 'contenido: no existe public.%, se salta', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "contenido_lectura" on public.%I', t);
    execute format(
      'create policy "contenido_lectura" on public.%I for select to authenticated using (true)', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- public.ig_tokens y public.config NO se abren, y no es un olvido: la primera guarda el
-- access_token permanente de la Página de Facebook y la segunda el cron_secret. Eso
-- sigue siendo solo de la service_role.
