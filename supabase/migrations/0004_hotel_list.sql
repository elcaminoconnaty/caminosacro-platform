-- 0004_hotel_list.sql
-- Listado de hoteles por cotización (enviado por Pilgrim) + PDF de hoteles.

create table if not exists comercial.quote_hotels (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references comercial.quotes(id) on delete cascade,
  position int not null default 0,
  night_date date,
  city text,
  hotel_name text,
  address text,
  contact text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists quote_hotels_quote_idx on comercial.quote_hotels(quote_id);

-- PDF de hoteles generado y subido a Storage
alter table comercial.quotes add column if not exists hotels_pdf_path text;

-- RLS: equipo interno autenticado
alter table comercial.quote_hotels enable row level security;
drop policy if exists "auth_all" on comercial.quote_hotels;
create policy "auth_all" on comercial.quote_hotels for all to authenticated using (true) with check (true);

-- Bucket privado para PDFs de hoteles (cubierto por las políticas storage 'comercial-%')
insert into storage.buckets (id, name, public) values
  ('comercial-hotels','comercial-hotels', false) on conflict do nothing;
