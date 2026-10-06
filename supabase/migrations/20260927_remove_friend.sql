create or replace function public.remove_friend_relationship(friend_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if friend_user_id is null or friend_user_id = auth.uid() then
    raise exception 'Invalid friend ID';
  end if;

  delete from public.direct_messages
  where (sender_id = auth.uid() and receiver_id = friend_user_id)
     or (sender_id = friend_user_id and receiver_id = auth.uid());

  delete from public.friend_requests
  where (sender_id = auth.uid() and receiver_id = friend_user_id)
     or (sender_id = friend_user_id and receiver_id = auth.uid());
end;
$$;

revoke all on function public.remove_friend_relationship(uuid) from public;
grant execute on function public.remove_friend_relationship(uuid) to authenticated;

alter table public.friend_requests replica identity full;
alter table public.direct_messages replica identity full;

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