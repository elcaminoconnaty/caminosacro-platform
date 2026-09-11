-- 0040_referencia_pilgrim.sql
--
-- La referencia de reserva de Pilgrim en la cotización.
--
-- Cuando Pilgrim confirma una reserva le pone un número (el expediente A47397 del que se
-- calcó la documentación de viaje es "Reserva: 47397"). Ese número es el que reconocen los
-- alojamientos, el transportista de mochilas y el teléfono de asistencia en España; nuestro
-- código CS-2026-034 no le dice nada a nadie en el Camino. Hasta ahora ese número vivía en
-- el correo de Nico y en el PDF que sube a quote_pilgrim_files, y el Documento de Viaje que
-- se lleva el peregrino solo mostraba el código nuestro.
--
-- Va en `quotes` y no en `travel_docs` porque es un dato de LA RESERVA con el operador, no
-- del expediente de documentación: existe desde que Pilgrim confirma, antes de que se
-- genere documento alguno, y lo necesita también quien cuadra una factura o responde un
-- cambio. El Documento de Viaje, la página pública y el correo lo leen de aquí.
--
-- Texto libre a propósito: Pilgrim escribe "47397" y a veces "A47397"; no hay formato que
-- validar sin arriesgarse a rechazar el número real.
--
-- Aditiva: sin referencia, todo sigue saliendo con el código CS como hasta ahora.

alter table comercial.quotes
  add column if not exists pilgrim_ref text;

comment on column comercial.quotes.pilgrim_ref is
  'Referencia de reserva que asigna Pilgrim al confirmar (ej. 47397). Es la que el viajero debe dar en alojamientos, transportista y asistencia durante el viaje; sale en la portada del Documento de Viaje, en la página pública y en el correo. Vacía = todavía no confirmada por Pilgrim.';
