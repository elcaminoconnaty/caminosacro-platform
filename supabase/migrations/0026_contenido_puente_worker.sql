-- =============================================================
-- 0026_contenido_puente_worker.sql
-- El puente: cómo la plataforma alojada en Railway consigue que Claude escriba el copy
-- usando la SUSCRIPCIÓN de Claude Code, que vive en el computador de Nico.
--
-- EL PROBLEMA: la sesión de Claude Code está en el llavero de esa máquina. Un servidor no
-- puede usarla, y no es algo que se pueda programar alrededor.
--
-- LA SOLUCIÓN: una cola. La plataforma deja el encargo aquí; un worker que corre en el
-- computador lo toma, lo resuelve con la suscripción y escribe la respuesta. La pantalla
-- —del navegador que sea, de quien sea, esté donde esté— ve aparecer el resultado.
--
-- LO QUE ESTO COMPRA: el computador SOLO HACE LLAMADAS SALIENTES. No hace falta abrir
-- puertos, ni túnel, ni IP fija, ni estar en la misma red. Funciona con el portátil en un
-- café. Y el enlace sigue siendo el mismo de siempre, el de Railway.
--
-- SI EL COMPUTADOR ESTÁ APAGADO: el encargo espera en la cola y la pantalla lo dice. Se
-- resuelve solo cuando se encienda. Decisión tomada a propósito: nada sale por la API.
-- =============================================================

create table if not exists public.contenido_trabajos (
  id         bigint generated always as identity primary key,
  tipo       text not null check (tipo in ('copy','ideas')),
  pieza_id   uuid references public.contenido_piezas(id) on delete cascade,
  -- Todo lo que el worker necesita: el prompt ya armado y el esquema de la respuesta. El
  -- worker es deliberadamente tonto —no sabe de rutas, ni de voz, ni de plantillas— para
  -- que toda la lógica de negocio siga viviendo en la app y se despliegue con ella.
  entrada    jsonb not null,
  estado     text not null default 'pendiente'
             check (estado in ('pendiente','tomado','listo','error','consumido')),
  resultado  jsonb,
  error      text,
  intentos   int not null default 0,
  worker     text,
  creado_at    timestamptz not null default now(),
  tomado_at    timestamptz,
  terminado_at timestamptz
);

comment on table public.contenido_trabajos is
  'Cola del puente: la plataforma (Railway) deja aquí el encargo y el worker que corre en el computador de Nico lo resuelve con la suscripción de Claude Code y escribe la respuesta. El computador solo hace llamadas salientes: no hace falta túnel, puerto abierto ni IP fija.';

create index if not exists contenido_trabajos_pendientes_idx
  on public.contenido_trabajos (estado, creado_at)
  where estado in ('pendiente','tomado');

-- Latido del worker: con esto la plataforma puede decirle al usuario si el computador
-- está encendido y escuchando, ANTES de que encargue nada.
create table if not exists public.contenido_worker (
  id       int primary key default 1,
  visto_at timestamptz not null default now(),
  host     text,
  version  text,
  check (id = 1)
);

comment on table public.contenido_worker is
  'Latido del worker. La plataforma lo mira para decir si el computador está encendido y escuchando.';

insert into public.contenido_worker (id, visto_at, host)
  values (1, now() - interval '1 day', 'sin arrancar')
  on conflict (id) do nothing;

-- Tomar un trabajo sin que dos workers se peleen el mismo. `skip locked` es lo que hace
-- segura la cola si algún día corren dos computadores a la vez.
create or replace function public.contenido_tomar_trabajo(p_worker text)
returns public.contenido_trabajos
language plpgsql
security definer
set search_path = public
as $$
declare
  fila public.contenido_trabajos;
begin
  update public.contenido_trabajos t
     set estado = 'tomado', tomado_at = now(), worker = p_worker, intentos = t.intentos + 1
   where t.id = (
     select id from public.contenido_trabajos
      where estado = 'pendiente'
      order by creado_at
      limit 1
      for update skip locked
   )
  returning t.* into fila;
  return fila;
end $$;

-- Un trabajo 'tomado' que lleve más de 5 minutos quieto es un worker que se cayó a mitad
-- (se cerró el portátil, se fue el wifi). Vuelve a la cola, hasta 3 intentos.
create or replace function public.contenido_rescatar_trabajos()
returns int
language sql
security definer
set search_path = public
as $$
  with rescatados as (
    update public.contenido_trabajos
       set estado = case when intentos >= 3 then 'error' else 'pendiente' end,
           error  = case when intentos >= 3 then 'El worker no respondió después de 3 intentos.' else error end
     where estado = 'tomado' and tomado_at < now() - interval '5 minutes'
    returning 1
  )
  select count(*)::int from rescatados;
$$;

alter table public.contenido_trabajos enable row level security;
alter table public.contenido_worker   enable row level security;

drop policy if exists "contenido_trabajos_auth" on public.contenido_trabajos;
create policy "contenido_trabajos_auth" on public.contenido_trabajos
  for all to authenticated using (true) with check (true);

-- El worker escribe con service_role; la plataforma solo necesita LEER el latido.
drop policy if exists "contenido_worker_lectura" on public.contenido_worker;
create policy "contenido_worker_lectura" on public.contenido_worker
  for select to authenticated using (true);

grant all on public.contenido_trabajos to authenticated;
grant select on public.contenido_worker to authenticated;
grant execute on function public.contenido_rescatar_trabajos() to authenticated;
