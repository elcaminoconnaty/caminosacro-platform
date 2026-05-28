-- 0005_route_sarria_6.sql
-- Nueva ruta "Francés desde Sarria (6 etapas)" SIN borrar la de 5 etapas.
-- Parte la etapa Palas de Rei -> Arzúa con noche intermedia en Melide.
-- Idempotente (upsert por slug y por (route_id, day)).

with r as (
  insert into comercial.routes
    (slug, name, origin, destination, days, nights, stages, km, modality, difficulty, description, active)
  values
    ('frances_desde_sarria_6', 'Francés desde Sarria (6 etapas)', 'Sarria', 'Santiago',
     8, 7, 6, 113, 'senderismo', 'Media',
     'Variante de 6 etapas: parte la etapa Palas de Rei → Arzúa con noche intermedia en Melide.', true)
  on conflict (slug) do update set
    name = excluded.name,
    origin = excluded.origin,
    destination = excluded.destination,
    days = excluded.days,
    nights = excluded.nights,
    stages = excluded.stages,
    km = excluded.km,
    modality = excluded.modality,
    difficulty = excluded.difficulty,
    description = excluded.description,
    active = true
  returning id
)
insert into comercial.route_stages (route_id, day, from_place, to_place, km, accommodation)
select r.id, v.day, v.from_place, v.to_place, v.km, v.accommodation
from r, (values
  (1, null,            'Llegada a Sarria',            null::numeric, 'Sarria'),
  (2, 'Sarria',        'Portomarín',                  22.0,          'Portomarín'),
  (3, 'Portomarín',    'Palas de Rei',                24.0,          'Palas de Rei'),
  (4, 'Palas de Rei',  'Melide',                      14.5,          'Melide'),
  (5, 'Melide',        'Arzúa',                       14.0,          'Arzúa'),
  (6, 'Arzúa',         'Pedrouzo',                    19.0,          'Pedrouzo'),
  (7, 'Pedrouzo',      'Santiago',                    19.5,          'Santiago'),
  (8, null,            'Santiago · Fin de servicios', null,          null)
) as v(day, from_place, to_place, km, accommodation)
on conflict (route_id, day) do update set
  from_place = excluded.from_place,
  to_place = excluded.to_place,
  km = excluded.km,
  accommodation = excluded.accommodation;
