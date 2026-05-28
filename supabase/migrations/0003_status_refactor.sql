-- 0003_status_refactor.sql
-- Reduce los estados de cotización a 6 valores y migra los históricos.
-- Estados finales: enviada, aceptada, pago_parcial, pago_completo, completada, cancelada

-- 1) Quitar el CHECK viejo (permite migrar a valores nuevos)
alter table comercial.quotes drop constraint if exists quotes_status_check;

-- 2) Migrar valores históricos al nuevo set
update comercial.quotes set status = 'enviada'       where status = 'borrador';
update comercial.quotes set status = 'pago_parcial'  where status = 'en_pago';
update comercial.quotes set status = 'pago_completo' where status = 'pagada';
update comercial.quotes set status = 'completada'    where status = 'viajada';

-- 3) Default para nuevas cotizaciones
alter table comercial.quotes alter column status set default 'enviada';

-- 4) Nuevo CHECK con los 6 estados
alter table comercial.quotes
  add constraint quotes_status_check
  check (status in ('enviada','aceptada','pago_parcial','pago_completo','completada','cancelada'));
