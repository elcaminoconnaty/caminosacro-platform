-- 0032_correo_version_web.sql
-- "Si no ves bien este correo, ábrelo aquí".
--
-- Los correos de la plataforma pasaron a ir maquetados, y maquetar correo es apostar
-- contra treinta clientes distintos: Outlook de escritorio pinta con el motor de Word,
-- algunos invierten los colores en modo oscuro, y siempre hay uno que decide no aplicar
-- los estilos. El enlace de arriba es el seguro contra eso.
--
-- Se guarda el HTML EXACTO que se envió, no se vuelve a armar al abrir la página. Si se
-- regenerara, un cambio de plantilla haría que la versión web dijera algo distinto de lo
-- que el cliente tiene en su bandeja — y ese correo es la oferta comercial que aceptó.
--
-- El token va aquí y no en `quotes` porque un mismo expediente manda varios correos
-- (cotización, contrato, documentación) y cada envío necesita el suyo.

alter table comercial.email_log
  add column if not exists token text,
  add column if not exists html text;

-- Parcial: los envíos anteriores a esta migración, y los que van en texto plano, no tienen
-- token, y varios nulos no pueden chocar entre sí en un índice único normal.
create unique index if not exists email_log_token_idx
  on comercial.email_log (token) where token is not null;

comment on column comercial.email_log.html is
  'El HTML exacto que se envió, para servirlo en /correo/[token] cuando el cliente de correo no lo pinta bien.';
