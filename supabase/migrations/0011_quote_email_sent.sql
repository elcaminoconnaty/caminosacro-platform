-- 0011_quote_email_sent.sql
-- Marca de cuándo se envió la cotización por correo al cliente desde el CRM
-- (botón "Enviar correo" de la tarjeta de correo en seguimiento/[id]).
-- Antes no había rastro del envío: `status` nace en 'enviada' por defecto, así
-- que no servía para saber si el correo salió de verdad.

alter table comercial.quotes
  add column if not exists email_sent_at timestamptz;

comment on column comercial.quotes.email_sent_at is
  'Última vez que se envió la cotización por correo al cliente (webhook n8n → Brevo, reservas@caminosacro.com).';
