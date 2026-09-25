-- 0056: cuándo se bajó la carta de bienvenida de una cotización.
--
-- La carta no se guarda (se arma en cada clic), así que no quedaba rastro de si ya se le
-- había preparado al cliente. El seguimiento va paso a paso con un chulito en cada paso
-- hecho, y este era el único sin dato. Se marca al DESCARGARLA, no al abrirla: abrirla es
-- mirar cómo quedó; bajarla es para mandarla.
--
-- Aditiva: no toca nada existente.

alter table comercial.quotes add column if not exists welcome_letter_at timestamptz;

comment on column comercial.quotes.welcome_letter_at is
  'Última vez que se descargó la carta de bienvenida desde el seguimiento. NULL = nunca.';
