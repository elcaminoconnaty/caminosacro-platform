-- 0034_habitaciones_a_medida.sql
--
-- Esta migración NO cambia estructura: solo documenta dos formas de dato nuevas que ya
-- caben en las columnas jsonb que existen. Se aplica igual para que quien lea el esquema
-- desde Supabase sepa qué se está guardando ahí.
--
-- =============================================================
-- 1. quotes.rooms_json.filas — reparto de habitaciones a medida
-- =============================================================
--
-- El reparto automático (pares en doble, el impar en individual) cubre la mayoría de las
-- cotizaciones. Pero un grupo real llega repartido: cuatro en dos dobles y tres en una
-- triple. Cada tipo de habitación tiene SU precio de venta y SU costo Pilgrim, y hasta
-- ahora eso no tenía dónde escribirse — la modalidad "Doble + Triple" era texto libre y la
-- base se tecleaba a ojo, sin registro de de dónde salía la cifra.
--
--   rooms_json = {
--     "modo": "a_medida",
--     "tipo": "pension",
--     "dobles": 0, "individuales": 0, "tarifa_doble": 0, "tarifa_single": 0,
--     "filas": [
--       {"tipo":"pension","hab":"doble","habitaciones":2,"precio_cs":680,"precio_pilgrim":520},
--       {"tipo":"pension","hab":"triple","habitaciones":1,"precio_cs":610,"precio_pilgrim":470}
--     ]
--   }
--
-- `hab` ∈ (single, doble, triple, cuadruple). Los precios son POR PERSONA.
-- `precio_cs` sale en las tarjetas del PDF; `precio_pilgrim` es interno y NUNCA se dibuja.
--
-- Las claves viejas van en cero A PROPÓSITO: `pdf.ts` las usa para el desglose mixto del
-- cotizador web, y llenarlas con una aproximación haría que el PDF dibujara dos desgloses
-- distintos de la misma plata. Quien ve `filas` ignora las demás.
--
-- Máximo 4 filas. El tope no es de base de datos: es el ancho de las tarjetas de precio de
-- la primera página del PDF. Ver src/lib/quotes/rooms.ts.

comment on column comercial.quotes.rooms_json is
  'Reparto de habitaciones. Formato clásico (cotizador web): {tipo, dobles, individuales, tarifa_doble, tarifa_single}. Con la clave `filas` es un reparto A MEDIDA: una fila por tipo de habitación {tipo, hab (single|doble|triple|cuadruple), habitaciones, precio_cs, precio_pilgrim}, precios POR PERSONA, máx. 4 filas. Si hay `filas`, mandan ellas y las claves clásicas van en cero. Ver src/lib/quotes/rooms.ts.';

-- price_blocks admite ahora los slugs de triple y cuádruple, que el catálogo todavía no
-- tarifa (comercial.pricing solo tiene doble y single).
comment on column comercial.quotes.price_blocks is
  'Override por cotización de los precios de venta por persona que salen en las tarjetas del PDF. Claves = slugs de modalidad: los de comercial.pricing.modality (pension_doble, pension_single, hotel_doble, hotel_single) más los del reparto a medida (pension_triple, pension_cuadruple, hotel_triple, hotel_cuadruple). NULL = usar el catálogo.';

-- =============================================================
-- 2. quote_lines de tipo 'optional' con reference_id NULL
-- =============================================================
--
-- Servicio opcional a la medida de UNA cotización: un traslado desde un pueblo que nadie
-- más pide, una cena de despedida, una noche suelta en otro hotel. No entra al catálogo.
--
-- Se guarda como línea `type='optional'` con `reference_id` en NULL. Ese NULL es lo único
-- que la distingue de las del catálogo, y hace que entre sola al total del cliente y al
-- costo Pilgrim (recompute_quote_money), al resumen del PDF, al correo a Pilgrim y a la
-- lista de servicios del contrato, sin tocar nada de eso.
--
--   description  el texto que ve el cliente (máx. 70 caracteres: es el ancho de la
--                columna "Concepto" del resumen del PDF)
--   unit_price   mi precio por unidad — el único que sale en el PDF
--   cost_unit    costo Pilgrim por unidad — solo seguimiento y correo a Pilgrim

comment on column comercial.quote_lines.reference_id is
  'Id del servicio del catálogo (optional_services) o de la bici (bikes) que originó la línea. NULL en una línea type=''optional'' significa servicio A LA MEDIDA de esta cotización, tecleado en el expediente: no existe en el catálogo y no se reusa en otra cotización.';
