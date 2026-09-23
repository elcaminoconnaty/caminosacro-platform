-- 0054_contrato_conjunto.sql
--
-- CONTRATO CONJUNTO: una tercera modalidad, opcional, al lado de "uno por viajero" y
-- "empresa". Nace con CS-2026-084 (sep-2026): dos viajeras compran UN plan por un valor
-- total, y con un contrato por viajera cada documento decía el total de las dos —dos
-- papeles que sumaban el doble de lo vendido, cada una obligada por el total en un
-- documento distinto—.
--
-- Aquí el contrato es UNO por cotización, con todos los viajeros como parte contratante,
-- obligados solidariamente por el valor total. Cada uno firma con su propio enlace y su
-- propio código al correo; el contrato se perfecciona y se sella cuando firma el último.
--
-- Por qué una tabla de firmantes y no más columnas en `contracts`: la firma (trazo, IP,
-- dispositivo, código validado, consentimiento) vivía en el contrato porque había un solo
-- firmante del lado del cliente. Con N firmantes esa evidencia es por persona. `contracts`
-- conserva el cierre del documento (PDF sellado, huellas, fecha en que quedó firmado).
--
-- Aditiva: los contratos por viajero y de empresa no cambian en nada.

-- =============================================================
-- 1. contracts: la nueva modalidad
-- =============================================================

alter table comercial.contracts drop constraint if exists contracts_kind_check;
alter table comercial.contracts add constraint contracts_kind_check
  check (kind in ('viajero','empresa','conjunto'));

-- El contrato conjunto no cuelga ni de un viajero ni de una empresa: sus partes están en
-- `contract_signers` y congeladas en `variables_json.partes`.
alter table comercial.contracts drop constraint if exists contracts_kind_coherente;
alter table comercial.contracts add constraint contracts_kind_coherente check (
     (kind = 'viajero'  and traveler_id is not null and company_id is null)
  or (kind = 'empresa'  and traveler_id is null     and company_id is not null)
  or (kind = 'conjunto' and traveler_id is null     and company_id is null)
);

-- Uno solo por cotización, igual que el de empresa.
create unique index if not exists contracts_conjunto_unico
  on comercial.contracts (quote_id) where kind = 'conjunto';

comment on column comercial.contracts.kind is
  'viajero = uno por persona que firma el suyo. empresa = uno solo, a nombre de la sociedad, firmado por su representante legal. conjunto = uno solo con todos los viajeros como parte, obligados solidariamente; cada uno firma con su enlace (contract_signers).';

-- =============================================================
-- 2. contract_signers: quién firma un contrato conjunto
-- =============================================================

create table if not exists comercial.contract_signers (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references comercial.contracts(id) on delete cascade,
  -- Restrict: borrar al viajero de la lista no puede llevarse por delante su firma.
  traveler_id uuid not null references comercial.quote_travelers(id) on delete restrict,
  position int not null,
  nombre text not null,
  email text,

  -- Su enlace de firma. Mismo comportamiento que `contracts.token` desde 0039: no se anula
  -- al firmar, para que al reabrirlo vea "ya firmaste" y no "enlace no válido".
  token text unique,
  token_expires_at timestamptz,

  -- Recordatorios, por persona: puede que una firme el primer día y la otra no.
  sent_at timestamptz,
  last_reminder_at timestamptz,
  reminder_count int not null default 0,

  -- La evidencia de SU firma (Ley 527/1999, Decreto 2364/2012), la misma que guarda
  -- `contracts` en las otras modalidades.
  signer_name text,
  signer_document text,
  signer_email text,
  signer_phone text,
  signature_image text,
  signed_at timestamptz,
  signer_ip text,
  signer_user_agent text,
  signer_geo text,
  signer_auth_method text,
  consent_text text,
  otp_id uuid,
  passport_path text,
  -- SHA-256 del documento tal como se le presentó a ESTA persona al firmar.
  pdf_presentado_sha256 text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, traveler_id)
);

comment on table comercial.contract_signers is
  'Firmantes de un contrato conjunto: uno por viajero, cada uno con su enlace, su código y la evidencia de su firma. El contrato queda firmado cuando todos tienen signed_at.';

create index if not exists contract_signers_contract_idx
  on comercial.contract_signers (contract_id, position);

create index if not exists contract_signers_recordatorios_idx
  on comercial.contract_signers (sent_at)
  where signed_at is null and token is not null;

drop trigger if exists contract_signers_touch on comercial.contract_signers;
create trigger contract_signers_touch before update on comercial.contract_signers
  for each row execute function comercial.touch_updated_at();

alter table comercial.contract_signers enable row level security;
drop policy if exists "auth_all" on comercial.contract_signers;
create policy "auth_all" on comercial.contract_signers
  for all to authenticated using (true) with check (true);

-- =============================================================
-- 3. Códigos y bitácora: de quién es cada paso
-- =============================================================

-- En un contrato conjunto hay varios firmantes pidiendo código sobre el mismo contrato:
-- el código es de la persona, no del contrato.
alter table comercial.contract_otps
  add column if not exists signer_id uuid references comercial.contract_signers(id) on delete cascade;

alter table comercial.contract_events
  add column if not exists signer_id uuid references comercial.contract_signers(id) on delete set null;

comment on column comercial.contract_otps.signer_id is
  'Firmante de un contrato conjunto al que se le envió el código. Null en las otras modalidades.';
comment on column comercial.contract_events.signer_id is
  'Firmante de un contrato conjunto al que corresponde el paso. Null en las otras modalidades.';
