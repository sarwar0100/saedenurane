alter table public.direct_messages
  add column if not exists reply_to_id uuid references public.direct_messages(id) on delete set null,
  add column if not exists reply_to_text text,
  add column if not exists reply_to_sender_id uuid references public.profiles(id) on delete set null;

drop policy if exists "Users can delete own direct messages" on public.direct_messages;
create policy "Users can delete own direct messages"
on public.direct_messages
for delete
to authenticated
using (auth.uid() = sender_id);

notify pgrst, 'reload schema';