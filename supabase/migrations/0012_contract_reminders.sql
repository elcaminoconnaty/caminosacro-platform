-- 0012_contract_reminders.sql
-- Recordatorios automáticos de firma: cada 4 días se le reenvía el enlace al viajero
-- mientras el contrato siga en 'enviado', con un tope de 5 envíos.
-- Lo dispara un Schedule de n8n contra /api/cron/recordatorios-contrato.
--
-- `sent_at` existe porque `updated_at` no sirve de referencia: cambia con cualquier
-- edición del contrato y reiniciaría la cuenta de los 4 días sin que se haya reenviado nada.

alter table comercial.contracts
  add column if not exists sent_at timestamptz,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminder_count int not null default 0;

comment on column comercial.contracts.sent_at is
  'Cuándo se envió (o reenvió manualmente) el enlace de firma al viajero. Punto de partida para contar el primer recordatorio.';
comment on column comercial.contracts.last_reminder_at is
  'Último recordatorio automático de firma enviado.';
comment on column comercial.contracts.reminder_count is
  'Recordatorios automáticos enviados desde el último envío del enlace (tope 5). Un reenvío manual lo vuelve a 0.';

-- Los contratos que ya estaban esperando firma antes de esta migración: su envío se
-- aproxima con updated_at, para que entren al ciclo de recordatorios sin quedar colgados.
update comercial.contracts
   set sent_at = updated_at
 where status = 'enviado'
   and sent_at is null;

-- El cron barre por estado y fecha; el índice lo mantiene barato.
create index if not exists contracts_recordatorios_idx
  on comercial.contracts (status, reminder_count)
  where status = 'enviado';
