-- 0006_payment_accounts.sql
-- Cuenta bancaria por la que entra/sale cada pago, para el dashboard financiero.
-- Slugs: 'bancolombia_naty' | 'bancolombia_camino' | 'santander' (texto libre, validado en la app).

alter table comercial.client_payments   add column if not exists account text;
alter table comercial.provider_payments add column if not exists account text;
