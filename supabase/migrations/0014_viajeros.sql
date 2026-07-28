-- 0014_viajeros.sql
-- Un contrato POR VIAJERO. Hasta ahora `contracts` tenía unique(quote_id): un viaje de
-- 20 personas admitía exactamente un contrato, un firmante y un pasaporte. No existía
-- ninguna tabla de pasajeros — `quotes.people` era solo un número.
--
-- Con esto, en una cotización de 20 se cargan los 20 nombres y correos, se generan 20
-- contratos personalizados y cada uno firma el suyo con su propio enlace y su pasaporte.
-- Esos pasaportes son, además, los que después se le adjuntan a Pilgrim.

create table if not exists comercial.quote_travelers (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references comercial.quotes(id) on delete cascade,
  position int not null,
  full_name text not null,
  email text,
  phone text,
  document_type text,
  document_number text,
  -- El titular es el que figura en la cotización; es quien recibe el correo comercial.
  is_holder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, position)
);

create index if not exists quote_travelers_quote_idx on comercial.quote_travelers (quote_id, position);

comment on table comercial.quote_travelers is
  'Viajeros de una cotización: uno por persona. Fuente de los contratos individuales y de la sección VIAJEROS del correo a Pilgrim.';
comment on column comercial.quote_travelers.document_number is
  'Número de pasaporte. Lo escribe el propio viajero al firmar su contrato; puede precargarse.';

alter table comercial.quote_travelers enable row level security;

do $$ begin
  create policy auth_all on comercial.quote_travelers
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- =============================================================
-- contracts: de uno por cotización a uno por viajero
-- =============================================================
alter table comercial.contracts
  add column if not exists traveler_id uuid references comercial.quote_travelers(id) on delete cascade;

-- El nombre del constraint lo puso Postgres al declarar `unique (quote_id)` en 0010.
alter table comercial.contracts drop constraint if exists contracts_quote_id_key;

-- Backfill: cada contrato que ya existe se convierte en el viajero titular (posición 1)
-- de su cotización, tomando los datos del snapshot que ya tenía en variables_json.
insert into comercial.quote_travelers (quote_id, position, full_name, email, phone, document_type, document_number, is_holder)
select
  c.quote_id,
  1,
  coalesce(nullif(c.variables_json->>'viajero_nombre', ''), 'Viajero 1'),
  nullif(c.variables_json->>'viajero_email', ''),
  nullif(c.variables_json->>'viajero_telefono', ''),
  nullif(c.variables_json->>'viajero_tipo_documento', ''),
  -- El documento definitivo es el que tecleó el firmante; si no ha firmado, el del snapshot.
  coalesce(nullif(c.signer_document, ''), nullif(c.variables_json->>'viajero_documento', '')),
  true
from comercial.contracts c
where c.traveler_id is null
on conflict (quote_id, position) do nothing;

update comercial.contracts c
   set traveler_id = t.id
  from comercial.quote_travelers t
 where t.quote_id = c.quote_id
   and t.position = 1
   and c.traveler_id is null;

-- Las cotizaciones sin contrato también estrenan su titular, para que la lista de
-- viajeros del CRM no arranque vacía.
insert into comercial.quote_travelers (quote_id, position, full_name, email, phone, is_holder)
select q.id, 1, coalesce(nullif(q.client_name, ''), 'Viajero 1'), q.client_email, q.client_phone, true
from comercial.quotes q
where not exists (select 1 from comercial.quote_travelers t where t.quote_id = q.id and t.position = 1)
on conflict (quote_id, position) do nothing;

-- Ya no puede haber contratos huérfanos de viajero.
alter table comercial.contracts alter column traveler_id set not null;

do $$ begin
  alter table comercial.contracts add constraint contracts_traveler_id_key unique (traveler_id);
exception when duplicate_object then null; end $$;

comment on column comercial.contracts.traveler_id is
  'Viajero que firma ESTE contrato. Un contrato por viajero; varios por cotización.';
