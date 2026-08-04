-- 0019_optional_prices_year.sql
-- Los servicios opcionales (seguros, noches extra, traslados, tours…) ganan precios por
-- año, igual que las rutas en la 0017.
--
-- Por qué una tabla aparte y no una columna `year` en optional_services, como sí se hizo
-- en `pricing`: en `pricing` la fila ES un precio, pero en optional_services la fila es un
-- SERVICIO (slug, nombre, categoría, unidad) del que solo cambia la plata. Duplicar la fila
-- por año rompería dos cosas:
--   1. `optional_services.slug` es unique.
--   2. `quote_lines.reference_id` apunta al id del opcional. Con filas por año, cambiarle
--      la fecha a una cotización dejaría sus líneas apuntando al opcional de otro año: la
--      casilla se vería desmarcada mientras la línea se sigue cobrando.
-- Con la tabla aparte, `reference_id` es estable para siempre y solo se resuelve el precio.
--
-- Los precios actuales de optional_services son las tarifas 2026 y se copian tal cual.
-- Las columnas price_pilgrim / price_cs de optional_services quedan por ahora para no
-- romper la app desplegada durante el despliegue; las borra la 0020, ya sin lectores.

create table if not exists comercial.optional_prices (
  id uuid primary key default gen_random_uuid(),
  optional_id uuid not null references comercial.optional_services(id) on delete cascade,
  year int not null,
  price_pilgrim numeric(10,2),
  price_cs numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (optional_id, year)
);

create index if not exists optional_prices_year_idx on comercial.optional_prices(year);

drop trigger if exists optional_prices_touch on comercial.optional_prices;
create trigger optional_prices_touch before update on comercial.optional_prices
  for each row execute function comercial.touch_updated_at();

alter table comercial.optional_prices enable row level security;
drop policy if exists auth_all on comercial.optional_prices;
create policy auth_all on comercial.optional_prices for all to authenticated using (true) with check (true);

-- Backfill: lo cargado hasta hoy son las tarifas 2026.
insert into comercial.optional_prices (optional_id, year, price_pilgrim, price_cs)
select id, 2026, price_pilgrim, price_cs
from comercial.optional_services
on conflict (optional_id, year) do nothing;

comment on table comercial.optional_prices is
  'Precios de los servicios opcionales por año de vigencia. El CRM usa el año de salida de la cotización y, si no está cargado, cae al año anterior avisando en ámbar; el opcional en sí (nombre, categoría, unidad) vive en optional_services y su id es lo que referencia quote_lines.';
