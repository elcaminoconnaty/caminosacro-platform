-- 0055_hilo_pilgrim.sql
--
-- El hilo de correo con Pilgrim, enlazado a la cotización.
--
-- La cotización con Pilgrim se conversa por correo desde reservas@caminosacro.com (Microsoft
-- 365). Hasta ahora el correo de reserva salía por Brevo como un correo suelto: Pilgrim lo
-- recibía fuera del hilo donde habían cotizado, y en el buzón de reservas@ no quedaba copia.
-- Ahora la plataforma responde DENTRO de ese hilo, desde el propio buzón (Microsoft Graph,
-- vía el workflow de n8n "Plataforma → Outlook (Camino Sacro)").
--
-- Qué se guarda:
--   pilgrim_thread_id          conversationId de Outlook: identifica el hilo.
--   pilgrim_thread_message_id  el mensaje al que se responde (el último de Pilgrim al
--                              enlazar): responderle a él deja la respuesta en el hilo.
--   pilgrim_thread_subject     el asunto del hilo, para mostrarlo en la tarjeta.
--   pilgrim_thread_linked_at   cuándo se enlazó.
--
-- Aditiva: sin hilo enlazado, el correo sigue saliendo por Brevo como siempre.

alter table comercial.quotes
  add column if not exists pilgrim_thread_id text,
  add column if not exists pilgrim_thread_message_id text,
  add column if not exists pilgrim_thread_subject text,
  add column if not exists pilgrim_thread_linked_at timestamptz;

comment on column comercial.quotes.pilgrim_thread_id is
  'conversationId (Outlook/Graph) del hilo de correo con Pilgrim de esta cotización. Null = sin enlazar: el correo a Pilgrim sale por Brevo como correo nuevo.';
comment on column comercial.quotes.pilgrim_thread_message_id is
  'Id (Graph) del mensaje del hilo al que se responde al enviar la reserva a Pilgrim.';
