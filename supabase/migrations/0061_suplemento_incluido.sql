-- Suplemento de temporada YA INCLUIDO en un precio puesto a mano.
--
-- Cuando Nico teclea el precio por persona y el viaje cae en temporada alta (2027: mayo,
-- agosto y septiembre) o en Semana Santa, la plataforma pregunta si el suplemento se suma
-- aparte o si ya viene dentro de ese precio. Si viene dentro, la cotización guarda el
-- suplemento en 0 y esta marca en true, para que el PDF no lo vuelva a detectar por fecha
-- y lo sume otra vez. Uso interno: el cliente solo ve el precio.

alter table comercial.quotes
  add column if not exists season_supplement_included boolean not null default false;

comment on column comercial.quotes.season_supplement_included is
  'true = el precio por persona puesto a mano ya incluye el suplemento de temporada (season_supplement_eur queda en 0). Solo interno.';
