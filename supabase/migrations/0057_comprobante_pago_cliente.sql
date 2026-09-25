-- 0057: comprobante de los pagos del cliente (el pantallazo de la transferencia que nos manda).
--
-- No puede ir en `receipt_path`: esa columna ya la ocupa el recibo PDF que GENERAMOS nosotros
-- (REC-...). Los pagos a Pilgrim sí usan `provider_payments.receipt_path`, que estaba libre.
-- Archivos en comercial-docs/{año}/{código}/pagos-cliente/.
--
-- Aditiva: no toca nada existente.

alter table comercial.client_payments add column if not exists proof_path text;

comment on column comercial.client_payments.proof_path is
  'Comprobante que mandó el cliente (imagen o PDF), con bucket adelante. NULL = sin soporte.';
