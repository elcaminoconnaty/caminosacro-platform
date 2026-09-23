-- 0050: Isabel, la asesora comercial de Camino Sacro en WhatsApp (304 663 7964).
-- Aditiva: solo crea objetos nuevos. No toca las tablas de Clara ni del CRM.
--
-- Las tablas van en `public` con prefijo isabel_ (y no en un esquema propio) porque
-- Isabel entra por REST con la llave de servicio, igual que Clara, y un esquema nuevo
-- exigiría exponerlo a mano en el dashboard: un paso más que se puede olvidar.
-- RLS activo y sin políticas: solo la llave de servicio las lee y escribe.

create extension if not exists vector with schema extensions;

-- ── Conversaciones ─────────────────────────────────────────────────────────
-- Una por teléfono (solo dígitos, con indicativo: 573001234567).
create table if not exists public.isabel_conversations (
  phone            text primary key,
  chat_id          text,                          -- id del chat en WAHA (…@c.us / …@lid)
  display_name     text,
  status           text not null default 'isabel'
                   check (status in ('isabel', 'nico', 'paused')),
  paused_until     timestamptz,
  lead_temp        text check (lead_temp in ('frio', 'tibio', 'caliente', 'listo')),
  client_id        uuid,                          -- comercial.clients.id
  quote_id         uuid,                          -- comercial.quotes.id (la última del lead)
  quote_code       text,
  -- Contacto proactivo: none → queued → first_sent → followup_sent → closed.
  -- replied = el lead contestó (se acaba el guion de seguimiento).
  outreach_stage   text not null default 'none'
                   check (outreach_stage in ('none', 'queued', 'first_sent', 'followup_sent', 'replied', 'closed')),
  outreach_next_at timestamptz,
  outreach_count   integer not null default 0,
  optout           boolean not null default false,
  handoff_at       timestamptz,
  handoff_summary  text,
  last_message     text,
  last_message_at  timestamptz,
  last_inbound_at  timestamptz,
  unread           integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists isabel_conv_outreach_idx
  on public.isabel_conversations (outreach_stage, outreach_next_at);
alter table public.isabel_conversations enable row level security;

-- ── Mensajes ───────────────────────────────────────────────────────────────
create table if not exists public.isabel_messages (
  id          bigserial primary key,
  phone       text not null references public.isabel_conversations (phone) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  sent_by     text not null check (sent_by in ('user', 'isabel', 'nico')),
  external_id text unique,                        -- id del mensaje en WhatsApp
  kind        text not null default 'chat',       -- chat | outreach | followup | resume | handoff
  created_at  timestamptz not null default now()
);
create index if not exists isabel_msg_phone_idx on public.isabel_messages (phone, created_at desc);
alter table public.isabel_messages enable row level security;

-- ── Qué cotizaciones ya pasaron por la cola de contacto ───────────────────
-- Una fila por cotización: evita escribirle dos veces al mismo lead por la misma
-- cotización aunque el cron corra mil veces.
create table if not exists public.isabel_outreach (
  quote_id    uuid primary key,
  phone       text,
  decision    text not null,                      -- queued | skip_sin_telefono | skip_optout | skip_ya_habla | ...
  created_at  timestamptz not null default now()
);
alter table public.isabel_outreach enable row level security;

-- ── Conocimiento (RAG) ─────────────────────────────────────────────────────
create table if not exists public.isabel_knowledge (
  id         bigserial primary key,
  fuente     text not null,                       -- ruta:frances_desde_sarria, faq:web, contrato, guia, experta…
  titulo     text not null,
  contenido  text not null,
  hash       text not null unique,                -- sha256(fuente|titulo|contenido): ingesta idempotente
  embedding  extensions.vector(1536),
  fts        tsvector generated always as (to_tsvector('spanish', titulo || ' ' || contenido)) stored,
  updated_at timestamptz not null default now()
);
create index if not exists isabel_knowledge_fts_idx on public.isabel_knowledge using gin (fts);
create index if not exists isabel_knowledge_emb_idx on public.isabel_knowledge
  using hnsw (embedding extensions.vector_cosine_ops);
alter table public.isabel_knowledge enable row level security;

-- Búsqueda híbrida (receta de Supabase): texto completo + vector, fusionados por
-- Reciprocal Rank Fusion. El texto completo rescata nombres propios (Sarria, Tui,
-- Compostela) que el vector a veces diluye; el vector entiende la pregunta.
create or replace function public.isabel_buscar(
  query_text      text,
  query_embedding extensions.vector(1536),
  match_count     int default 6,
  full_text_weight float default 1,
  semantic_weight  float default 1,
  rrf_k            int default 50
)
returns table (id bigint, fuente text, titulo text, contenido text, score float)
language sql stable
set search_path = public, extensions
as $$
with full_text as (
  select k.id,
         row_number() over (order by ts_rank_cd(k.fts, websearch_to_tsquery('spanish', query_text)) desc) as rank_ix
  from public.isabel_knowledge k
  where k.fts @@ websearch_to_tsquery('spanish', query_text)
  limit least(match_count, 30) * 2
),
semantic as (
  select k.id,
         row_number() over (order by k.embedding <=> query_embedding) as rank_ix
  from public.isabel_knowledge k
  where k.embedding is not null
  order by k.embedding <=> query_embedding
  limit least(match_count, 30) * 2
)
select k.id, k.fuente, k.titulo, k.contenido,
       coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight
     + coalesce(1.0 / (rrf_k + se.rank_ix), 0.0) * semantic_weight as score
from full_text ft
full outer join semantic se on ft.id = se.id
join public.isabel_knowledge k on k.id = coalesce(ft.id, se.id)
order by score desc
limit least(match_count, 30);
$$;
revoke execute on function public.isabel_buscar from public, anon, authenticated;

-- ── Lecciones (mismo ciclo que Clara: propuesta → aprobación de Nico) ──────
create table if not exists public.isabel_lessons (
  id          bigserial primary key,
  lessons     text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected', 'superseded')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.isabel_lessons enable row level security;
