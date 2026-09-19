-- 0047_etiqueta_equipaje_marca.sql
--
-- La etiqueta de equipaje sale con NUESTRO logo, no con el de Pilgrim.
--
-- Las mochilas las mueve Correos (Paq Mochila) y la reserva la hace Pilgrim. La etiqueta
-- que emite Correos trae, junto a su corneta, el logo de Pilgrim: el peregrino que nos
-- compró a nosotros terminaba con el nombre de nuestro proveedor colgado de la mochila
-- durante todo el Camino. Desde ahora, al subir la etiqueta la plataforma le cambia ese
-- logo por la marca de Camino Sacro y deja el resto del impreso intacto — el amarillo, la
-- corneta de Correos, los alojamientos de cada noche, las condiciones y las líneas de
-- corte. Ver `src/lib/etiquetas/`.
--
-- Estas dos columnas son lo único que hace falta en la base, y las dos existen por la
-- misma razón: que el cambio sea REVERSIBLE sin volver a pedirle el archivo a Pilgrim.
--
--   luggage_tag_original_path — el PDF tal cual lo subió Nico, guardado al lado del
--     modificado. Con él, el botón "Dejar la original" de la tarjeta del expediente es
--     instantáneo, y si algún día una plantilla nueva sale mal marcada se ve en qué se
--     diferencia del original en vez de adivinarlo.
--
--   luggage_tag_brand — qué hizo la plataforma: cuántas colocaciones del logo sustituyó,
--     las huellas de lo que quitó y si ya conocía ese logo o es la primera vez que lo ve.
--     Lo lee la tarjeta para decir "revisa que quedó bien" solo cuando toca, en vez de dar
--     la lata en cada etiqueta. Es un informe, no un estado: jsonb para que crezca sin
--     otra migración.
--
-- Aditiva. Las cuatro etiquetas que ya están cargadas siguen exactamente donde estaban,
-- con las dos columnas en null, que se lee como "esta etiqueta es anterior al módulo".

alter table comercial.travel_docs
  add column if not exists luggage_tag_original_path text,
  add column if not exists luggage_tag_brand jsonb;

comment on column comercial.travel_docs.luggage_tag_original_path is
  'Etiqueta de equipaje tal como la emitió el transportista, antes de cambiarle el logo. Null = no se le cambió nada (o es anterior al módulo de marcado) y luggage_tag_pdf_path YA es el original.';

comment on column comercial.travel_docs.luggage_tag_brand is
  'Informe del marcado: {reemplazos, huellas[], reconocido, detalle[], cuando}. `reconocido: false` = el logo que se quitó no estaba en la lista conocida y conviene mirar la etiqueta antes de enviarla.';
