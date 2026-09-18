-- 0042_condiciones_particulares_cotizacion.sql
--
-- Las condiciones pactadas con UN cliente, cuando no son las de la plantilla.
--
-- El cliente firma dos papeles que tienen que decir lo mismo: la cotización (que entra al
-- contrato como Anexo No. 1) y el articulado. Hoy no lo dicen. La cotización cobra 100 €
-- por persona por una modificación y el articulado 100 € por solicitud; la cotización
-- promete el saldo "60 días antes" en un párrafo y "el 70% antes de los 30 días previos"
-- dos secciones más abajo. Mientras nadie los lea en paralelo no pasa nada — hasta que
-- alguien los lee: CS-2026-080 (Colegiatura, sep-2026) devolvió el contrato sin firmar
-- pidiendo unificar los porcentajes de cancelación, el cargo por modificación y los plazos
-- de pago antes de la firma.
--
-- Esto NO arregla esa divergencia de raíz — alinear la plantilla de la cotización con el
-- articulado, para que no vuelvan a separarse, es tarea aparte y hay que hacerla. Esto
-- permite cerrar una cotización concreta en los términos realmente pactados sin tocarle el
-- texto a las demás, que es lo que hace falta cuando ya hay un cliente esperando para
-- firmar. Es el gemelo de `condiciones_particulares` dentro de `contracts.variables_json`:
-- los dos documentos se corrigen con el mismo mecanismo o se vuelven a separar.
--
-- Aditiva: sin condiciones particulares, la cotización sale con el texto de siempre,
-- palabra por palabra. Las ya enviadas no cambian.
alter table comercial.quotes
  add column if not exists condiciones_json jsonb;

comment on column comercial.quotes.condiciones_json is
  'Condiciones particulares que reemplazan bloques del texto estándar del PDF de la '
  'cotización (validez, confirmación y pago, plazos de pago, modificación, cancelación, '
  'rótulo de los opcionales ya contratados). NULL = el texto de siempre. Ver el tipo '
  'CondicionesCotizacion en src/lib/quotePdf.tsx.';
