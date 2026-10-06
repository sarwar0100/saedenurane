drop function if exists public.unblock_profile_relationship(uuid);

create or replace function public.unblock_profile_relationship(
  p_user_id uuid,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user does not match p_user_id';
  end if;

  if p_target_id is null or p_target_id = p_user_id then
    raise exception 'Invalid target user';
  end if;

  delete from public.friend_requests
  where (sender_id = p_user_id and receiver_id = p_target_id)
     or (sender_id = p_target_id and receiver_id = p_user_id);

  delete from public.profile_blocks
  where blocker_id = p_user_id
    and blocked_id = p_target_id;
end;
$$;

revoke all on function public.unblock_profile_relationship(uuid, uuid) from public;
grant execute on function public.unblock_profile_relationship(uuid, uuid) to authenticated;