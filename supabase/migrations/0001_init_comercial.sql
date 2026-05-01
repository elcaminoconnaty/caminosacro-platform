-- =============================================================
-- Migración inicial — schema `comercial` para Plataforma Camino Sacro
-- Aplica idempotente: usa CREATE ... IF NOT EXISTS donde puede.
-- Tras aplicar: agregar `comercial` a Settings → API → Exposed schemas.
-- =============================================================

create schema if not exists comercial;
grant usage on schema comercial to anon, authenticated;

-- ---------- Funciones helpers ----------
create or replace function comercial.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =============================================================
-- 1. Settings (config global, key/value JSON)
-- =============================================================
create table if not exists comercial.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
drop trigger if exists settings_touch on comercial.settings;
create trigger settings_touch before update on comercial.settings
  for each row execute function comercial.touch_updated_at();

-- =============================================================
-- 2. Routes
-- =============================================================
create table if not exists comercial.routes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  origin text,
  destination text,
  days int,
  nights int,
  stages int,
  km numeric,
  modality text check (modality in ('senderismo','bici','mixto')) default 'senderismo',
  difficulty text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists routes_touch on comercial.routes;
create trigger routes_touch before update on comercial.routes
  for each row execute function comercial.touch_updated_at();

-- =============================================================
-- 3. Route stages (etapas por día)
-- =============================================================
create table if not exists comercial.route_stages (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references comercial.routes(id) on delete cascade,
  day int not null,
  from_place text,
  to_place text,
  km numeric,
  accommodation text,
  notes text,
  created_at timestamptz not null default now(),
  unique (route_id, day)
);

-- =============================================================
-- 4. Pricing (precios por ruta x modalidad x temporada)
-- =============================================================
create table if not exists comercial.pricing (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references comercial.routes(id) on delete cascade,
  modality text not null, -- 'pension_doble' | 'pension_single' | 'hotel_doble' | 'hotel_single'
  season text default 'regular', -- 'regular' | 'semana_santa' | etc.
  valid_from date,
  valid_to date,
  price_pilgrim numeric(10,2),
  price_cs numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, modality, season, valid_from)
);
drop trigger if exists pricing_touch on comercial.pricing;
create trigger pricing_touch before update on comercial.pricing
  for each row execute function comercial.touch_updated_at();

-- =============================================================
-- 5. Pricing history (audit log)
-- =============================================================
create table if not exists comercial.pricing_history (
  id bigserial primary key,
  pricing_id uuid not null references comercial.pricing(id) on delete cascade,
  field text not null, -- 'price_pilgrim' | 'price_cs'
  old_value numeric,
  new_value numeric,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

-- Trigger that captures price changes automatically.
create or replace function comercial.log_price_change()
returns trigger language plpgsql as $$
begin
  if new.price_pilgrim is distinct from old.price_pilgrim then
    insert into comercial.pricing_history (pricing_id, field, old_value, new_value, changed_by)
      values (new.id, 'price_pilgrim', old.price_pilgrim, new.price_pilgrim, auth.uid());
  end if;
  if new.price_cs is distinct from old.price_cs then
    insert into comercial.pricing_history (pricing_id, field, old_value, new_value, changed_by)
      values (new.id, 'price_cs', old.price_cs, new.price_cs, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists pricing_audit on comercial.pricing;
create trigger pricing_audit after update on comercial.pricing
  for each row execute function comercial.log_price_change();

-- =============================================================
-- 6. Optional services (seguros, noches extra, transfers)
-- =============================================================
create table if not exists comercial.optional_services (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  category text not null, -- 'seguro' | 'noche_extra' | 'transfer' | 'tour' | 'meal' | 'gift'
  name text not null,
  unit text default 'persona', -- 'persona' | 'noche' | 'servicio'
  price_pilgrim numeric(10,2),
  price_cs numeric(10,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists optional_services_touch on comercial.optional_services;
create trigger optional_services_touch before update on comercial.optional_services
  for each row execute function comercial.touch_updated_at();

-- =============================================================
-- 7. Clients (peregrinos)
-- =============================================================
create table if not exists comercial.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  country text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone)
);
drop trigger if exists clients_touch on comercial.clients;
create trigger clients_touch before update on comercial.clients
  for each row execute function comercial.touch_updated_at();

-- =============================================================
-- 8. Quotes
-- =============================================================
create table if not exists comercial.quotes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  client_id uuid references comercial.clients(id) on delete restrict,
  -- snapshot del cliente al emitir (por si cambia el master luego)
  client_name text,
  client_phone text,
  client_email text,
  route_id uuid references comercial.routes(id),
  route_name text,
  start_date date,
  end_date date,
  people int default 1,
  modality text,
  notes text,
  total_eur numeric(10,2) default 0,
  cost_eur numeric(10,2) default 0,
  status text not null default 'borrador'
    check (status in ('borrador','enviada','aceptada','en_pago','pagada','viajada','cancelada')),
  valid_until date,
  pdf_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists quotes_touch on comercial.quotes;
create trigger quotes_touch before update on comercial.quotes
  for each row execute function comercial.touch_updated_at();

create index if not exists quotes_status_idx on comercial.quotes(status);
create index if not exists quotes_client_idx on comercial.quotes(client_id);

-- =============================================================
-- 9. Quote lines
-- =============================================================
create table if not exists comercial.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references comercial.quotes(id) on delete cascade,
  position int not null default 0,
  type text not null check (type in ('route','optional','custom','discount')),
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(10,2) not null default 0,
  total numeric(10,2) generated always as (quantity * unit_price) stored,
  cost_unit numeric(10,2),
  reference_id uuid, -- pricing_id or optional_service_id (no FK, free)
  created_at timestamptz not null default now()
);
create index if not exists quote_lines_quote_idx on comercial.quote_lines(quote_id);

-- =============================================================
-- 10. Client payments (con TRM al recibir si fue COP)
-- =============================================================
create table if not exists comercial.client_payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references comercial.quotes(id) on delete cascade,
  paid_at date not null default current_date,
  amount numeric(10,2) not null,
  currency text not null default 'EUR' check (currency in ('EUR','COP','USD')),
  trm_eur_cop numeric(12,4), -- only when currency='COP'
  amount_eur numeric(10,2), -- normalized to EUR for saldo
  method text, -- 'transferencia' | 'efectivo' | 'tarjeta' | 'paypal' | 'wise'
  reference text,
  receipt_path text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists client_payments_quote_idx on comercial.client_payments(quote_id);

-- =============================================================
-- 11. Provider payments (a Pilgrim, en EUR)
-- =============================================================
create table if not exists comercial.provider_payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references comercial.quotes(id) on delete cascade,
  paid_at date not null default current_date,
  amount_eur numeric(10,2) not null,
  invoice_number text,
  receipt_path text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists provider_payments_quote_idx on comercial.provider_payments(quote_id);

-- =============================================================
-- 12. Welcome letters
-- =============================================================
create table if not exists comercial.welcome_letters (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references comercial.routes(id) on delete set null,
  name text not null,
  storage_path text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =============================================================
-- 13. Route catalogs (fichas Pilgrim)
-- =============================================================
create table if not exists comercial.route_catalogs (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references comercial.routes(id) on delete set null,
  name text not null,
  storage_path text not null,
  source text default 'pilgrim',
  created_at timestamptz not null default now()
);

-- =============================================================
-- 14. TRM history
-- =============================================================
create table if not exists comercial.trm_history (
  date date primary key,
  eur_cop numeric(12,4) not null,
  source text,
  fetched_at timestamptz not null default now()
);

-- =============================================================
-- 15. Email templates
-- =============================================================
create table if not exists comercial.email_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, -- 'cotizacion_enviada' | 'recordatorio_pago' | ...
  subject text not null,
  body_md text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
drop trigger if exists email_templates_touch on comercial.email_templates;
create trigger email_templates_touch before update on comercial.email_templates
  for each row execute function comercial.touch_updated_at();

-- =============================================================
-- 16. Quote codes (secuencia segura CS-YYYY-NNN)
-- =============================================================
create table if not exists comercial.quote_codes (
  year int primary key,
  last_number int not null default 0
);

create or replace function comercial.next_quote_code()
returns text language plpgsql as $$
declare
  yr int := extract(year from now());
  n int;
begin
  insert into comercial.quote_codes(year, last_number) values (yr, 1)
    on conflict (year) do update set last_number = comercial.quote_codes.last_number + 1
    returning last_number into n;
  return format('CS-%s-%s', yr, lpad(n::text, 3, '0'));
end $$;

-- =============================================================
-- RLS — single-user app, but enabled and locked to authenticated users.
-- =============================================================
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'comercial'
  loop
    execute format('alter table comercial.%I enable row level security', t);
    execute format('drop policy if exists "auth_all" on comercial.%I', t);
    execute format(
      'create policy "auth_all" on comercial.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- Grants to roles used by PostgREST
grant all on all tables in schema comercial to authenticated;
grant all on all sequences in schema comercial to authenticated;
grant all on all functions in schema comercial to authenticated;
alter default privileges in schema comercial grant all on tables to authenticated;
alter default privileges in schema comercial grant all on sequences to authenticated;
alter default privileges in schema comercial grant all on functions to authenticated;

-- =============================================================
-- Storage buckets (created via Supabase API; this SQL only registers metadata if buckets exist)
-- =============================================================
-- The following buckets need to be created via Dashboard or API:
--   comercial-quotes      (private)
--   comercial-welcome     (private)
--   comercial-catalogs    (private)
--   comercial-receipts    (private)
-- The seed script will create them via the storage API.
