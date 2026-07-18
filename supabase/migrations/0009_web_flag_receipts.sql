-- 0009_web_flag_receipts.sql
-- (1) Flag de visibilidad de rutas en el cotizador público de caminosacro.com.
-- (2) Recibos de pago del cliente: número estable + bucket de PDFs.

-- Rutas visibles en el cotizador web. El CRM siempre ve todas; la web solo estas.
alter table comercial.routes add column if not exists web boolean not null default false;

comment on column comercial.routes.web is
  'true = aparece en el cotizador de caminosacro.com (/api/wp/pricing) y en /cotizar. Las rutas internas/personalizadas quedan en false.';

-- Semilla: estándar = activas con las 4 tarifas completas en temporada regular.
-- Cualquier ajuste posterior se hace con el checkbox "Visible en cotizador web" del catálogo.
update comercial.routes r set web = true
where r.active
  and 4 = (
    select count(*) from comercial.pricing p
    where p.route_id = r.id
      and p.season = 'regular'
      and p.modality in ('pension_doble','pension_single','hotel_doble','hotel_single')
      and coalesce(p.price_cs, 0) > 0
  );

-- Número de recibo estable por pago (REC-{code}-{n}); no cambia si se borra otro pago.
alter table comercial.client_payments add column if not exists receipt_number text;

-- Bucket privado para recibos de pago (mismo patrón que comercial-hotels en 0004).
insert into storage.buckets (id, name, public) values
  ('comercial-receipts','comercial-receipts', false) on conflict do nothing;

drop policy if exists "comercial_receipts_read" on storage.objects;
create policy "comercial_receipts_read" on storage.objects
  for select to authenticated using (bucket_id = 'comercial-receipts');

drop policy if exists "comercial_receipts_write" on storage.objects;
create policy "comercial_receipts_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'comercial-receipts');

drop policy if exists "comercial_receipts_update" on storage.objects;
create policy "comercial_receipts_update" on storage.objects
  for update to authenticated using (bucket_id = 'comercial-receipts') with check (bucket_id = 'comercial-receipts');

drop policy if exists "comercial_receipts_delete" on storage.objects;
create policy "comercial_receipts_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'comercial-receipts');
