-- =============================================================
-- 0025_contenido_ideas.sql
-- Bandeja de sugerencias del Estudio de Contenido: "qué publico".
--
-- `razon` es NOT NULL a propósito. Una sugerencia sin motivo verificable no vale nada, y
-- `evidencia` guarda los números crudos que la respaldan — incluida SIEMPRE la n de cada
-- señal. Con ~18 posts publicados, cualquier promedio de rendimiento es ruido si se
-- presenta sin su tamaño de muestra: la interfaz muestra la n al lado de la afirmación y
-- marca "señal débil" por debajo de 5.
-- =============================================================

create table if not exists public.contenido_ideas (
  id        bigint generated always as identity primary key,
  titular   text not null,
  pilar     text,                 -- id de PILARES (estrategia.ts)
  formato   text,
  plantilla_sugerida text,        -- id del registry de plantillas
  angulo    text,                 -- desarrollo de la idea, en prosa
  razon     text not null,        -- POR QUÉ se sugiere, citando un dato
  evidencia jsonb,                -- los números crudos, con su n
  ruta_nombre text,
  fuente    text not null default 'claude' check (fuente in ('claude','manual')),
  estado    text not null default 'nueva' check (estado in ('nueva','usada','descartada')),
  pieza_id  uuid references public.contenido_piezas(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.contenido_ideas is
  'Sugerencias de qué publicar. `razon` es NOT NULL a propósito: una sugerencia sin motivo verificable no vale nada, y `evidencia` guarda los números crudos que la respaldan, incluida la n de cada señal.';

create index if not exists contenido_ideas_estado_idx
  on public.contenido_ideas (estado, created_at desc);

alter table public.contenido_ideas enable row level security;
drop policy if exists "contenido_ideas_auth" on public.contenido_ideas;
create policy "contenido_ideas_auth" on public.contenido_ideas
  for all to authenticated using (true) with check (true);
grant all on public.contenido_ideas to authenticated;

-- La pieza puede recordar de qué idea salió. `not valid` para no bloquear si quedaran
-- idea_id huérfanos de antes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contenido_piezas_idea_fk') then
    alter table public.contenido_piezas
      add constraint contenido_piezas_idea_fk
      foreign key (idea_id) references public.contenido_ideas(id) on delete set null
      not valid;
  end if;
end $$;
