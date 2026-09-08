-- 0038_precio_por_persona.sql
--
-- El precio que se teclea a mano en una cotización es POR PERSONA, siempre.
--
-- Pilgrim cotiza por pasajero y Nico pone su precio por pasajero. Pero el asistente y el
-- editor del expediente tenían dos campos ("Base ruta + alojamiento" y "Costo Pilgrim")
-- que eran totales del GRUPO y se tecleaban a mano cuando el catálogo no alcanzaba. Un 520
-- puesto ahí para cuatro personas quedaba como 520 € por todo el grupo, y nadie que
-- abriera el expediente después podía saber si esa cifra era por persona o por grupo.
--
-- Desde ahora las dos pantallas piden el precio por persona (mi precio y el de Pilgrim) y
-- multiplican por las personas de cada habitación. `base_eur` y `cost_base_eur` siguen
-- siendo totales del grupo —no cambia ningún cálculo aguas abajo—, pero ya no se escriben
-- a mano: se derivan.
--
-- Dos cosas nuevas, las dos aditivas:
--
-- 1. quotes.manual_price_note — la nota interna. Cuando el precio no salió del catálogo,
--    la plataforma escribe en palabras qué precio por persona se puso y cómo se llegó a la
--    base ("PRECIO PUESTO A MANO, POR PERSONA — no sale del catálogo 2027. Pensión doble:
--    520,00 €/persona (Pilgrim 450,00 €/persona) × 4 personas. Base del grupo 2.080,00 €
--    …"). Es la misma nota que Pilgrim pone en sus cotizaciones para que los demás
--    comerciales lo sepan. NULL = el precio salió del catálogo tal cual. Interna: no va al
--    PDF ni a ningún correo. Se limpia sola si BayMax vuelve a tarifar desde el catálogo.
--
-- 2. quotes.rooms_json.pilgrim_doble / pilgrim_single — el costo Pilgrim POR PERSONA de
--    cada habitación del reparto automático, al lado de tarifa_doble / tarifa_single (que
--    ya guardaban el precio de venta por persona). Sin esto, al reabrir un expediente con
--    grupo impar no había forma de saber cuánto era Pilgrim en doble y cuánto en
--    individual: solo quedaba el total. Quien no lea las claves nuevas sigue viendo lo de
--    siempre.

alter table comercial.quotes add column if not exists manual_price_note text;

comment on column comercial.quotes.manual_price_note is
  'Nota interna, generada por la plataforma, cuando el precio de la cotización se tecleó a mano: dice en palabras el precio POR PERSONA que se puso (mi precio y Pilgrim, por habitación) y cómo se llegó a la base del grupo. NULL = el precio salió del catálogo. No sale en el PDF ni en correos.';

comment on column comercial.quotes.rooms_json is
  'Reparto de habitaciones. Formato clásico (reparto automático): {tipo, dobles, individuales, tarifa_doble, tarifa_single, pilgrim_doble, pilgrim_single} — tarifas y costos Pilgrim POR PERSONA de cada habitación (las claves pilgrim_* pueden faltar en cotizaciones anteriores a la 0038). Con la clave `filas` es un reparto A MEDIDA: una fila por tipo de habitación {tipo, hab (single|doble|triple|cuadruple), habitaciones, precio_cs, precio_pilgrim}, precios POR PERSONA, máx. 4 filas. Si hay `filas`, mandan ellas y las claves clásicas van en cero. Ver src/lib/quotes/rooms.ts y src/lib/quotes/precioPorPersona.ts.';
