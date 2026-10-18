-- Asistente de la plataforma (docs/ASISTENTE.md).
--
-- 1. comercial.asistente_consulta(q): el único camino del asistente a la base. Corre UN
--    SELECT con la sesión de quien pregunta (security invoker: aplica el RLS de siempre, así
--    que lo privado de BayMax o los tokens de Instagram, que no tienen política para
--    `authenticated`, devuelven cero filas) y solo dentro de una transacción de solo lectura
--    (PostgREST corre los GET así; el servidor llama con { get: true }).
-- 2. Conversaciones y mensajes del asistente: queda registro de quién preguntó qué.

create or replace function comercial.asistente_consulta(q text) returns jsonb
language plpgsql stable security invoker set search_path = comercial, public, pg_temp as $$
declare s text; r jsonb;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'asistente_consulta solo corre en una transacción de solo lectura';
  end if;
  s := regexp_replace(btrim(coalesce(q, '')), ';\s*$', '');
  if s !~* '^(select|with)\s' then raise exception 'Solo se permiten consultas SELECT'; end if;
  if position(';' in s) > 0 then raise exception 'Una sola consulta, sin punto y coma en el medio'; end if;
  -- Red extra por nombre: lo que nunca tiene que salir aunque el RLS cambiara mañana.
  if s ~* '(baymax_|ig_tokens|contract_otps|\mconfig\M|\mauth\.|\mvault\.|\mstorage\.|pg_read|pg_ls|lo_import|dblink)' then
    raise exception 'Esa tabla o función no está disponible para el asistente';
  end if;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) _q limit 200) t', s)
    into r;
  return r;
end $$;
revoke execute on function comercial.asistente_consulta(text) from public, anon;
grant execute on function comercial.asistente_consulta(text) to authenticated;

create table if not exists comercial.asistente_conversaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_email text,
  titulo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comercial.asistente_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references comercial.asistente_conversaciones(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant')),
  contenido text not null,
  -- Lo que usó para responder: consultas SQL, correos y PDF leídos.
  herramientas jsonb,
  error text,
  modelo text,
  duracion_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists asistente_mensajes_conv_idx on comercial.asistente_mensajes (conversacion_id, created_at);
create index if not exists asistente_conversaciones_user_idx on comercial.asistente_conversaciones (user_id, updated_at desc);

alter table comercial.asistente_conversaciones enable row level security;
alter table comercial.asistente_mensajes enable row level security;

-- Cada quien ve y escribe solo sus conversaciones.
drop policy if exists "propias" on comercial.asistente_conversaciones;
create policy "propias" on comercial.asistente_conversaciones for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "propios" on comercial.asistente_mensajes;
create policy "propios" on comercial.asistente_mensajes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on comercial.asistente_conversaciones, comercial.asistente_mensajes to authenticated;
