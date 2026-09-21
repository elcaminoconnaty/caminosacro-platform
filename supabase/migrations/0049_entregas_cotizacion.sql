-- 0049_entregas_cotizacion.sql
--
-- El historial de lo que se le ENTREGÓ al peregrino.
--
-- El problema: el PDF de la cotización vive en una ruta fija y se sube con `upsert`, así
-- que regenerarlo lo sobrescribe — y si cambia el nombre del cliente o la ruta, el archivo
-- viejo se borra. Del documento que alguien recibió el martes no quedaba nada el miércoles.
-- Los campos (precio, fechas, opcionales) tampoco: el editor los pisa.
--
-- Dónde duele de verdad: el contrato dice que la cotización "hace parte integral de este
-- Contrato como Anexo No. 1" y que el cliente "declara haber recibido copia". Ese anexo se
-- adjuntaba leyendo el archivo VIVO, así que una regeneración posterior a la firma dejaba
-- el contrato apuntando a un documento distinto del que se firmó.
--
-- Esta tabla congela cada entrega: una copia intocable del PDF, su huella SHA-256 y una
-- foto de las cifras. Se escribe cuando la cotización SALE —correo al cliente, mensaje de
-- WhatsApp, anexo de un contrato—, no en cada clic de "Regenerar": lo que no se entregó no
-- es historia, son tanteos, y llenarían la lista y el almacenamiento.
--
-- `datos` es jsonb y no veinte columnas a propósito: la foto tiene que poder crecer (hoy
-- ruta, fechas, personas, alojamiento, habitaciones, opcionales y suplemento; mañana lo que
-- haga falta) sin otra migración y sin que las entregas viejas mientan.
--
-- El PDF copiado se llama `entregas/v1-CS-2026-121.pdf` dentro de la carpeta de la
-- cotización. Si dos entregas llevan el MISMO documento (se reenvía sin tocar nada), la
-- segunda apunta al archivo de la primera: son dos entregas, un solo archivo.

create table if not exists comercial.quote_deliveries (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references comercial.quotes(id) on delete cascade,
  -- Correlativo por cotización: "v1", "v2"… Es lo que se enseña en pantalla.
  version integer not null,
  -- Por dónde salió: 'correo' | 'whatsapp' | 'contrato'.
  canal text not null,
  -- A quién: el correo o el teléfono. Null cuando el canal no lo tiene claro.
  destinatario text,
  pdf_path text not null,
  pdf_sha256 text not null,
  total_eur numeric(12,2),
  cost_eur numeric(12,2),
  datos jsonb not null default '{}'::jsonb,
  -- El envío que la produjo, si salió por correo (comercial.email_log).
  email_log_id uuid,
  -- Una prueba no es una entrega, pero tampoco se esconde: se marca y se filtra.
  prueba boolean not null default false,
  created_at timestamptz not null default now(),
  unique (quote_id, version)
);

create index if not exists quote_deliveries_quote_idx
  on comercial.quote_deliveries (quote_id, created_at desc);

alter table comercial.quote_deliveries enable row level security;
drop policy if exists "auth_all" on comercial.quote_deliveries;
create policy "auth_all" on comercial.quote_deliveries for all to authenticated using (true) with check (true);

comment on table comercial.quote_deliveries is
  'Historial de lo entregado al cliente: una fila por cada vez que la cotización salió (correo, WhatsApp o anexo del contrato), con copia intocable del PDF y foto de las cifras de ese momento.';
comment on column comercial.quote_deliveries.pdf_path is
  'Copia congelada del PDF tal como se entregó. Dos entregas del mismo documento comparten archivo (misma huella).';
comment on column comercial.quote_deliveries.datos is
  'Foto de la cotización en el momento de entregarla: ruta, fechas, personas, alojamiento, habitaciones, opcionales, suplemento. Crece sin migración.';
