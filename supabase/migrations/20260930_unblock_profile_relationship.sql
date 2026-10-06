create or replace function public.unblock_profile_relationship(friend_user_id uuid)
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

  delete from public.friend_requests
  where (sender_id = auth.uid() and receiver_id = friend_user_id)
     or (sender_id = friend_user_id and receiver_id = auth.uid());

  delete from public.profile_blocks
  where blocker_id = auth.uid()
    and blocked_id = friend_user_id;
end;
$$;

revoke all on function public.unblock_profile_relationship(uuid) from public;
grant execute on function public.unblock_profile_relationship(uuid) to authenticated;