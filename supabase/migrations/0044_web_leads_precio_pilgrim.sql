-- 0044: cuándo se le pidió el precio a Pilgrim para un lead de la web.
--
-- Provisional por diseño: existe porque Pilgrim todavía no ha dado las tarifas de 2027 y
-- mientras tanto cada lead de publicidad que pide 2027 cae en `web_leads` sin precio. En
-- vez de esperar a la tabla de tarifas completa, Nico le pide a Pilgrim el precio de ESA
-- salida concreta desde el panel de Seguimiento. Cuando 2027 esté cargado, el cotizador
-- vuelve a resolver solo y esta columna se queda como el registro de lo que costó la
-- espera.
--
-- Solo la marca de tiempo: el contenido del correo ya queda en `comercial.email_log`
-- (migración 0028) con su destinatario, su asunto y si Brevo lo confirmó. Duplicarlo acá
-- sería tener dos versiones de lo mismo que pueden discrepar.
--
-- Aditiva: una columna que admite null. El código viejo no la toca.

alter table comercial.web_leads
  add column if not exists precio_solicitado_at timestamptz;

comment on column comercial.web_leads.precio_solicitado_at is
  'Cuándo se le mandó a Pilgrim la solicitud de precio de esta salida. null = todavía no se ha pedido. El correo en sí queda en comercial.email_log con tipo precio_pilgrim.';
