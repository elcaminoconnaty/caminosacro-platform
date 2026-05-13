-- =============================================================
-- Migración 0002 — Suplemento de temporada + sincronizar drift
--
-- 1. Asegura columnas que existen en producción pero faltaban en 0001
--    (base_eur ya estaba en prod; lo registramos idempotente).
-- 2. Añade columnas nuevas: season_supplement_eur, season_kind.
-- 3. Reescribe recompute_quote_total para que el total incluya el suplemento.
-- =============================================================

alter table comercial.quotes
  add column if not exists base_eur numeric(10,2) default 0;

alter table comercial.quotes
  add column if not exists season_supplement_eur numeric(10,2) default 0;

alter table comercial.quotes
  add column if not exists season_kind text default 'regular';

do $$ begin
  alter table comercial.quotes
    add constraint quotes_season_kind_check
    check (season_kind in ('regular','high_season','easter'));
exception when duplicate_object then null; end $$;

create or replace function comercial.recompute_quote_total(p_quote_id uuid)
returns numeric language plpgsql as $$
declare
  v_base numeric(10,2);
  v_supp numeric(10,2);
  v_lines numeric(10,2);
  v_total numeric(10,2);
begin
  select coalesce(base_eur, 0), coalesce(season_supplement_eur, 0)
    into v_base, v_supp
    from comercial.quotes where id = p_quote_id;

  select coalesce(sum(case when type = 'discount' then -total else total end), 0)
    into v_lines
    from comercial.quote_lines
    where quote_id = p_quote_id and type in ('optional','custom','discount');

  v_total := v_base + v_supp + v_lines;

  update comercial.quotes set total_eur = v_total where id = p_quote_id;
  return v_total;
end $$;
