-- 0059_tarifas_pilgrim_2027.sql
-- Catálogo Pilgrim 2027 (Pilgrim Catalogo 2027/CATALOGO_CAMINO_DE_SANTIAGO_2027-PILGRIM_TRAVEL.pdf).
-- Las tarifas del catálogo son NETAS de agencia (15 % ya descontado): van a price_pilgrim tal cual.
-- Comprobado contra 24 cotizaciones reales de Pilgrim 2027 en reservas@ (precio tachado + neto).
-- Venta: rutas max(pilgrim+100, pilgrim/0.85); bicis pilgrim/0.85; tours y actividades ceil(pilgrim/0.8);
-- traslados, seguros de anulación y regalos +30 %. Solo datos: es idempotente (upserts por slug/año).

begin;

-- 1. Temporada alta por año: 2027 = mayo, agosto y septiembre (2026 era julio–septiembre).
update comercial.settings
   set value = jsonb_set(jsonb_set(value, '{high_season,months_by_year}', '{"2026":[7,8,9],"2027":[5,8,9]}'::jsonb, true),
                         '{high_season,description}', '"2026: julio, agosto y septiembre · 2027: mayo, agosto y septiembre"'::jsonb, true)
 where key = 'season_supplements';

-- 2. Rutas nuevas del catálogo 2027 (web=false hasta que tengan página en caminosacro.com).
update comercial.routes set km=112 where slug='frances_desde_sarria' and km is distinct from 112;
update comercial.routes set km=112 where slug='frances-desde-sarria-6-etapas' and km is distinct from 112;
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('portugues_desde_tui_5_etapas','Portugués desde Tui 5 etapas','Tui','Santiago de Compostela',7,6,5,115,'senderismo','Media','Portugués',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Tui',null,'Tui'), (2,'Tui','Redondela',29,'Redondela'), (3,'Redondela','Pontevedra',20,'Pontevedra'), (4,'Pontevedra','Caldas de Reis',21,'Caldas de Reis'), (5,'Caldas de Reis','Padrón',19,'Padrón'), (6,'Padrón','Santiago de Compostela',23,'Santiago')) v(day,from_place,to_place,km,accommodation)
 where r.slug='portugues_desde_tui_5_etapas' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
update comercial.routes set km=115 where slug='portugues_desde_tui' and km is distinct from 115;
update comercial.routes set km=100 where slug='portugues_desde_vigo' and km is distinct from 100;
update comercial.routes set km=123 where slug='costero_desde_baiona' and km is distinct from 123;
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('frances_roncesvalles_logrono','Francés por tramos: Roncesvalles – Logroño','Roncesvalles','Logroño',8,7,6,136,'senderismo','Media','Francés',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Roncesvalles',null,'Roncesvalles'), (2,'Roncesvalles','Zubiri',21,'Zubiri'), (3,'Zubiri','Pamplona',20,'Pamplona'), (4,'Pamplona','Puente la Reina',24,'Puente la Reina'), (5,'Puente la Reina','Estella',22,'Estella'), (6,'Estella','Los Arcos',21,'Los Arcos'), (7,'Los Arcos','Logroño',28,'Logroño')) v(day,from_place,to_place,km,accommodation)
 where r.slug='frances_roncesvalles_logrono' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('frances_logrono_burgos','Francés por tramos: Logroño – Burgos','Logroño','Burgos',7,6,5,122,'senderismo','Media','Francés',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Logroño',null,'Logroño'), (2,'Logroño','Nájera',29,'Nájera'), (3,'Nájera','Santo Domingo de la Calzada',21,'Santo Domingo de la Calzada'), (4,'Santo Domingo de la Calzada','Belorado',22,'Belorado'), (5,'Belorado','Atapuerca',30,'Atapuerca'), (6,'Atapuerca','Burgos',20,'Burgos')) v(day,from_place,to_place,km,accommodation)
 where r.slug='frances_logrono_burgos' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('frances_burgos_leon','Francés por tramos: Burgos – León','Burgos','León',10,9,8,179,'senderismo','Media','Francés',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Burgos',null,'Burgos'), (2,'Burgos','Hornillos del Camino',21,'Hornillos del Camino'), (3,'Hornillos del Camino','Castrojeriz',20,'Castrojeriz'), (4,'Castrojeriz','Frómista',25,'Frómista'), (5,'Frómista','Carrión de los Condes',19,'Carrión de los Condes'), (6,'Carrión de los Condes','Terradillos de los Templarios',26,'Terradillos de los Templarios'), (7,'Terradillos de los Templarios','Bercianos del Real Camino',23,'Bercianos del Real Camino'), (8,'Bercianos del Real Camino','Mansilla de las Mulas',26,'Mansilla de las Mulas'), (9,'Mansilla de las Mulas','León',19,'León')) v(day,from_place,to_place,km,accommodation)
 where r.slug='frances_burgos_leon' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('frances_leon_cebreiro','Francés por tramos: León – O Cebreiro','León','O Cebreiro',8,7,6,153,'senderismo','Alta','Francés',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a León',null,'León'), (2,'León','Hospital de Órbigo',32,'Hospital de Órbigo'), (3,'Hospital de Órbigo','Astorga',16,'Astorga'), (4,'Astorga','Foncebadón',26,'Foncebadón'), (5,'Foncebadón','Ponferrada',27,'Ponferrada'), (6,'Ponferrada','Villafranca del Bierzo',24,'Villafranca del Bierzo'), (7,'Villafranca del Bierzo','O Cebreiro',28,'O Cebreiro')) v(day,from_place,to_place,km,accommodation)
 where r.slug='frances_leon_cebreiro' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('frances_cebreiro_santiago','Francés desde O Cebreiro','O Cebreiro','Santiago de Compostela',8,7,7,152,'senderismo','Media','Francés',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a O Cebreiro',null,'O Cebreiro'), (2,'O Cebreiro','Triacastela',21,'Triacastela'), (3,'Triacastela','Sarria',18,'Sarria'), (4,'Sarria','Portomarín',22,'Portomarín'), (5,'Portomarín','Palas de Rei',25,'Palas de Rei'), (6,'Palas de Rei','Arzúa',28,'Arzúa'), (7,'Arzúa','O Pedrouzo',19,'O Pedrouzo'), (8,'O Pedrouzo','Santiago de Compostela',19,'Santiago')) v(day,from_place,to_place,km,accommodation)
 where r.slug='frances_cebreiro_santiago' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
update comercial.routes set km=102 where slug='primitivo_desde_lugo' and km is distinct from 102;
update comercial.routes set km=111 where slug='ingles_desde_ferrol' and km is distinct from 111;
update comercial.routes set km=85 where slug='camino_a_fisterra' and km is distinct from 85;
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('fisterra_muxia','Camino a Fisterra y Muxía','Santiago','Muxía',6,5,4,113,'senderismo','Media','Fisterra',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Santiago',null,'Santiago'), (2,'Santiago','Negreira',21,'Negreira'), (3,'Negreira','Olveiroa',32,'Olveiroa'), (4,'Olveiroa','Fisterra',32,'Fisterra'), (5,'Fisterra','Muxía',28,'Muxía')) v(day,from_place,to_place,km,accommodation)
 where r.slug='fisterra_muxia' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('norte_desde_ribadeo','Norte desde Ribadeo','Ribadeo','Santiago de Compostela',10,9,8,193,'senderismo','Media','Norte',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Ribadeo',null,'Ribadeo'), (2,'Ribadeo','Lourenzá',28,'Lourenzá'), (3,'Lourenzá','Abadín',25,'Abadín'), (4,'Abadín','Vilalba',22,'Vilalba'), (5,'Vilalba','Baamonde',19,'Baamonde'), (6,'Baamonde','Sobrado dos Monxes',39,'Sobrado dos Monxes'), (7,'Sobrado dos Monxes','Arzúa',22,'Arzúa'), (8,'Arzúa','O Pedrouzo',19,'O Pedrouzo'), (9,'O Pedrouzo','Santiago de Compostela',19,'Santiago')) v(day,from_place,to_place,km,accommodation)
 where r.slug='norte_desde_ribadeo' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('via_plata_ourense','Vía de la Plata desde Ourense','Ourense','Santiago de Compostela',7,6,5,104,'senderismo','Media','Vía de la Plata',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Ourense',null,'Ourense'), (2,'Ourense','Cea',21,'Cea'), (3,'Cea','Estación de Lalín',27,'Estación de Lalín'), (4,'Estación de Lalín','Silleda',15,'Silleda'), (5,'Silleda','Ponte Ulla',20,'Ponte Ulla'), (6,'Ponte Ulla','Santiago de Compostela',21,'Santiago')) v(day,from_place,to_place,km,accommodation)
 where r.slug='via_plata_ourense' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
update comercial.routes set km=240 where slug='portugues_desde_porto' and km is distinct from 240;
update comercial.routes set km=272 where slug='costero_desde_porto' and km is distinct from 272;
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('frances_bici_leon','Francés Bici León','León','Santiago de Compostela',8,7,6,305,'bici','Alta','Francés',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a León',null,'León'), (2,'León','Astorga',48,'Astorga'), (3,'Astorga','Ponferrada',52,'Ponferrada'), (4,'Ponferrada','Las Herrerías',44,'Las Herrerías'), (5,'Las Herrerías','Sarria',68,'Sarria'), (6,'Sarria','Melide',61,'Melide'), (7,'Melide','Santiago de Compostela',53,'Santiago')) v(day,from_place,to_place,km,accommodation)
 where r.slug='frances_bici_leon' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
update comercial.routes set km=205 where slug='frances_bici_ponferrada' and km is distinct from 205;
update comercial.routes set km=311 where slug='primitivo_bici_oviedo' and km is distinct from 311;
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('portugues_bici_oporto_6_dias','Portugués Bici Oporto 6 días','Oporto','Santiago de Compostela',6,5,4,240,'bici','Media','Portugués',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Oporto',null,'Oporto'), (2,'Oporto','Barcelos',54,'Barcelos'), (3,'Barcelos','Tui',70,'Tui'), (4,'Tui','Pontevedra',52,'Pontevedra'), (5,'Pontevedra','Santiago de Compostela',63,'Santiago')) v(day,from_place,to_place,km,accommodation)
 where r.slug='portugues_bici_oporto_6_dias' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
update comercial.routes set km=240 where slug='portugues_bici_oporto' and km is distinct from 240;
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('costero_bici_porto_6_dias','Costero Bici Porto 6 días','Porto','Santiago de Compostela',6,5,4,270,'bici','Media','Costero',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Porto',null,'Porto'), (2,'Porto','Viana do Castelo',84,'Viana do Castelo'), (3,'Viana do Castelo','Baiona',62,'Baiona'), (4,'Baiona','Pontevedra',60,'Pontevedra'), (5,'Pontevedra','Santiago de Compostela',64,'Santiago')) v(day,from_place,to_place,km,accommodation)
 where r.slug='costero_bici_porto_6_dias' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
insert into comercial.routes (slug,name,origin,destination,days,nights,stages,km,modality,difficulty,family,web,active) values ('costero_bici_porto_9_dias','Costero Bici Porto 9 días','Porto','Santiago de Compostela',9,8,7,270,'bici','Media','Costero',false,true) on conflict (slug) do nothing;
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Porto',null,'Porto'), (2,'Porto','Póvoa de Varzim',38,'Póvoa de Varzim'), (3,'Póvoa de Varzim','Viana do Castelo',45,'Viana do Castelo'), (4,'Viana do Castelo','A Guarda',32,'A Guarda'), (5,'A Guarda','Vigo',56,'Vigo'), (6,'Vigo','Pontevedra',36,'Pontevedra'), (7,'Pontevedra','Padrón',40,'Padrón'), (8,'Padrón','Santiago de Compostela',24,'Santiago')) v(day,from_place,to_place,km,accommodation)
 where r.slug='costero_bici_porto_9_dias' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);

-- 3. Tarifas 2027 de las 26 rutas del catálogo (sustituyen las cargadas a mano desde cotizaciones sueltas).
insert into comercial.pricing (route_id,modality,season,year,price_pilgrim,price_cs,notes)
select r.id, v.m, 'regular', 2027, v.p, v.cs, 'Catálogo Pilgrim 2027 (neto agencia)'
  from (values
  ('frances_desde_sarria','pension_doble',525,625),
  ('frances_desde_sarria','hotel_doble',625,735),
  ('frances_desde_sarria','pension_single',715,841),
  ('frances_desde_sarria','hotel_single',850,1000),
  ('frances-desde-sarria-6-etapas','pension_doble',590,694),
  ('frances-desde-sarria-6-etapas','hotel_doble',705,829),
  ('frances-desde-sarria-6-etapas','pension_single',810,953),
  ('frances-desde-sarria-6-etapas','hotel_single',970,1141),
  ('portugues_desde_tui_5_etapas','pension_doble',545,645),
  ('portugues_desde_tui_5_etapas','hotel_doble',635,747),
  ('portugues_desde_tui_5_etapas','pension_single',780,918),
  ('portugues_desde_tui_5_etapas','hotel_single',900,1059),
  ('portugues_desde_tui','pension_doble',610,718),
  ('portugues_desde_tui','hotel_doble',695,818),
  ('portugues_desde_tui','pension_single',875,1029),
  ('portugues_desde_tui','hotel_single',975,1147),
  ('portugues_desde_vigo','pension_doble',555,655),
  ('portugues_desde_vigo','hotel_doble',625,735),
  ('portugues_desde_vigo','pension_single',785,924),
  ('portugues_desde_vigo','hotel_single',905,1065),
  ('costero_desde_baiona','pension_doble',660,776),
  ('costero_desde_baiona','hotel_doble',740,871),
  ('costero_desde_baiona','pension_single',920,1082),
  ('costero_desde_baiona','hotel_single',1060,1247),
  ('frances_roncesvalles_logrono','pension_doble',585,688),
  ('frances_roncesvalles_logrono','hotel_doble',715,841),
  ('frances_roncesvalles_logrono','pension_single',835,982),
  ('frances_roncesvalles_logrono','hotel_single',970,1141),
  ('frances_logrono_burgos','pension_doble',525,625),
  ('frances_logrono_burgos','hotel_doble',640,753),
  ('frances_logrono_burgos','pension_single',710,835),
  ('frances_logrono_burgos','hotel_single',850,1000),
  ('frances_burgos_leon','pension_doble',730,859),
  ('frances_burgos_leon','hotel_doble',875,1029),
  ('frances_burgos_leon','pension_single',1046,1231),
  ('frances_burgos_leon','hotel_single',1210,1424),
  ('frances_leon_cebreiro','pension_doble',575,676),
  ('frances_leon_cebreiro','hotel_doble',670,788),
  ('frances_leon_cebreiro','pension_single',795,935),
  ('frances_leon_cebreiro','hotel_single',875,1029),
  ('frances_cebreiro_santiago','pension_doble',670,788),
  ('frances_cebreiro_santiago','hotel_doble',895,1053),
  ('frances_cebreiro_santiago','pension_single',915,1076),
  ('frances_cebreiro_santiago','hotel_single',1075,1265),
  ('primitivo_desde_lugo','pension_doble',525,625),
  ('primitivo_desde_lugo','hotel_doble',625,735),
  ('primitivo_desde_lugo','pension_single',720,847),
  ('primitivo_desde_lugo','hotel_single',860,1012),
  ('ingles_desde_ferrol','pension_doble',530,630),
  ('ingles_desde_ferrol','hotel_doble',590,694),
  ('ingles_desde_ferrol','pension_single',720,847),
  ('ingles_desde_ferrol','hotel_single',785,924),
  ('camino_a_fisterra','pension_doble',385,485),
  ('camino_a_fisterra','hotel_doble',450,550),
  ('camino_a_fisterra','pension_single',530,630),
  ('camino_a_fisterra','hotel_single',595,700),
  ('fisterra_muxia','pension_doble',455,555),
  ('fisterra_muxia','hotel_doble',505,605),
  ('fisterra_muxia','pension_single',645,759),
  ('fisterra_muxia','hotel_single',695,818),
  ('norte_desde_ribadeo','pension_doble',775,912),
  ('norte_desde_ribadeo','hotel_doble',880,1035),
  ('norte_desde_ribadeo','pension_single',1045,1229),
  ('norte_desde_ribadeo','hotel_single',1165,1371),
  ('via_plata_ourense','pension_doble',540,640),
  ('via_plata_ourense','hotel_doble',605,712),
  ('via_plata_ourense','pension_single',725,853),
  ('via_plata_ourense','hotel_single',795,935),
  ('portugues_desde_porto','pension_doble',1005,1182),
  ('portugues_desde_porto','hotel_doble',1145,1347),
  ('portugues_desde_porto','pension_single',1432,1685),
  ('portugues_desde_porto','hotel_single',1590,1871),
  ('costero_desde_porto','pension_doble',1245,1465),
  ('costero_desde_porto','hotel_doble',1470,1729),
  ('costero_desde_porto','pension_single',1830,2153),
  ('costero_desde_porto','hotel_single',2145,2524),
  ('frances_bici_leon','pension_doble',745,876),
  ('frances_bici_leon','hotel_doble',880,1035),
  ('frances_bici_leon','pension_single',1025,1206),
  ('frances_bici_leon','hotel_single',1160,1365),
  ('frances_bici_ponferrada','pension_doble',585,688),
  ('frances_bici_ponferrada','hotel_doble',680,800),
  ('frances_bici_ponferrada','pension_single',765,900),
  ('frances_bici_ponferrada','hotel_single',870,1024),
  ('primitivo_bici_oviedo','pension_doble',755,888),
  ('primitivo_bici_oviedo','hotel_doble',840,988),
  ('primitivo_bici_oviedo','pension_single',1015,1194),
  ('primitivo_bici_oviedo','hotel_single',1135,1335),
  ('portugues_bici_oporto_6_dias','pension_doble',565,665),
  ('portugues_bici_oporto_6_dias','hotel_doble',650,765),
  ('portugues_bici_oporto_6_dias','pension_single',795,935),
  ('portugues_bici_oporto_6_dias','hotel_single',890,1047),
  ('portugues_bici_oporto','pension_doble',635,747),
  ('portugues_bici_oporto','hotel_doble',735,865),
  ('portugues_bici_oporto','pension_single',895,1053),
  ('portugues_bici_oporto','hotel_single',1005,1182),
  ('costero_bici_porto_6_dias','pension_doble',590,694),
  ('costero_bici_porto_6_dias','hotel_doble',675,794),
  ('costero_bici_porto_6_dias','pension_single',820,965),
  ('costero_bici_porto_6_dias','hotel_single',955,1124),
  ('costero_bici_porto_9_dias','pension_doble',780,918),
  ('costero_bici_porto_9_dias','hotel_doble',905,1065),
  ('costero_bici_porto_9_dias','pension_single',1120,1318),
  ('costero_bici_porto_9_dias','hotel_single',1320,1553)
) v(slug,m,p,cs) join comercial.routes r on r.slug=v.slug
on conflict (route_id,modality,season,year) do update set price_pilgrim=excluded.price_pilgrim, price_cs=excluded.price_cs, notes=excluded.notes;
delete from comercial.pricing p using comercial.routes r where r.id=p.route_id and r.slug='costero_desde_vigo' and p.year=2027 and coalesce(p.price_pilgrim,0)=0;

-- 4. Opcionales: crea los que faltan, pone nombre/unidad del catálogo 2027 y su precio 2027.
with v(slug,name,category,unit,p,cs) as (values
  ('santiago_sarria','Aeropuerto de Santiago (SCQ) → Sarria','transfer','por vehículo (hasta 4 plazas)',185,241),
  ('traslado_sarria_8','Aeropuerto de Santiago (SCQ) → Sarria · furgoneta','transfer','por vehículo (hasta 8 plazas)',235,306),
  ('santiago_tui','Aeropuerto de Santiago (SCQ) → Tui','transfer','por vehículo (hasta 4 plazas)',220,286),
  ('traslado_tui_8','Aeropuerto de Santiago (SCQ) → Tui · furgoneta','transfer','por vehículo (hasta 8 plazas)',280,364),
  ('traslado_cebreiro','Aeropuerto de Santiago (SCQ) → O Cebreiro','transfer','por vehículo (hasta 4 plazas)',245,319),
  ('traslado_cebreiro_8','Aeropuerto de Santiago (SCQ) → O Cebreiro · furgoneta','transfer','por vehículo (hasta 8 plazas)',310,403),
  ('traslado_lugo','Aeropuerto de Santiago (SCQ) → Lugo','transfer','por vehículo (hasta 4 plazas)',175,228),
  ('traslado_lugo_8','Aeropuerto de Santiago (SCQ) → Lugo · furgoneta','transfer','por vehículo (hasta 8 plazas)',220,286),
  ('traslado_ferrol','Aeropuerto de Santiago (SCQ) → Ferrol','transfer','por vehículo (hasta 4 plazas)',160,208),
  ('traslado_ferrol_8','Aeropuerto de Santiago (SCQ) → Ferrol · furgoneta','transfer','por vehículo (hasta 8 plazas)',200,260),
  ('traslado_vigo','Aeropuerto de Santiago (SCQ) → Vigo','transfer','por vehículo (hasta 4 plazas)',190,247),
  ('traslado_vigo_8','Aeropuerto de Santiago (SCQ) → Vigo · furgoneta','transfer','por vehículo (hasta 8 plazas)',245,319),
  ('traslado_baiona','Aeropuerto de Santiago (SCQ) → Baiona','transfer','por vehículo (hasta 4 plazas)',240,312),
  ('traslado_baiona_8','Aeropuerto de Santiago (SCQ) → Baiona · furgoneta','transfer','por vehículo (hasta 8 plazas)',305,397),
  ('traslado_ribadeo','Aeropuerto de Santiago (SCQ) → Ribadeo','transfer','por vehículo (hasta 4 plazas)',275,358),
  ('traslado_ribadeo_8','Aeropuerto de Santiago (SCQ) → Ribadeo · furgoneta','transfer','por vehículo (hasta 8 plazas)',355,462),
  ('traslado_ourense','Aeropuerto de Santiago (SCQ) → Ourense','transfer','por vehículo (hasta 4 plazas)',190,247),
  ('traslado_ourense_8','Aeropuerto de Santiago (SCQ) → Ourense · furgoneta','transfer','por vehículo (hasta 8 plazas)',245,319),
  ('santiago_aeropuerto','Santiago centro → Aeropuerto de Santiago (SCQ)','transfer','por vehículo (hasta 4 plazas)',65,85),
  ('traslado_aeropuerto_8','Santiago centro → Aeropuerto de Santiago (SCQ) · furgoneta','transfer','por vehículo (hasta 8 plazas)',80,104),
  ('traslado_santiago_porto','Santiago → Oporto','transfer','por vehículo (hasta 4 plazas)',390,507),
  ('traslado_santiago_porto_8','Santiago → Oporto · furgoneta','transfer','por vehículo (hasta 8 plazas)',495,644),
  ('traslado_fisterra_scq','Fisterra → Aeropuerto de Santiago (SCQ)','transfer','por vehículo (hasta 4 plazas)',160,208),
  ('traslado_fisterra_scq_8','Fisterra → Aeropuerto de Santiago (SCQ) · furgoneta','transfer','por vehículo (hasta 8 plazas)',200,260),
  ('traslado_vigo_tui','Vigo → Tui','transfer','por vehículo (hasta 4 plazas)',80,104),
  ('traslado_vigo_tui_8','Vigo → Tui · furgoneta','transfer','por vehículo (hasta 8 plazas)',140,182),
  ('traslado_vigo_baiona','Vigo → Baiona','transfer','por vehículo (hasta 4 plazas)',90,117),
  ('traslado_vigo_baiona_8','Vigo → Baiona · furgoneta','transfer','por vehículo (hasta 8 plazas)',160,208),
  ('traslado_vigo_porto','Vigo → Oporto','transfer','por vehículo (hasta 4 plazas)',270,351),
  ('traslado_vigo_porto_8','Vigo → Oporto · furgoneta','transfer','por vehículo (hasta 8 plazas)',330,429),
  ('tour_fisterra_y_costa_da_morte','Tour Fisterra y Costa da Morte','tour','por persona',52,65),
  ('tour_rias_baixas_a_toxa_bodega','Tour Rías Baixas + A Toxa + bodega','tour','por persona',60,75),
  ('tour_lugo_playa_catedrales','Tour Lugo + Playa de las Catedrales','tour','por persona',65,82),
  ('tour_ribeira_sacra','Tour Ribeira Sacra','tour','por persona',68,85),
  ('tour_santiago_completo','Tour Santiago al completo','tour','por persona',50,63),
  ('bodega_cata_maridaje','Visita a bodega + cata + maridaje','tour','por persona',45,57),
  ('conserva_gallega','Degustación de conserva gallega','gift','por unidad',35,46),
  ('queimada','Conjuro de la queimada','gift','por persona',20,26),
  ('cenas_trayecto_completo','Cenas trayecto completo (media pensión)','meal','por persona y día',35,44),
  ('casco_bicicleta','Casco profesional MTB','equipo_bici','por persona',40,50),
  ('seguro_todo_riesgo_bici','Seguro a todo riesgo para la bicicleta','equipo_bici','por persona',75,98),
  ('envio_bici_sjpp','Envío de la bicicleta a Saint-Jean-Pied-de-Port','equipo_bici','por unidad',30,38),
  ('envio_bici_portugal','Envío de la bicicleta a Portugal','equipo_bici','por unidad',30,38),
  ('devolucion_bici_fisterra','Devolución de la bicicleta en Fisterra','equipo_bici','por unidad',20,25),
  ('anulacion_basica_500','Cobertura de anulación básica · viaje hasta 500 €/persona','seguro','por persona',30,39),
  ('anulacion_plus_500','Cobertura de anulación plus · viaje hasta 500 €/persona','seguro','por persona',50,65),
  ('cobertura_de_anulacion_basica','Cobertura de anulación básica · viaje hasta 1.000 €/persona','seguro','por persona',45,59),
  ('cobertura_de_anulacion_plus','Cobertura de anulación plus · viaje hasta 1.000 €/persona','seguro','por persona',75,98),
  ('anulacion_basica_3000','Cobertura de anulación básica · viaje hasta 3.000 €/persona','seguro','por persona',95,124),
  ('anulacion_plus_3000','Cobertura de anulación plus · viaje hasta 3.000 €/persona','seguro','por persona',125,163),
  ('anulacion_basica_5000','Cobertura de anulación básica · viaje hasta 5.000 €/persona','seguro','por persona',120,156),
  ('anulacion_plus_5000','Cobertura de anulación plus · viaje hasta 5.000 €/persona','seguro','por persona',150,195)
), ins as (
  insert into comercial.optional_services (slug,name,category,unit,active)
  select slug,name,category,unit,true from v
  on conflict (slug) do update set name=excluded.name, unit=excluded.unit, category=excluded.category, active=true
  returning id, slug
)
insert into comercial.optional_prices (optional_id,year,price_pilgrim,price_cs)
select ins.id, 2027, v.p, v.cs from ins join v using (slug)
on conflict (optional_id,year) do update set price_pilgrim=excluded.price_pilgrim, price_cs=excluded.price_cs;

-- 5. Alquiler de bicis 2027. Pilgrim tarifa 4 modelos por días (mínimo 7): MTB estándar, MTB premium, eBike estándar, eBike premium.
--    Los otros 3 modelos de nuestra flota (gravel, MTB carbono, MTB doble suspensión) no salen en 2027: quedan sin precio 2027 (a confirmar).
insert into comercial.bike_prices (bike_id,route_id,year,days,price_pilgrim,price_cs,notes)
select b.id, r.id, 2027, v.d, v.p, v.cs, 'Catálogo Pilgrim 2027 (tarifa de '||v.d||' días)'
  from (values
  ('mtb','frances_bici_ponferrada',7,265,312),
  ('mtb','portugues_bici_oporto',7,265,312),
  ('mtb','primitivo_bici_oviedo',9,295,347),
  ('mtb','frances_bici_leon',8,280,329),
  ('mtb','portugues_bici_oporto_6_dias',7,265,312),
  ('mtb','costero_bici_porto_6_dias',7,265,312),
  ('mtb','costero_bici_porto_9_dias',9,295,347),
  ('mtb_carbono_doble_suspension','frances_bici_ponferrada',7,375,441),
  ('mtb_carbono_doble_suspension','portugues_bici_oporto',7,375,441),
  ('mtb_carbono_doble_suspension','primitivo_bici_oviedo',9,445,524),
  ('mtb_carbono_doble_suspension','frances_bici_leon',8,410,482),
  ('mtb_carbono_doble_suspension','portugues_bici_oporto_6_dias',7,375,441),
  ('mtb_carbono_doble_suspension','costero_bici_porto_6_dias',7,375,441),
  ('mtb_carbono_doble_suspension','costero_bici_porto_9_dias',9,445,524),
  ('ebike','frances_bici_ponferrada',7,385,453),
  ('ebike','portugues_bici_oporto',7,385,453),
  ('ebike','primitivo_bici_oviedo',9,455,535),
  ('ebike','frances_bici_leon',8,420,494),
  ('ebike','portugues_bici_oporto_6_dias',7,385,453),
  ('ebike','costero_bici_porto_6_dias',7,385,453),
  ('ebike','costero_bici_porto_9_dias',9,455,535),
  ('ebike_doble_suspension','frances_bici_ponferrada',7,480,565),
  ('ebike_doble_suspension','portugues_bici_oporto',7,480,565),
  ('ebike_doble_suspension','primitivo_bici_oviedo',9,580,682),
  ('ebike_doble_suspension','frances_bici_leon',8,530,624),
  ('ebike_doble_suspension','portugues_bici_oporto_6_dias',7,480,565),
  ('ebike_doble_suspension','costero_bici_porto_6_dias',7,480,565),
  ('ebike_doble_suspension','costero_bici_porto_9_dias',9,580,682)
) v(bike,route,d,p,cs) join comercial.bikes b on b.slug=v.bike join comercial.routes r on r.slug=v.route
on conflict (bike_id,route_id,year) do update set days=excluded.days, price_pilgrim=excluded.price_pilgrim, price_cs=excluded.price_cs, notes=excluded.notes;
update comercial.bike_prices bp set price_pilgrim=null, price_cs=null, notes='No sale en el catálogo Pilgrim 2027: confirmar con Pilgrim'
  from comercial.bikes b where b.id=bp.bike_id and bp.year=2027 and b.slug in ('gravel','mtb_carbono','mtb_doble_suspension');


-- 6. Itinerario de las dos rutas web en bici que no tenían etapas (sale del catálogo 2027).
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Oporto',null,'Oporto'), (2,'Oporto','Barcelos',54,'Barcelos'), (3,'Barcelos','Ponte de Lima',35,'Ponte de Lima'), (4,'Ponte de Lima','Tui',36,'Tui'), (5,'Tui','Pontevedra',52,'Pontevedra'), (6,'Pontevedra','Santiago de Compostela',63,'Santiago')) v(day,from_place,to_place,km,accommodation)
 where r.slug='portugues_bici_oporto' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);
insert into comercial.route_stages (route_id,day,from_place,to_place,km,accommodation)
select r.id, v.* from comercial.routes r, (values (1,null,'Llegada a Oviedo',null,'Oviedo'), (2,'Oviedo','Salas',48,'Salas'), (3,'Salas','Pola de Allande',47,'Pola de Allande'), (4,'Pola de Allande','Grandas de Salime',38,'Grandas de Salime'), (5,'Grandas de Salime','O Cádavo',50,'O Cádavo'), (6,'O Cádavo','Lugo',30,'Lugo'), (7,'Lugo','Melide',46,'Melide'), (8,'Melide','Santiago de Compostela',52,'Santiago')) v(day,from_place,to_place,km,accommodation)
 where r.slug='primitivo_bici_oviedo' and not exists (select 1 from comercial.route_stages s where s.route_id=r.id);

commit;
