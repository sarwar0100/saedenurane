alter table public.friend_requests enable row level security;

create or replace function public.accept_friend_request(
  request_id uuid default null,
  sender_user_id uuid default null,
  receiver_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_sender uuid;
  request_receiver uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if request_id is not null then
    select sender_id, receiver_id
      into request_sender, request_receiver
      from public.friend_requests
     where id = request_id
       and receiver_id = auth.uid()
       and status = 'pending'
     for update;
  else
    request_sender := sender_user_id;
    request_receiver := receiver_user_id;
    if request_receiver <> auth.uid() then
      raise exception 'Only the receiver can accept this request';
    end if;
  end if;

  if request_sender is null or request_receiver is null then
    raise exception 'Friend request not found';
  end if;

  update public.friend_requests
     set status = 'accepted', updated_at = now()
   where sender_id = request_sender
     and receiver_id = request_receiver
     and status = 'pending';

  update public.friend_requests
     set status = 'accepted', updated_at = now()
   where sender_id = request_receiver
     and receiver_id = request_sender;

  if not found then
    insert into public.friend_requests (sender_id, receiver_id, status)
    values (request_receiver, request_sender, 'accepted');
  end if;
end;
$$;

revoke all on function public.accept_friend_request(uuid, uuid, uuid) from public;
grant execute on function public.accept_friend_request(uuid, uuid, uuid) to authenticated;

drop policy if exists "Allow Insert" on public.friend_requests;
create policy "Allow Insert"
on public.friend_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists "Allow Participants Select"
on public.friend_requests;
create policy "Allow Participants Select"
on public.friend_requests
for select
to anon, authenticated
using (true);

drop policy if exists "Allow Receiver Update"
on public.friend_requests;
create policy "Allow Receiver Update"
on public.friend_requests
for update
to authenticated
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);

drop policy if exists "Allow Participant Delete" on public.friend_requests;
create policy "Allow Participant Delete"
on public.friend_requests
for delete
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
end
$$;
