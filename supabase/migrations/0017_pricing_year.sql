-- 0017_pricing_year.sql
-- El catálogo gana dimensión de año: Pilgrim sube tarifas en 2027 y hasta ahora
-- comercial.pricing guardaba una sola tarifa por ruta+modalidad, sin vigencia.
--
-- `season` quedó siempre en 'regular' (los suplementos de temporada viven aparte, en
-- comercial.settings key 'season_supplements') y valid_from/valid_to nunca se usaron.
-- En vez de reciclar esas columnas ambiguas, se agrega `year` explícito y entra a la
-- unique. valid_from/valid_to se dejan quietas: siguen muertas.
--
-- Todas las filas existentes son tarifas 2026.

alter table comercial.pricing add column if not exists year int;

update comercial.pricing set year = 2026 where year is null;

alter table comercial.pricing alter column year set not null;
alter table comercial.pricing alter column year set default extract(year from now())::int;

alter table comercial.pricing drop constraint if exists pricing_route_id_modality_season_valid_from_key;
alter table comercial.pricing add constraint pricing_route_modality_season_year_key
  unique (route_id, modality, season, year);

create index if not exists pricing_year_idx on comercial.pricing(year);

comment on column comercial.pricing.year is
  'Año de vigencia de la tarifa. El CRM exige coincidencia exacta con el año de salida de la cotización (nunca autocarga otro año); el cotizador público cae al año cargado más reciente y lo avisa.';
