-- 0051: las tablas de Isabel solo las usa la llave de servicio. RLS ya bloqueaba a
-- anon/authenticated; esto además les niega el permiso. La Edge Function isabel-embed
-- se apoya en esto para validar que quien la llama trae una llave de servicio.
revoke all on public.isabel_conversations, public.isabel_messages, public.isabel_outreach,
  public.isabel_knowledge, public.isabel_lessons from anon, authenticated;
revoke all on sequence public.isabel_messages_id_seq, public.isabel_knowledge_id_seq,
  public.isabel_lessons_id_seq from anon, authenticated;
