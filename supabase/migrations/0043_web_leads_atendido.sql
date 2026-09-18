-- 0043: cerrar un lead de la web desde el panel.
--
-- La migración 0035 creó `comercial.web_leads` para que un lead sin precio no dependiera
-- del correo para existir. Funcionó: al 18-sep-2026 hay 6 filas ahí —Hugo, Marcela y
-- Martha entre ellas—. Lo que nunca se construyó fue el otro medio punto: **ninguna
-- pantalla de la plataforma lee esa tabla**. Nico abre Seguimiento, ve las cotizaciones
-- con precio (Pepa) y no ve a nadie más, porque los que se quedan sin precio no crean
-- cotización a propósito. El lead está guardado y es invisible: para él, se perdió igual.
--
-- Con el listado hace falta poder sacarlos de la lista cuando ya se atendieron; si no,
-- la bandeja crece para siempre y a la semana nadie la mira. Eso es lo único que añade
-- esta migración.
--
-- `atendido_at` null = sigue pendiente. Es la vista por defecto del panel.
--
-- Aditiva: dos columnas nuevas que admiten null. El código viejo no las toca.

alter table comercial.web_leads
  add column if not exists atendido_at timestamptz,
  add column if not exists atendido_nota text;

comment on column comercial.web_leads.atendido_at is
  'Cuándo se marcó atendido desde Seguimiento. null = pendiente; es el filtro por defecto del panel de leads.';

comment on column comercial.web_leads.atendido_nota is
  'Qué se hizo con el lead (se le cotizó a mano, no contestó, cargamos las tarifas…). Texto libre, opcional.';

-- Los pendientes son la consulta que corre en cada carga de Seguimiento.
create index if not exists web_leads_pendientes_idx
  on comercial.web_leads (created_at desc)
  where atendido_at is null;
