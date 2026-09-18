-- 0046: de dónde vino cada persona que cotizó.
--
-- Meta sabe qué anuncio produjo un "Lead" y el CRM sabe quién firmó, pero nadie une las
-- dos cosas: en la base no queda ni el anuncio, ni la campaña, ni la página por la que
-- entró la persona. Sin eso "coste por venta" no existe, solo "coste por cotización".
--
-- El tema de caminosacro.com guarda el primer toque en una cookie (utm_*, fbclid, gclid,
-- página de entrada y referente) y lo manda con cada cotización o lead. Aquí se guarda
-- tal cual: son datos para leer, no para decidir nada en la aplicación.
--
-- `fbp`/`fbc` ya viajaban a la Conversions API en el momento del Lead pero no se
-- guardaban: se necesitan después, cuando la cotización pasa a aceptada y hay que
-- contarle a Meta la venta con la misma identidad. `meta_purchase_sent_at` evita
-- contarle la misma venta dos veces (aceptada → pago_parcial → pago_completo).

alter table comercial.quotes
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content  text,
  add column if not exists utm_term     text,
  add column if not exists fbclid       text,
  add column if not exists gclid        text,
  add column if not exists landing_page text,
  add column if not exists referrer     text,
  add column if not exists fbp          text,
  add column if not exists fbc          text,
  add column if not exists meta_purchase_sent_at timestamptz;

alter table comercial.web_leads
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content  text,
  add column if not exists utm_term     text,
  add column if not exists fbclid       text,
  add column if not exists gclid        text,
  add column if not exists landing_page text,
  add column if not exists referrer     text,
  add column if not exists fbp          text,
  add column if not exists fbc          text;

comment on column comercial.quotes.utm_content is 'Identificador del anuncio (utm_content) con el que entró la persona. Primer toque, lo pone el tema de la web.';
comment on column comercial.quotes.meta_purchase_sent_at is 'Cuándo se le contó a Meta (CAPI, evento Purchase) que esta cotización se aceptó. Una sola vez por cotización.';

create index if not exists quotes_utm_content_idx on comercial.quotes (utm_content) where utm_content is not null;
