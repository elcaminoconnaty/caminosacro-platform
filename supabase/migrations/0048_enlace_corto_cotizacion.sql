-- 0048_enlace_corto_cotizacion.sql
--
-- Un enlace corto y permanente para mandarle la cotización al peregrino por WhatsApp.
--
-- Hasta ahora, lo que la tarjeta de WhatsApp podía ofrecer era la versión web del correo
-- (/correo/[token]) y eso tenía dos problemas, los dos vistos en la primera prueba real:
--
--   1. SOLO EXISTÍA SI EL CORREO YA HABÍA SALIDO. El token se crea al enviar el correo, así
--      que a quien todavía no se le ha escrito —justo el caso de esta tarjeta— el mensaje le
--      salía sin enlace, diciendo "te la dejo acá en el chat", que es exactamente el trabajo
--      manual que se quería quitar.
--   2. ERA LARGUÍSIMO: 48 caracteres de token detrás del dominio de Railway. En un WhatsApp
--      eso ocupa tres renglones y se lee como un enlace sospechoso.
--
-- `share_code` es un código corto (10 caracteres) que vive en la cotización, no en el
-- correo: se crea la primera vez que hace falta y no cambia nunca más, así que el enlace
-- que se mandó hace un mes sigue abriendo la cotización hoy. /c/[code] lo resuelve y sirve
-- el PDF vigente — no una copia del momento en que se mandó el mensaje.
--
-- Por qué 10 caracteres y no 4: el enlace no pide sesión (el código ES la llave, igual que
-- en /contrato/[token] y /documentacion/[token]) y abre un documento con el nombre y el
-- precio de una persona. Con 10 caracteres alfanuméricos hay ~8 × 10^17 combinaciones:
-- adivinar uno a fuerza bruta no es un riesgo real, y el enlace sigue cabiendo en una línea.
--
-- Aditiva: las cotizaciones existentes quedan con `share_code` en null y reciben el suyo la
-- primera vez que alguien abra su expediente.

alter table comercial.quotes
  add column if not exists share_code text;

create unique index if not exists quotes_share_code_key
  on comercial.quotes (share_code)
  where share_code is not null;

comment on column comercial.quotes.share_code is
  'Código del enlace corto /c/[code] que abre el PDF de esta cotización. Se crea al vuelo la primera vez que se necesita y no se cambia: los enlaces ya enviados tienen que seguir funcionando. Null = todavía no se ha compartido.';
