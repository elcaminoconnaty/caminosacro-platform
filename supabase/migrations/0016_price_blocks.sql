-- 0016_price_blocks.sql
-- Los precios que salen en las tarjetas del PDF pasan a ser un dato explícito de la
-- cotización en vez de una deducción del catálogo.
--
-- El bug: pdf.ts siempre armaba la tarjeta del alojamiento NO elegido leyendo
-- comercial.pricing. Si el precio se tecleó a mano (porque el catálogo no aplica —
-- p.ej. una salida 2027 con tarifas 2026 cargadas), el PDF mostraba una comparación
-- inventada. Caso testigo CS-2026-063 (Claudia Carmona): pensión 680 € tecleada y
-- hotel 650 € del catálogo → el PDF ofrecía hotel más barato que pensión.
--
-- price_blocks = { slug de modalidad -> precio de venta POR PERSONA }
--   {"pension_doble": 680}                      -> el PDF saca UNA tarjeta
--   {"pension_doble": 680, "hotel_doble": 790}  -> el PDF saca DOS
--   NULL                                        -> catálogo (comportamiento histórico)
-- Los slugs son los mismos de comercial.pricing.modality.

alter table comercial.quotes add column if not exists price_blocks jsonb;

comment on column comercial.quotes.price_blocks is
  'Override por cotización de los precios de venta por persona que salen en las tarjetas del PDF. Claves = slugs de comercial.pricing.modality (pension_doble, pension_single, hotel_doble, hotel_single). NULL = usar el catálogo.';
