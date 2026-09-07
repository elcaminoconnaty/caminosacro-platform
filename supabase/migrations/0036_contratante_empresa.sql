-- 0036_contratante_empresa.sql
--
-- Cliente corporativo: empresas que mandan a sus trabajadores a hacer el Camino como
-- bienestar laboral, y grupos de colegiatura. La agencia contrata con LA EMPRESA, no con
-- cada persona.
--
-- Hasta ahora la plataforma solo sabía de personas naturales:
--   - `clients` es una persona, deduplicada por teléfono. No existía nada de razón social.
--   - `contracts.traveler_id` era NOT NULL + UNIQUE: un contrato por viajero,
--     obligatoriamente. Un grupo de 14 eran 14 contratos, 14 enlaces y 14 firmas — y a la
--     empresa hay que mandarle UNO, a su nombre, que su representante legal firma una vez.
--
-- Aditiva: ninguna fila existente cambia de comportamiento. `contracts.kind` nace en
-- 'viajero' para todas, que es exactamente lo que son.

-- =============================================================
-- 1. comercial.companies — el contratante persona jurídica
-- =============================================================
-- Tabla propia y no columnas sueltas en `clients` porque una empresa vuelve cada año (el
-- programa de bienestar es anual) y porque el NIT es su llave natural, igual que el
-- teléfono lo es en `clients`.

create table if not exists comercial.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  nit text not null unique,
  -- Dirección de notificaciones: la que va en la cláusula décima octava del contrato.
  address text,
  city text,
  -- Correo de notificaciones. Es el destinatario del contrato para firma y de su copia
  -- firmada; el contacto humano de la cotización (`quotes.client_email`) sigue aparte.
  email text,
  phone text,
  rep_name text,
  rep_document_type text default 'Cédula de ciudadanía',
  rep_document_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table comercial.companies is
  'Empresa que contrata el plan para sus trabajadores. Deduplicada por NIT. El correo y la dirección son los de notificaciones del contrato.';
comment on column comercial.companies.address is
  'Dirección de notificaciones (cláusula décima octava del contrato).';
comment on column comercial.companies.email is
  'Correo de notificaciones: destinatario del contrato para firma y de la copia firmada.';

drop trigger if exists companies_touch on comercial.companies;
create trigger companies_touch before update on comercial.companies
  for each row execute function comercial.touch_updated_at();

alter table comercial.companies enable row level security;
drop policy if exists "auth_all" on comercial.companies;
create policy "auth_all" on comercial.companies for all to authenticated using (true) with check (true);

-- =============================================================
-- 2. quotes.company_id — dónde se marca la modalidad
-- =============================================================
-- NO hay flag aparte: `company_id is not null` ES la modalidad empresa. Un booleano al
-- lado del id se desincroniza tarde o temprano; esto no puede.
--
-- `on delete restrict` igual que `quotes.client_id`: borrar una empresa que tiene
-- cotizaciones vivas dejaría contratos sin contratante.

alter table comercial.quotes
  add column if not exists company_id uuid references comercial.companies(id) on delete restrict;

create index if not exists quotes_company_idx on comercial.quotes (company_id);

comment on column comercial.quotes.company_id is
  'Empresa que contrata. Presencia = modalidad empresa: un solo contrato a nombre de ella en vez de uno por viajero.';

-- =============================================================
-- 3. contracts: un contrato que no cuelga de un viajero
-- =============================================================

alter table comercial.contracts
  add column if not exists kind text not null default 'viajero',
  add column if not exists company_id uuid references comercial.companies(id),
  add column if not exists travelers_json jsonb not null default '[]'::jsonb;

do $$ begin
  alter table comercial.contracts add constraint contracts_kind_check
    check (kind in ('viajero','empresa'));
exception when duplicate_object then null; end $$;

alter table comercial.contracts alter column traveler_id drop not null;

-- Cada modalidad tiene exactamente un dueño: o el viajero, o la empresa. Nunca los dos,
-- nunca ninguno.
do $$ begin
  alter table comercial.contracts add constraint contracts_kind_coherente check (
       (kind = 'viajero' and traveler_id is not null and company_id is null)
    or (kind = 'empresa' and traveler_id is null     and company_id is not null)
  );
exception when duplicate_object then null; end $$;

-- Un solo contrato de empresa por cotización. El `contracts_traveler_id_key` de 0014 se
-- queda como está: en Postgres los NULL no chocan entre sí en un unique, así que varios
-- contratos de empresa conviven sin tocarlo.
create unique index if not exists contracts_empresa_unica
  on comercial.contracts (quote_id) where kind = 'empresa';

comment on column comercial.contracts.kind is
  'viajero = uno por persona que firma el suyo. empresa = uno solo, a nombre de la sociedad, firmado por su representante legal.';
comment on column comercial.contracts.travelers_json is
  'Snapshot CONGELADO de la relación de viajeros del anexo, con documento y autorización de imagen. No se lee de quote_travelers al renderizar: un PDF firmado no puede cambiar de contenido, y el anexo es parte de lo que se firmó (mismo criterio que variables_json).';

-- =============================================================
-- 4. El pasaporte es del viajero, no del contrato
-- =============================================================
-- Vivía en `contracts.passport_path` porque solo entraba cuando el viajero firmaba SU
-- contrato. Con contrato de empresa nadie firma individualmente: los pasaportes los carga
-- el equipo desde el CRM y no hay fila de contrato donde colgarlos.
--
-- `contracts.passport_path` se conserva y se sigue escribiendo al firmar: es la prueba de
-- qué documento acompañó a esa firma. Lo operativo (el correo a Pilgrim) pasa a leer de acá.

alter table comercial.quote_travelers
  add column if not exists passport_path text;

comment on column comercial.quote_travelers.passport_path is
  'Foto/PDF del pasaporte en comercial-passports ("bucket/ruta/archivo"). La sube el viajero al firmar o el equipo desde el CRM. Fuente de los adjuntos del correo a Pilgrim.';

update comercial.quote_travelers t
   set passport_path = c.passport_path
  from comercial.contracts c
 where c.traveler_id = t.id
   and c.passport_path is not null
   and t.passport_path is null;
