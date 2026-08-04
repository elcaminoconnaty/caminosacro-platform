-- 0018_price_note.sql
-- Nota al pie de las tarjetas de precio del PDF.
--
-- Nace con el catálogo por año (0017): el cotizador público de caminosacro.com sí puede
-- caer al año anterior cuando todavía no hay tarifas del año de salida (necesita dar un
-- número), pero entonces tiene que decirlo — "Precio de referencia 2026, sujeto a
-- confirmación para salidas en 2027". El CRM no cae nunca a otro año, así que en las
-- cotizaciones internas esta columna queda en NULL.

alter table comercial.quotes add column if not exists price_note text;

comment on column comercial.quotes.price_note is
  'Aclaración que sale bajo las tarjetas de precio del PDF. La escribe el cotizador público cuando la tarifa usada es de un año anterior al de la salida. NULL = sin nota.';
