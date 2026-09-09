-- 0039_informe_firmas_otp.sql
--
-- El Informe de Firmas al estilo ZapSign, y lo que hace falta para sostenerlo:
--
-- 1. CÓDIGO POR CORREO (OTP). Hasta ahora el viajero firmaba con nombre + pasaporte +
--    trazo, sin que nadie comprobara que el correo era suyo. Ahora, antes de firmar, recibe
--    un código de seis dígitos en el correo del contrato y lo teclea. Es lo que ZapSign
--    reporta como "Validado por código único enviado por e-mail" y lo que da al informe su
--    peso: el control exclusivo del firmante (Ley 527/1999, art. 7).
-- 2. EVIDENCIA COMPLETA. Hash del documento ORIGINAL (el que se le presentó), ubicación
--    aproximada, método de autenticación, el texto exacto del consentimiento y el teléfono,
--    tal como los imprime el informe.
-- 3. BITÁCORA. Cada paso (código enviado, fallido, validado, firmado, PDF sellado) queda en
--    una tabla que solo crece: es lo que permite reconstruir qué pasó si algún día hay disputa.
--
-- Y una decisión: el token del enlace YA NO SE ANULA AL FIRMAR. El viajero que vuelve a
-- abrir su enlace debe ver "contrato ya firmado" y no "enlace no válido" (hallazgo B3 de la
-- auditoría). La acción de firma revalida `status = 'enviado'` en el servidor, así que dejar
-- el token vivo no abre nada.
--
-- Aditiva: nada de lo existente cambia de comportamiento.

alter table comercial.contracts
  add column if not exists pdf_original_sha256 text,
  add column if not exists signer_geo text,
  add column if not exists signer_auth_method text,
  add column if not exists consent_text text,
  add column if not exists signer_phone text;

comment on column comercial.contracts.pdf_original_sha256 is
  'SHA-256 del PDF tal como se le presentó al firmante (sin Informe de Firmas). Es la huella que se imprime en el informe.';
comment on column comercial.contracts.doc_hash is
  'SHA-256 del PDF firmado y sellado (con el Informe de Firmas). Es la huella que se comprueba en /verificar.';
comment on column comercial.contracts.signer_geo is
  'Ubicación aproximada "lat, lon" reportada por el navegador del firmante, si concedió el permiso. Null si no.';
comment on column comercial.contracts.signer_auth_method is
  'Cómo se comprobó la identidad al firmar: otp_email (código al correo).';
comment on column comercial.contracts.consent_text is
  'Texto exacto de la declaración que aceptó el firmante, archivado en el momento de la firma.';
comment on column comercial.contracts.token is
  'Enlace público de firma. Desde 0039 no se anula al firmar: el viajero puede reabrirlo y ver su contrato firmado.';

-- =============================================================
-- Códigos de un solo uso
-- =============================================================
create table if not exists comercial.contract_otps (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references comercial.contracts(id) on delete cascade,
  code_hash text not null,          -- sha256(contract_id:codigo); el código nunca se guarda en claro
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table comercial.contract_otps is
  'Códigos de seis dígitos enviados al correo del firmante. Se guardan hasheados; vencen a los 10 minutos y se bloquean a los 5 intentos.';

create index if not exists contract_otps_contract_idx
  on comercial.contract_otps (contract_id, created_at desc);

alter table comercial.contract_otps enable row level security;
drop policy if exists "auth_all" on comercial.contract_otps;
create policy "auth_all" on comercial.contract_otps for all to authenticated using (true) with check (true);

-- =============================================================
-- Bitácora de la firma (solo crece)
-- =============================================================
create table if not exists comercial.contract_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references comercial.contracts(id) on delete cascade,
  event text not null,              -- otp_enviado | otp_fallido | otp_validado | firmado | pdf_sellado
  ip text,
  user_agent text,
  detail jsonb,
  created_at timestamptz not null default now()
);

comment on table comercial.contract_events is
  'Registro cronológico de cada paso de la firma electrónica. Solo inserta el servidor (service role); el equipo puede leerlo, nadie lo edita.';

create index if not exists contract_events_contract_idx
  on comercial.contract_events (contract_id, created_at);

alter table comercial.contract_events enable row level security;
drop policy if exists "auth_read" on comercial.contract_events;
create policy "auth_read" on comercial.contract_events for select to authenticated using (true);
