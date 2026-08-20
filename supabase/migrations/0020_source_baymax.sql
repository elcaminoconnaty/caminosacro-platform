-- 0020: cotizaciones creadas por BayMax desde Telegram.
-- Aditiva: no toca datos existentes. Aplicar ANTES de desplegar el código que
-- inserta quotes con source = 'baymax'.

-- Nuevo origen. No es 'wordpress' a propósito: aquélla la crea un visitante del
-- sitio y va con chapita WEB; ésta la crea Nico por Telegram a través del agente,
-- se comporta como una cotización interna (hasta 30 personas, sin correo
-- automático al cliente) y lleva su propia chapita para saber de dónde salió.
alter table comercial.quotes drop constraint if exists quotes_source_check;
alter table comercial.quotes
  add constraint quotes_source_check check (source in ('interna', 'web', 'wordpress', 'baymax'));
