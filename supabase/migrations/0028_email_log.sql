-- 0028: registro de correos enviados por la plataforma.
--
-- Por qué existe: hasta hoy el único rastro de un envío eran dos columnas
-- (`quotes.email_sent_at` y `quotes.pilgrim_email_sent_at`), sin destinatario, sin
-- identificador y sin estado. Y se escribían aunque el correo no hubiera salido: el
-- webhook de n8n responde "Workflow got started" ANTES de llamar a Brevo, así que un
-- 400 de Brevo (adjunto pesado, extensión no admitida, credencial vencida) se veía en
-- el CRM como "✓ Enviado". Las ejecuciones de n8n se purgan en pocos días, así que
-- después no quedaba forma de saber qué pasó.
--
-- En agosto de 2026 tres solicitudes a Pilgrim se dieron por enviadas y nunca
-- llegaron. Esta tabla es para que la próxima vez haya dónde mirar.
--
-- Aditiva: no toca nada existente.

create table if not exists comercial.email_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quote_id uuid references comercial.quotes(id) on delete set null,
  code text,
  -- 'cliente' | 'pilgrim' | 'contrato' | 'lead' ...
  tipo text not null,
  destinatario text not null,
  asunto text,
  adjuntos integer not null default 0,
  -- El que devuelve Brevo. NULL = el envío se aceptó pero nadie confirmó que saliera.
  message_id text,
  -- 'aceptado' (n8n recibió), 'confirmado' (Brevo devolvió messageId), 'error'
  estado text not null default 'aceptado',
  error text,
  prueba boolean not null default false
);

comment on table comercial.email_log is
  'Un renglón por correo que la plataforma intentó enviar. estado=aceptado significa que n8n recibió la petición, NO que el correo llegó; solo con message_id se sabe que Brevo lo tomó.';

create index if not exists email_log_quote_idx on comercial.email_log (quote_id);
create index if not exists email_log_created_idx on comercial.email_log (created_at desc);
create index if not exists email_log_destinatario_idx on comercial.email_log (destinatario);

alter table comercial.email_log enable row level security;
drop policy if exists "auth_all" on comercial.email_log;
create policy "auth_all" on comercial.email_log for all to authenticated using (true) with check (true);

-- Ya que estamos: el contacto real de Pilgrim, que estaba vacío y por eso el correo
-- salía dirigido a "Pilgrim" genérico en vez de a una persona.
update comercial.settings
set value = jsonb_set(value, '{contacto}', '"Cristina San Martín"'::jsonb)
where key = 'pilgrim'
  and coalesce(value->>'contacto', '') = '';
