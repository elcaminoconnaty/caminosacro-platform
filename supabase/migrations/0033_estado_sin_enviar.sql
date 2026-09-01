-- 0033_estado_sin_enviar.sql
-- Una cotización recién creada ya no nace "Enviada".
--
-- Hasta hoy el primer estado era `enviada`, así que toda cotización aparecía como enviada
-- desde el segundo en que se creaba, hubiera salido el correo o no. En un expediente sin
-- correo enviado el estado decía que sí, y no había forma de distinguir "todavía no se la
-- he mandado" de "ya se la mandé y no ha contestado" — que son dos cosas muy distintas
-- cuando toca decidir a quién perseguir.
--
-- La migración 0003 había quitado `borrador` fundiéndolo con `enviada`. Vuelve, pero con
-- lo que le faltaba: la transición automática. Cuando el correo sale de verdad,
-- `marcarCotizacionEnviada` (src/lib/quotes/marcarEnviada.ts) pasa el estado a `enviada`
-- y escribe `email_sent_at`. Solo promueve desde `sin_enviar`: reenviarle la cotización a
-- alguien que ya aceptó no puede devolverlo a "Enviada".
--
-- Las cotizaciones que YA existen se quedan como están. Que una tenga `email_sent_at` en
-- null no prueba que no se enviara: esa columna llegó en la 0011, el cotizador público
-- nunca la escribió, y muchas se mandaron por WhatsApp. Marcarlas todas como sin enviar
-- sería cambiar un dato dudoso por otro, y encima ruidoso.

alter table comercial.quotes drop constraint if exists quotes_status_check;

alter table comercial.quotes
  add constraint quotes_status_check
  check (status in ('sin_enviar','enviada','aceptada','pago_parcial','pago_completo','completada','cancelada'));

alter table comercial.quotes alter column status set default 'sin_enviar';

comment on column comercial.quotes.status is
  'sin_enviar → enviada → aceptada → pago_parcial → pago_completo → completada (o cancelada). El paso de sin_enviar a enviada lo hace solo el envío del correo; el resto se cambia a mano.';
