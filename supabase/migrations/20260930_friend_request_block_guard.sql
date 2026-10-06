create or replace function public.are_profiles_blocked(first_user_id uuid, second_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_blocks
    where auth.uid() = first_user_id
      and (
        (blocker_id = first_user_id and blocked_id = second_user_id)
        or (blocker_id = second_user_id and blocked_id = first_user_id)
      )
  );
$$;

revoke all on function public.are_profiles_blocked(uuid, uuid) from public;
grant execute on function public.are_profiles_blocked(uuid, uuid) to authenticated;

drop policy if exists "Allow Insert" on public.friend_requests;
create policy "Allow Insert"
on public.friend_requests
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and not public.are_profiles_blocked(sender_id, receiver_id)
);