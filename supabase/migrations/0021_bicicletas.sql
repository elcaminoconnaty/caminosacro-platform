-- 0021_bicicletas.sql
-- Camino en bici: el alquiler de bicicleta entra a la plataforma como un catálogo propio.
--
-- Por qué NO va en comercial.optional_services:
--   Un opcional tiene UN precio por año (comercial.optional_prices). El alquiler de bici
--   no: cuesta según los DÍAS de la ruta. Los 265 € de la MTB son "5 días de alquiler" de
--   Ponferrada → Santiago; el Portugués desde Oporto son 6 y el Primitivo desde Oviedo 8,
--   así que la misma bici vale distinto en cada ruta. El precio es (bici × ruta × año), la
--   misma forma que ya tiene comercial.pricing para el alojamiento.
--
-- Además una bici no es solo un precio: tiene ficha (gama, tallas, ruedas, componentes,
-- motor, foto) que alimenta el catálogo comercial en PDF y las tarjetas del CRM.
--
-- Fuentes: dossier Pilgrim "Condiciones alquiler bicicletas actualizada" (junio 2026) y
-- cotización Pilgrim C677157 (21-08-2026, Ponferrada → Santiago, 5 días).

-- =============================================================
-- 1. Flota: la ficha de cada modelo
-- =============================================================
create table if not exists comercial.bikes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  position int not null default 0,
  -- Modelo concreto de la flota (Ridley Ignite A). Referencia: el proveedor no garantiza
  -- el modelo, solo la gama, así que el modelo se muestra como "o equivalente".
  name text not null,
  -- Gama: es lo que de verdad se contrata y se factura (MTB, Gravel, E-Bike…).
  category_label text not null,
  -- Nombre literal del servicio en la cotización del proveedor, para pedirlo sin ambigüedad.
  pilgrim_service text,
  tagline text,
  description text,
  ideal_para text,
  sizes text[] not null default '{}',
  sizes_note text,
  wheels text[] not null default '{}',
  luggage text,
  -- [{label, value}, …] — características técnicas en orden de presentación.
  specs jsonb not null default '[]'::jsonb,
  -- {motor, pantalla, bateria} en las eléctricas; null en las musculares.
  motor jsonb,
  electric boolean not null default false,
  -- Nombre del archivo dentro de app/src/lib/bikes/ (va empaquetado con la app, como cover.jpg).
  photo text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists bikes_touch on comercial.bikes;
create trigger bikes_touch before update on comercial.bikes
  for each row execute function comercial.touch_updated_at();

comment on table comercial.bikes is
  'Flota de bicicletas de alquiler: la ficha de cada modelo. El precio NO vive acá — vive en comercial.bike_prices, que depende de la ruta porque la tarifa cubre los días de esa ruta.';

-- =============================================================
-- 2. Tarifa: bici × ruta × año
-- =============================================================
create table if not exists comercial.bike_prices (
  id uuid primary key default gen_random_uuid(),
  bike_id uuid not null references comercial.bikes(id) on delete cascade,
  route_id uuid not null references comercial.routes(id) on delete cascade,
  year int not null default extract(year from now())::int,
  -- Días de alquiler que cubre la tarifa. Informativo: sale en la ficha del PDF
  -- ("5 días de alquiler") y ayuda a detectar una tarifa copiada de otra ruta.
  days int,
  price_pilgrim numeric(10,2),
  price_cs numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bike_id, route_id, year)
);
create index if not exists bike_prices_year_idx on comercial.bike_prices(year);
create index if not exists bike_prices_route_idx on comercial.bike_prices(route_id);
drop trigger if exists bike_prices_touch on comercial.bike_prices;
create trigger bike_prices_touch before update on comercial.bike_prices
  for each row execute function comercial.touch_updated_at();

comment on table comercial.bike_prices is
  'Tarifa de alquiler por bicicleta, ruta y año de salida. Misma regla que comercial.pricing: manda el año de SALIDA del viaje y el CRM nunca autocarga otro año. Una fila con price_pilgrim null existe pero está sin cargar: la plataforma lo avisa en ámbar en vez de inventar un precio.';

-- Historial de cambios de tarifa, espejo de comercial.pricing_history.
create table if not exists comercial.bike_price_history (
  id bigserial primary key,
  bike_price_id uuid not null references comercial.bike_prices(id) on delete cascade,
  field text not null,
  old_value numeric,
  new_value numeric,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

create or replace function comercial.log_bike_price_change()
returns trigger language plpgsql as $$
begin
  if new.price_pilgrim is distinct from old.price_pilgrim then
    insert into comercial.bike_price_history (bike_price_id, field, old_value, new_value, changed_by)
      values (new.id, 'price_pilgrim', old.price_pilgrim, new.price_pilgrim, auth.uid());
  end if;
  if new.price_cs is distinct from old.price_cs then
    insert into comercial.bike_price_history (bike_price_id, field, old_value, new_value, changed_by)
      values (new.id, 'price_cs', old.price_cs, new.price_cs, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists bike_prices_audit on comercial.bike_prices;
create trigger bike_prices_audit after update on comercial.bike_prices
  for each row execute function comercial.log_bike_price_change();

-- =============================================================
-- 3. La bici elegida es una línea de la cotización
-- =============================================================
-- Tipo propio en vez de reusar 'optional': el resumen de inversión del PDF tiene que poder
-- decir CUÁL bicicleta se eligió, y la tarjeta de bicis del CRM tiene que poder listar sus
-- líneas sin barrer todos los opcionales. reference_id apunta a comercial.bikes.id.
alter table comercial.quote_lines drop constraint if exists quote_lines_type_check;
alter table comercial.quote_lines add constraint quote_lines_type_check
  check (type in ('route','optional','custom','discount','bike'));

comment on column comercial.quote_lines.reference_id is
  'Según type: pricing_id (route), optional_service_id (optional) o bikes.id (bike). Sin FK a propósito, para que borrar del catálogo no arrastre cotizaciones ya emitidas.';

-- La bici entra al total del cliente y al costo Pilgrim como cualquier otra línea.
-- Sin esto, marcar una bicicleta no movería ni total_eur ni cost_eur.
create or replace function comercial.recompute_quote_money(p_quote_id uuid)
returns numeric language plpgsql as $$
declare
  v_base       numeric(10,2);
  v_supp       numeric(10,2);
  v_cost_base  numeric(10,2);
  v_cost_supp  numeric(10,2);
  v_lines      numeric(10,2);
  v_cost_lines numeric(10,2);
  v_total      numeric(10,2);
  v_cost       numeric(10,2);
begin
  select coalesce(base_eur, 0), coalesce(season_supplement_eur, 0),
         coalesce(cost_base_eur, 0), coalesce(season_supplement_cost_eur, 0)
    into v_base, v_supp, v_cost_base, v_cost_supp
    from comercial.quotes where id = p_quote_id;

  -- Un descuento resta de ambos lados: le rebaja al cliente y, si el proveedor
  -- lo concede, también al costo. Mismo criterio que traía recompute_quote_total.
  select coalesce(sum(case when type = 'discount' then -total else total end), 0),
         coalesce(sum(case when type = 'discount' then -(quantity * coalesce(cost_unit, 0))
                           else (quantity * coalesce(cost_unit, 0)) end), 0)
    into v_lines, v_cost_lines
    from comercial.quote_lines
    where quote_id = p_quote_id and type in ('optional','custom','discount','bike');

  v_total := v_base + v_supp + v_lines;
  v_cost  := v_cost_base + v_cost_supp + v_cost_lines;

  update comercial.quotes
     set total_eur = v_total,
         cost_eur  = v_cost
   where id = p_quote_id;

  return v_total;
end $$;

-- =============================================================
-- 4. Trazabilidad: de qué cotización nació esta
-- =============================================================
-- El flujo de bici es de dos pasos: primero se le manda al peregrino la cotización con la
-- flota y sus precios para que elija, y cuando elige se emite una cotización NUEVA con esa
-- bicicleta sumada. Guardar el padre permite ver la pareja en seguimiento y no confundirlas.
alter table comercial.quotes add column if not exists parent_quote_id uuid
  references comercial.quotes(id) on delete set null;

create index if not exists quotes_parent_idx on comercial.quotes(parent_quote_id);

comment on column comercial.quotes.parent_quote_id is
  'Cotización de la que salió esta. La usa el flujo de bici: la cotización con la bicicleta elegida apunta a la que le mostró la flota al peregrino.';

-- =============================================================
-- RLS + grants, igual que el resto del schema
-- =============================================================
do $$
declare t text;
begin
  foreach t in array array['bikes','bike_prices','bike_price_history']
  loop
    execute format('alter table comercial.%I enable row level security', t);
    execute format('drop policy if exists "auth_all" on comercial.%I', t);
    execute format(
      'create policy "auth_all" on comercial.%I for all to authenticated using (true) with check (true)',
      t
    );
    execute format('grant all on comercial.%I to authenticated', t);
  end loop;
end $$;

grant usage, select on all sequences in schema comercial to authenticated;
