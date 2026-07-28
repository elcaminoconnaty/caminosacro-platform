-- 0013_costo_pilgrim.sql
-- El costo Pilgrim pasa a ser DERIVADO, igual que total_eur.
--
-- Problema: `cost_eur` era un escalar suelto que solo guardaba la tarifa de ruta y
-- nunca se recalculaba, mientras el lado del cliente sí tenía recompute_quote_total()
-- sumando base + suplemento + líneas. Resultado: los servicios adicionales y el
-- suplemento de temporada no entraban al costo, y la utilidad salía inflada.
-- (CS-2026-034: costo real 705 €, la pantalla mostraba 580 € y utilidad 280 en vez de 155.)
--
-- La estructura queda espejada:
--
--   CLIENTE                          PILGRIM
--   quotes.base_eur                  quotes.cost_base_eur              (nueva)
--   quotes.season_supplement_eur     quotes.season_supplement_cost_eur (nueva)
--   quote_lines.unit_price           quote_lines.cost_unit             (ya existía, nadie la leía)
--   quotes.total_eur   (derivado)    quotes.cost_eur   (pasa a derivado)

alter table comercial.quotes
  add column if not exists cost_base_eur numeric(10,2) default 0;

alter table comercial.quotes
  add column if not exists season_supplement_cost_eur numeric(10,2) default 0;

comment on column comercial.quotes.cost_base_eur is
  'Costo Pilgrim de ruta + alojamiento, sin suplemento ni opcionales. Espejo de base_eur.';
comment on column comercial.quotes.season_supplement_cost_eur is
  'Suplemento de temporada a precio Pilgrim, total del grupo. Espejo de season_supplement_eur.';
comment on column comercial.quotes.cost_eur is
  'DERIVADO por recompute_quote_money(): cost_base_eur + season_supplement_cost_eur + sum(quantity*cost_unit). No escribir a mano.';

-- =============================================================
-- Recálculo: total del cliente y costo Pilgrim en una sola pasada.
-- =============================================================
create or replace function comercial.recompute_quote_money(p_quote_id uuid)
returns numeric language plpgsql as $$
declare
  v_base       numeric(10,2);
  v_supp       numeric(10,2);
  v_cost_base  numeric(10,2);
  v_cost_supp  numeric(10,2);
  v_lines      numeric(10,2);
  v_cost_lines numeric(10,2);
  v_total      numeric(10,2);
  v_cost       numeric(10,2);
begin
  select coalesce(base_eur, 0), coalesce(season_supplement_eur, 0),
         coalesce(cost_base_eur, 0), coalesce(season_supplement_cost_eur, 0)
    into v_base, v_supp, v_cost_base, v_cost_supp
    from comercial.quotes where id = p_quote_id;

  -- Un descuento resta de ambos lados: le rebaja al cliente y, si el proveedor
  -- lo concede, también al costo. Mismo criterio que traía recompute_quote_total.
  select coalesce(sum(case when type = 'discount' then -total else total end), 0),
         coalesce(sum(case when type = 'discount' then -(quantity * coalesce(cost_unit, 0))
                           else (quantity * coalesce(cost_unit, 0)) end), 0)
    into v_lines, v_cost_lines
    from comercial.quote_lines
    where quote_id = p_quote_id and type in ('optional','custom','discount');

  v_total := v_base + v_supp + v_lines;
  v_cost  := v_cost_base + v_cost_supp + v_cost_lines;

  update comercial.quotes
     set total_eur = v_total,
         cost_eur  = v_cost
   where id = p_quote_id;

  return v_total;
end $$;

-- recompute_quote_total se conserva como envoltorio: hay varios sitios en la app que
-- ya lo llaman después de cada cambio que mueve plata (updateQuote, toggleQuoteOptional,
-- updateQuoteLineQuantity, los flujos de creación). Reusando el nombre, todos recalculan
-- también el costo sin tocar cada call site y sin que quede uno olvidado.
create or replace function comercial.recompute_quote_total(p_quote_id uuid)
returns numeric language sql as $$
  select comercial.recompute_quote_money(p_quote_id);
$$;

-- =============================================================
-- Backfill
--
-- Ojo: el estado de partida es MIXTO, no uniforme. El asistente y el cotizador web
-- SÍ sumaban el suplemento Pilgrim al crear la cotización; el editor de seguimiento lo
-- BORRABA al guardar. Sumárselo a ciegas a todas lo duplicaría en las primeras.
--
-- Por eso se compara cada cotización contra el catálogo:
--   diferencia ≈ 0            → le falta el suplemento  → se lo agregamos
--   diferencia ≈ suplemento   → ya lo tiene incluido    → se separa sin cambiar el total
--   cualquier otra cosa       → ambiguo                 → se deja el costo intacto (revisión manual)
--
-- Los OPCIONALES sí se agregan siempre: ninguno de los tres flujos de creación los
-- metía nunca en cost_eur, así que ahí no hay ambigüedad posible.
-- =============================================================
with supp as (
  select value from comercial.settings where key = 'season_supplements'
),
base as (
  select
    q.id,
    coalesce(q.cost_eur, 0) as costo_actual,
    -- Suplemento Pilgrim que le corresponde por temporada
    coalesce(q.people, 1) * coalesce(
      case q.season_kind
        when 'high_season' then (select (value->'high_season'->>'price_pilgrim')::numeric from supp)
        when 'easter'      then (select (value->'easter'->>'price_pilgrim')::numeric from supp)
        else 0
      end, 0) as supp_pilgrim,
    -- Tarifa de ruta del catálogo. El slug se deduce con LIKE porque conviven dos
    -- nomenclaturas ("Pensión single" del editor y "Pensión, habitación individual"
    -- del asistente).
    (select p.price_pilgrim * coalesce(q.people, 1)
       from comercial.pricing p
       join comercial.routes r on r.id = p.route_id
      where r.name = q.route_name
        and p.season = 'regular'
        and p.modality = case
              when lower(q.modality) like '%pensi%' and lower(q.modality) like '%doble%'       then 'pension_doble'
              when lower(q.modality) like '%pensi%' and (lower(q.modality) like '%single%'
                                                      or lower(q.modality) like '%individual%') then 'pension_single'
              when lower(q.modality) like '%hotel%' and lower(q.modality) like '%doble%'        then 'hotel_doble'
              when lower(q.modality) like '%hotel%' and (lower(q.modality) like '%single%'
                                                      or lower(q.modality) like '%individual%') then 'hotel_single'
            end
      limit 1) as ruta_catalogo
  from comercial.quotes q
)
update comercial.quotes q
   set cost_base_eur = case
         when b.supp_pilgrim = 0 then b.costo_actual
         when b.ruta_catalogo is null then b.costo_actual
         when abs(b.costo_actual - b.ruta_catalogo - b.supp_pilgrim) < 0.01 then b.ruta_catalogo
         when abs(b.costo_actual - b.ruta_catalogo) < 0.01 then b.ruta_catalogo
         else b.costo_actual
       end,
       season_supplement_cost_eur = case
         when b.supp_pilgrim = 0 then 0
         when b.ruta_catalogo is null then 0
         when abs(b.costo_actual - b.ruta_catalogo - b.supp_pilgrim) < 0.01 then b.supp_pilgrim
         when abs(b.costo_actual - b.ruta_catalogo) < 0.01 then b.supp_pilgrim
         else 0
       end
  from base b
 where b.id = q.id;

-- Recalcular todo con la fórmula nueva.
select comercial.recompute_quote_money(id) from comercial.quotes;
