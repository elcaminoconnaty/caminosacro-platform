-- 0058_noches_extra_incluidas.sql
--
-- Noches extra que YA vienen dentro del precio de la ruta.
--
-- Pilgrim a veces cotiza a un grupo con la noche adicional en Santiago metida en la
-- tarifa por persona (Colegiatura, Francés desde Sarria, mayo-2027). Hasta ahora la única
-- forma de que el itinerario mostrara ese día libre era agregar la línea opcional "Noche
-- extra", que además la cobraba otra vez. Con esta columna el itinerario, el conteo de
-- días/noches y la carta de bienvenida suman esas noches, sin tocar el total.
--
-- Aditiva: 0 = como siempre.

alter table comercial.quotes
  add column if not exists noches_extra_incluidas smallint not null default 0
    check (noches_extra_incluidas between 0 and 14);

comment on column comercial.quotes.noches_extra_incluidas is
  'Noches extra en el destino incluidas en el precio de la ruta (no se cobran aparte). Se ven en el itinerario como días libres.';
