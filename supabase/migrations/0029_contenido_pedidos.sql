-- =============================================================
-- 0029_contenido_pedidos.sql
-- "Pídelo tú": el camino contrario al motor de sugerencias.
--
-- Hasta ahora el Estudio de Contenido solo sabía proponer DESDE LOS DATOS: métricas de
-- Instagram, cotizaciones, catálogo, calendario editorial (ver 0025). Eso lo hace honesto
-- pero cerrado — no puede proponer nada que los datos no sostengan, y hay ideas que
-- simplemente se le ocurren a uno: "qué es el Año Jacobeo", "cómo evitar ampollas".
--
-- Un pedido escrito reusa TODA la tubería que ya existe: se encola como un encargo más
-- (contenido_trabajos), lo resuelve el mismo worker sin enterarse de nada nuevo, y el
-- resultado aterriza como filas de contenido_ideas que la bandeja ya sabe pintar y que
-- "Armar" ya sabe convertir en pieza.
--
-- Por eso aquí no hay tablas nuevas: solo se le abre sitio al tercer tipo de encargo y se
-- guarda el texto del pedido para que la tarjeta siga siendo legible semanas después.
-- =============================================================

-- 1) La cola acepta un tercer tipo. Sin esto, el insert de `encolar()` falla con
--    "violates check constraint" y el pedido no llega nunca al worker.
alter table public.contenido_trabajos
  drop constraint if exists contenido_trabajos_tipo_check;

alter table public.contenido_trabajos
  add constraint contenido_trabajos_tipo_check
  check (tipo in ('copy','ideas','pedido'));

-- 2) El texto literal que escribió el usuario.
--
--    No es decorativo: `titular` y `razon` los escribe Claude, así que sin esto no queda
--    rastro de QUÉ se pidió, y una tarjeta que dice "2027: el año que solo llega 14 veces
--    por siglo" es indistinguible de una sugerencia salida de las métricas. La bandeja lo
--    muestra bajo el titular, entre comillas.
--
--    `fuente` ya distinguía 'claude' de 'manual' desde 0025: un pedido se guarda como
--    'manual' porque la idea es de la persona, aunque la redacción sea de Claude.
alter table public.contenido_ideas
  add column if not exists pedido text;

comment on column public.contenido_ideas.pedido is
  'El texto literal del pedido que escribió el usuario, cuando la idea nació de "Pídelo tú" (fuente = manual). Null en las sugerencias que salen de los datos.';
