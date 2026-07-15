-- =============================================================
-- Migración 0007 — Cotizador público (/cotizar)
-- Marca de dónde viene cada cotización para poder filtrar los
-- leads que entran solos por la web.
-- =============================================================

alter table comercial.quotes
  add column if not exists source text not null default 'interna';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quotes_source_check'
  ) then
    alter table comercial.quotes
      add constraint quotes_source_check check (source in ('interna', 'web'));
  end if;
end $$;

create index if not exists quotes_source_idx on comercial.quotes(source);

-- El cotizador público escribe con la service key (bypassa RLS a propósito):
-- no se abre ninguna policy para anon sobre comercial.*.
