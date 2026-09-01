-- 0031_documentos_pilgrim.sql
-- El archivo de lo que Pilgrim nos manda de cada reserva.
--
-- Hoy eso vive en el correo de Nico: la documentación de viaje completa que ellos arman,
-- la cotización que mandan en algunas reservas, la confirmación, la factura, un cambio de
-- alojamiento. Cuando hay que responderle a un cliente o cuadrar un cobro, la respuesta
-- está enterrada en una conversación de tres meses.
--
-- Esto NO es la documentación de viaje del peregrino (comercial.travel_docs). Aquello es
-- lo que producimos y le mandamos al cliente; esto es lo que recibimos del proveedor y se
-- queda adentro. Por eso son dos tablas y no columnas nuevas en la otra: aquí no hay un
-- número fijo de archivos ni un tipo esperado, cada expediente acumula los que sean.
--
-- Los archivos van a la carpeta de la cotización, en la subcarpeta `pilgrim/`, así que
-- todo lo del cliente sigue junto y navegable desde el explorador de Supabase:
--   comercial-docs/2026/CS-2026-034/pilgrim/1756...-Confirmacion-A47397.pdf

create table if not exists comercial.quote_pilgrim_files (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references comercial.quotes(id) on delete cascade,
  -- Nombre que se ve en el CRM. Arranca como el del archivo subido y se puede renombrar:
  -- "Confirmacion_47397_final_v2.pdf" no le dice nada a nadie dentro de seis meses.
  name text not null,
  -- Etiqueta libre para agrupar: 'documentacion' y 'cotizacion' son las dos que de verdad
  -- llegan siempre; también 'confirmacion', 'factura', 'cambio', 'otro'. Sin CHECK a
  -- propósito: que aparezca una categoría nueva no debe exigir una migración.
  kind text,
  storage_path text not null,
  mime text,
  size_bytes bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists quote_pilgrim_files_touch on comercial.quote_pilgrim_files;
create trigger quote_pilgrim_files_touch before update on comercial.quote_pilgrim_files
  for each row execute function comercial.touch_updated_at();

create index if not exists quote_pilgrim_files_quote_idx
  on comercial.quote_pilgrim_files (quote_id, created_at desc);

comment on table comercial.quote_pilgrim_files is
  'Archivo de lo que Pilgrim nos envía de cada reserva (confirmaciones, facturas, su documentación). Interno: nunca se le manda al cliente. Lo que sí recibe el cliente vive en comercial.travel_docs.';

alter table comercial.quote_pilgrim_files enable row level security;
drop policy if exists "auth_all" on comercial.quote_pilgrim_files;
create policy "auth_all" on comercial.quote_pilgrim_files for all to authenticated using (true) with check (true);
grant all on comercial.quote_pilgrim_files to authenticated;
