-- =============================================================
-- 0027_contenido_ideas_slides.sql
-- La idea deja de ser un titular suelto y pasa a traer el carrusel entero escrito.
--
-- Dos columnas nuevas en public.contenido_ideas:
--
--   `slides`      — el carrusel ya redactado que propone Claude, con la MISMA forma que
--                   public.contenido_piezas.slides (array de {plantilla, valores, foto}).
--                   Aceptar la idea deja de crear slides de relleno con los textos de
--                   ejemplo de cada plantilla: copia esto tal cual y la pieza nace lista
--                   para retocar. Se guarda ya validado contra el registry de plantillas,
--                   así que lo que hay aquí siempre se puede dibujar.
--
--   `fuente_dato` — de qué salió la idea. No es lo mismo "esto lo pide la gente en las
--                   cotizaciones" que "esto lo insinúan 15 posts de Instagram", y la
--                   tarjeta tiene que decirlo para que se pueda juzgar la sugerencia sin
--                   abrirla. Ojo: la columna `fuente` ya existía y significa otra cosa
--                   (quién propuso la idea: claude o una persona).
-- =============================================================

alter table public.contenido_ideas
  add column if not exists slides jsonb not null default '[]'::jsonb;

alter table public.contenido_ideas
  add column if not exists fuente_dato text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contenido_ideas_fuente_dato_chk') then
    alter table public.contenido_ideas
      add constraint contenido_ideas_fuente_dato_chk
      check (fuente_dato is null or fuente_dato in ('metricas','catalogo','cotizaciones','calendario'));
  end if;
end $$;

comment on column public.contenido_ideas.slides is
  'El carrusel ya redactado (misma forma que contenido_piezas.slides). Aceptar la idea lo copia tal cual: nada de slides de relleno.';
comment on column public.contenido_ideas.fuente_dato is
  'De qué dato nació la idea: metricas | catalogo | cotizaciones | calendario. Distinto de `fuente`, que dice quién la propuso.';
