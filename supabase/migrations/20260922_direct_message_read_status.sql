alter table public.direct_messages
  add column if not exists read_at timestamptz,
  add column if not exists reaction text;

alter table public.direct_messages replica identity full;

drop policy if exists "Participants can update direct messages" on public.direct_messages;
create policy "Participants can update direct messages"
on public.direct_messages
for update
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id)
with check (auth.uid() = sender_id or auth.uid() = receiver_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end
$$;

notify pgrst, 'reload schema';