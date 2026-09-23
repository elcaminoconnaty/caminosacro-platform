-- 0052: embeddings con gte-small (Edge Function isabel-embed, 384 dims) en vez de
-- OpenAI text-embedding-3-small (1536): gratis y sin depender del saldo de OpenAI,
-- que se agotó el 2026-09-23. La tabla estaba vacía al aplicarla.
drop index if exists public.isabel_knowledge_emb_idx;
alter table public.isabel_knowledge drop column embedding;
alter table public.isabel_knowledge add column embedding extensions.vector(384);
create index isabel_knowledge_emb_idx on public.isabel_knowledge using hnsw (embedding extensions.vector_cosine_ops);

drop function if exists public.isabel_buscar(text, extensions.vector, int, float, float, int);
-- (misma función de 0050, con query_embedding vector(384))
create or replace function public.isabel_buscar(
  query_text      text,
  query_embedding extensions.vector(384),
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
revoke execute on function public.isabel_buscar(text, extensions.vector, int, float, float, int) from public, anon, authenticated;
