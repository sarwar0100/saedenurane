drop policy if exists "Participants can read direct messages" on public.direct_messages;
create policy "Participants can read direct messages"
on public.direct_messages
for select
to authenticated
using (
  auth.uid() in (sender_id, receiver_id)
  and exists (
    select 1
    from public.friend_requests as friendship
    where friendship.status = 'accepted'
      and (
        (friendship.sender_id = direct_messages.sender_id and friendship.receiver_id = direct_messages.receiver_id)
        or (friendship.sender_id = direct_messages.receiver_id and friendship.receiver_id = direct_messages.sender_id)
      )
  )
  and not exists (
    select 1
    from public.profile_blocks as profile_block
    where (profile_block.blocker_id = direct_messages.sender_id and profile_block.blocked_id = direct_messages.receiver_id)
       or (profile_block.blocker_id = direct_messages.receiver_id and profile_block.blocked_id = direct_messages.sender_id)
  )
);

drop policy if exists "Users can send direct messages" on public.direct_messages;
create policy "Users can send direct messages"
on public.direct_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.friend_requests as friendship
    where friendship.status = 'accepted'
      and (
        (friendship.sender_id = direct_messages.sender_id and friendship.receiver_id = direct_messages.receiver_id)
        or (friendship.sender_id = direct_messages.receiver_id and friendship.receiver_id = direct_messages.sender_id)
      )
  )
  and not exists (
    select 1
    from public.profile_blocks as profile_block
     where (profile_block.blocker_id = direct_messages.sender_id and profile_block.blocked_id = direct_messages.receiver_id)
       or (profile_block.blocker_id = direct_messages.receiver_id and profile_block.blocked_id = direct_messages.sender_id)
  )
);

drop policy if exists "Participants can update direct messages" on public.direct_messages;
create policy "Participants can update direct messages"
on public.direct_messages
for update
to authenticated
using (
  auth.uid() in (sender_id, receiver_id)
  and exists (
    select 1
    from public.friend_requests as friendship
    where friendship.status = 'accepted'
      and (
        (friendship.sender_id = direct_messages.sender_id and friendship.receiver_id = direct_messages.receiver_id)
        or (friendship.sender_id = direct_messages.receiver_id and friendship.receiver_id = direct_messages.sender_id)
      )
  )
  and not exists (
    select 1
    from public.profile_blocks as profile_block
    where (profile_block.blocker_id = direct_messages.sender_id and profile_block.blocked_id = direct_messages.receiver_id)
       or (profile_block.blocker_id = direct_messages.receiver_id and profile_block.blocked_id = direct_messages.sender_id)
  )
)
with check (
  auth.uid() in (sender_id, receiver_id)
  and exists (
    select 1
    from public.friend_requests as friendship
    where friendship.status = 'accepted'
      and (
        (friendship.sender_id = direct_messages.sender_id and friendship.receiver_id = direct_messages.receiver_id)
        or (friendship.sender_id = direct_messages.receiver_id and friendship.receiver_id = direct_messages.sender_id)
      )
  )
  and not exists (
    select 1
    from public.profile_blocks as profile_block
     where (profile_block.blocker_id = direct_messages.sender_id and profile_block.blocked_id = direct_messages.receiver_id)
       or (profile_block.blocker_id = direct_messages.receiver_id and profile_block.blocked_id = direct_messages.sender_id)
  )
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['friend_requests', 'direct_messages'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;