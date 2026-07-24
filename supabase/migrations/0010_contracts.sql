-- 0010_contracts.sql
-- Contrato de prestación de servicios turísticos por cotización:
-- (1) tabla comercial.contracts (variables, plan de pago, firma y trazabilidad),
-- (2) buckets privados para el contrato firmado y la foto del pasaporte,
-- (3) datos de identificación del cliente que exige el contrato.
-- Aditiva: no toca datos existentes.

-- Identificación del viajero para el contrato (la tabla clients solo tenía contacto).
alter table comercial.clients
  add column if not exists document_type text,
  add column if not exists document_number text,
  add column if not exists address text;

comment on column comercial.clients.document_type is
  'Tipo de documento para el contrato: Pasaporte | Cédula de ciudadanía | Cédula de extranjería.';
comment on column comercial.clients.document_number is 'Número del documento de identidad (para el contrato).';

-- Un contrato por cotización. Si se necesita rehacer, se regenera sobre la misma fila
-- mientras no esté firmado; firmado queda inmutable (se controla en la aplicación).
create table if not exists comercial.contracts (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references comercial.quotes(id) on delete cascade,
  -- Variables del contrato (merge fields): snapshot editable de cotización + cliente.
  variables_json jsonb not null default '{}'::jsonb,
  -- Plan de pago: {"type":"contado"} o {"type":"financiado","cuotas":[{"n":1,"fecha":"...","monto_eur":X},...]}
  payment_plan_json jsonb not null default '{"type":"contado"}'::jsonb,
  status text not null default 'borrador'
    check (status in ('borrador','enviado','firmado','anulado')),
  -- Link público de firma
  token text unique,
  token_expires_at timestamptz,
  -- Archivos en Storage ("bucket/archivo")
  pdf_path text,          -- contrato sin firmar (preview)
  signed_pdf_path text,   -- contrato firmado final
  passport_path text,     -- foto del pasaporte subida por el viajero
  -- Firma y trazabilidad (Ley 527 de 1999 / Decreto 2364 de 2012)
  signer_name text,
  signer_document text,
  signer_email text,
  signature_image text,   -- data URL (PNG) de la firma dibujada
  signed_at timestamptz,
  signer_ip text,
  signer_user_agent text,
  doc_hash text,          -- SHA-256 del PDF presentado al firmar
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id)
);

comment on table comercial.contracts is
  'Acuerdo de prestación de servicios turísticos por cotización: variables, plan de pago, link de firma, firma electrónica y documentos.';

drop trigger if exists contracts_touch on comercial.contracts;
create trigger contracts_touch before update on comercial.contracts
  for each row execute function comercial.touch_updated_at();

alter table comercial.contracts enable row level security;
drop policy if exists "auth_all" on comercial.contracts;
create policy "auth_all" on comercial.contracts for all to authenticated using (true) with check (true);

-- Buckets privados (mismo patrón que comercial-receipts en 0009). La página pública
-- de firma opera con service_role; el equipo autenticado puede leer/gestionar.
insert into storage.buckets (id, name, public) values
  ('comercial-contracts','comercial-contracts', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values
  ('comercial-passports','comercial-passports', false) on conflict do nothing;

drop policy if exists "comercial_contracts_read" on storage.objects;
create policy "comercial_contracts_read" on storage.objects
  for select to authenticated using (bucket_id = 'comercial-contracts');

drop policy if exists "comercial_contracts_write" on storage.objects;
create policy "comercial_contracts_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'comercial-contracts');

drop policy if exists "comercial_contracts_update" on storage.objects;
create policy "comercial_contracts_update" on storage.objects
  for update to authenticated using (bucket_id = 'comercial-contracts') with check (bucket_id = 'comercial-contracts');

drop policy if exists "comercial_contracts_delete" on storage.objects;
create policy "comercial_contracts_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'comercial-contracts');

drop policy if exists "comercial_passports_read" on storage.objects;
create policy "comercial_passports_read" on storage.objects
  for select to authenticated using (bucket_id = 'comercial-passports');

drop policy if exists "comercial_passports_write" on storage.objects;
create policy "comercial_passports_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'comercial-passports');

drop policy if exists "comercial_passports_update" on storage.objects;
create policy "comercial_passports_update" on storage.objects
  for update to authenticated using (bucket_id = 'comercial-passports') with check (bucket_id = 'comercial-passports');

drop policy if exists "comercial_passports_delete" on storage.objects;
create policy "comercial_passports_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'comercial-passports');
