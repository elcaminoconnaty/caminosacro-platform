-- 0035: los leads del cotizador de la web que se quedan sin precio.
--
-- Por qué existe: `/api/wp/lead` atiende los dos casos en que caminosacro.com no puede dar
-- una cifra —el año de salida no tiene tarifas cargadas, o la ruta se arma a medida— y a
-- propósito NO crea cliente, ni cotización, ni PDF. Lo único que hacía era mandar dos
-- correos. O sea que **el correo era el único registro del lead**: si el webhook de n8n
-- fallaba, la persona desaparecía del mapa y lo único que quedaba era un `console.error`
-- que se pierde con el siguiente despliegue.
--
-- La fila de `email_log` que ya se escribe (migración 0028) deja el correo y el asunto,
-- pero no la ruta, ni la fecha, ni las personas, ni el teléfono: sirve para saber que
-- alguien escribió, no para atenderlo.
--
-- Y hay una segunda cosa que esta tabla hace posible y hoy es inaveriguable: **cuánta
-- demanda se está perdiendo por no tener cargadas las tarifas de un año**. Al 4-sep-2026
-- solo 6 de las 51 filas de tarifa son de 2027, así que cada consulta de 2027 cae por este
-- camino. Con esta tabla, esa pregunta se contesta con un `count(*) group by`.
--
-- Aditiva: tabla nueva, no toca nada existente.

create table if not exists comercial.web_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Referencia que la web le enseñó al visitante, si la hubo.
  code text,
  -- 'sin_tarifas_ano' (el año no tiene tarifas) | 'a_medida' (ruta sin tarifa publicada)
  motivo text not null,

  -- Qué pidió. `route_slug` es lo que manda: `route_name` es la etiqueta que vio.
  route_slug text not null,
  route_name text,
  tipo text not null,                -- 'pension' | 'hotel'
  start_date date not null,
  people integer not null,

  -- Quién lo pidió. Se guarda entero para poder atenderlo sin abrir el correo.
  full_name text not null,
  email text not null,
  phone text not null,
  marketing_optin boolean not null default false,
  visitor_ip text,

  -- Resultado del envío, escrito DESPUÉS de intentarlo. `null` = todavía no se sabe
  -- (la fila se crea antes de llamar al webhook, que es justo el punto de esta tabla).
  email_sent boolean,
  email_error text
);

comment on table comercial.web_leads is
  'Un renglón por lead del cotizador de la web que quedó SIN PRECIO. Se escribe ANTES de intentar el correo, para que un fallo del webhook no borre a la persona. email_sent null = la fila se creó y el envío aún no había terminado.';

comment on column comercial.web_leads.motivo is
  'sin_tarifas_ano = el año de salida no tiene tarifas cargadas para esa ruta y alojamiento. a_medida = la ruta no tiene tarifa publicada. Agrupar por este campo dice cuánta demanda se pierde por catálogo incompleto.';

-- Los tres accesos que se van a hacer: los últimos leads, los de un año de salida
-- (la pregunta de "cuánto 2027 se está perdiendo") y buscar a una persona por su correo.
create index if not exists web_leads_created_idx on comercial.web_leads (created_at desc);
create index if not exists web_leads_start_date_idx on comercial.web_leads (start_date);
create index if not exists web_leads_email_idx on comercial.web_leads (email);

alter table comercial.web_leads enable row level security;
drop policy if exists "auth_all" on comercial.web_leads;
create policy "auth_all" on comercial.web_leads for all to authenticated using (true) with check (true);
