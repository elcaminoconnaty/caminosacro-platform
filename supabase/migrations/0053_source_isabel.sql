-- 0053: cotizaciones creadas por Isabel (asesora de WhatsApp) con el flujo del cotizador
-- web. Aditiva. Aplicar ANTES de desplegar el código que inserta source = 'isabel'.
alter table comercial.quotes drop constraint if exists quotes_source_check;
alter table comercial.quotes
  add constraint quotes_source_check check (source in ('interna', 'web', 'wordpress', 'baymax', 'isabel'));
