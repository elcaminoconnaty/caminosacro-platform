-- 0045: el expediente que nace de un lead sin precio.
--
-- Desde 0035 una solicitud que la web no puede cotizar se guarda en `web_leads` y no crea
-- cotización: el precio es justamente lo que no se puede calcular. El efecto secundario es
-- que esas personas no salen en el listado de cotizaciones, que es donde Nico mira, y
-- viven en un panel aparte. Ya pasó: un lead cerrado desapareció de la vista y pareció
-- perdido.
--
-- A partir de ahora el endpoint crea igualmente la cotización, vacía de precio y en
-- `sin_enviar`. Esta columna las enlaza: desde el lead se sabe qué expediente lo atiende,
-- y `on delete set null` deja borrar la cotización sin llevarse el lead por delante —el
-- lead es el registro de que alguien preguntó, y eso pasó aunque el expediente se tire.
--
-- Aditiva: una columna que admite null.

alter table comercial.web_leads
  add column if not exists quote_id uuid references comercial.quotes(id) on delete set null;

comment on column comercial.web_leads.quote_id is
  'Cotización sin precio creada para atender este lead. null = el lead es anterior a la 0045, o no se pudo crear.';

create index if not exists web_leads_quote_idx on comercial.web_leads (quote_id);
