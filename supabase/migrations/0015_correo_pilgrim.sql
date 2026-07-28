-- 0015_correo_pilgrim.sql
-- Módulo "Correo a Pilgrim" en el seguimiento: se le manda el detalle de la reserva
-- a SUS precios, con los pasaportes de los viajeros adjuntos, pidiendo el link de pago.
--
-- El destinatario vive en `settings` y no en una variable de entorno para poder
-- cambiarlo desde Configuración sin redesplegar.

alter table comercial.quotes
  add column if not exists pilgrim_email_sent_at timestamptz;

comment on column comercial.quotes.pilgrim_email_sent_at is
  'Última vez que se le envió a Pilgrim el detalle de la reserva pidiendo link de pago. Los envíos en modo prueba NO la marcan.';

insert into comercial.settings (key, value)
values ('pilgrim', '{"email": "", "nombre": "Pilgrim", "contacto": ""}'::jsonb)
on conflict (key) do nothing;
