-- 0022_etapas_bici_ponferrada.sql
-- Las tres rutas de bici estaban cargadas en comercial.routes pero SIN etapas, así que una
-- cotización de bici salía con la tabla de itinerario vacía: `buildItinerarioStages` en
-- quotePdf.tsx solo pinta filas con km > 0, y sin ellas también se cae el conteo de días y
-- noches (usa stagesCount, no route.days).
--
-- Acá se cargan las del Francés en bici desde Ponferrada, que son las que Pilgrim detalla
-- en la cotización C677157 (21-08-2026): 4 etapas rodadas, 204,8 km.
--
-- Portugués Bici Oporto (5 etapas, 240 km) y Primitivo Bici Oviedo (7 etapas, 311 km)
-- quedan SIN etapas a propósito: no tenemos el desglose real de Pilgrim y el itinerario
-- sale en un documento que va al cliente. Hay que pedírselo y cargarlo con este mismo
-- patrón antes de cotizar esas dos rutas.
--
-- Convención de comercial.route_stages (la misma de las rutas a pie): el día 1 es la
-- llegada y el último el fin de servicios, ambos con km null; el PDF los vuelve a dibujar
-- por su cuenta y solo trata como etapa lo que tiene km.

insert into comercial.route_stages (route_id, day, from_place, to_place, km, accommodation, notes)
select r.id, v.day, v.from_place, v.to_place, v.km, v.accommodation, v.notes
from comercial.routes r,
(values
  (1, null::text, 'Llegada a Ponferrada', null::numeric, 'Ponferrada', 'Día de llegada. La bicicleta se entrega en el primer alojamiento.'),
  (2, 'Ponferrada', 'Las Herrerías', 43.9, 'Las Herrerías', null),
  (3, 'Las Herrerías', 'Sarria', 46.7, 'Sarria', null),
  (4, 'Sarria', 'Melide', 61.4, 'Melide', null),
  (5, 'Melide', 'Santiago de Compostela', 52.8, 'Santiago de Compostela', null),
  (6, null, 'Santiago · Fin de servicios', null, null, 'Devolución de la bicicleta en Santiago de Compostela.')
) as v(day, from_place, to_place, km, accommodation, notes)
where r.slug = 'frances_bici_ponferrada'
on conflict (route_id, day) do nothing;
