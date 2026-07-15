-- 0008: integración con el cotizador de caminosacro.com (WordPress).
-- Aditiva: no toca datos existentes. Aplicar ANTES de desplegar el código que
-- inserta quotes con source = 'wordpress'.

-- Consentimientos capturados en el paso 3 del cotizador web (Ley 1581 de 2012).
alter table comercial.clients
  add column if not exists marketing_optin boolean,
  add column if not exists marketing_optin_at timestamptz,
  add column if not exists terms_accepted_at timestamptz;

comment on column comercial.clients.marketing_optin is
  'Consentimiento para recibir marketing por correo (checkbox opcional del cotizador web). null = nunca se le preguntó.';

-- Nuevo origen de cotizaciones: el cotizador del sitio WordPress.
alter table comercial.quotes drop constraint if exists quotes_source_check;
alter table comercial.quotes
  add constraint quotes_source_check check (source in ('interna', 'web', 'wordpress'));

-- Desglose de habitaciones para grupos impares (N dobles + M individuales).
-- El PDF lo usa para pintar el resumen de inversión por habitación; null = una sola modalidad.
alter table comercial.quotes
  add column if not exists rooms_json jsonb;

comment on column comercial.quotes.rooms_json is
  'Desglose de habitaciones: {"dobles":N,"individuales":M,"tarifa_doble":X,"tarifa_single":Y,"tipo":"pension|hotel"} (tarifas por persona, EUR). null = modalidad única.';
