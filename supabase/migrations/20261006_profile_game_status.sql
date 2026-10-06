begin;

alter table public.profiles
  add column if not exists status text not null default 'online';

alter table public.profiles
  drop constraint if exists profiles_status_check;

update public.profiles
set status = 'online'
where status is null
   or status not in ('online', 'in_game');

alter table public.profiles
  alter column status set default 'online',
  alter column status set not null;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('online', 'in_game'));

create or replace function public.set_profile_game_status(new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if new_status not in ('online', 'in_game') then
    raise exception 'Unsupported profile game status';
  end if;

  update public.profiles
  set status = new_status
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.set_profile_game_status(text) from public;
grant execute on function public.set_profile_game_status(text) to authenticated;

notify pgrst, 'reload schema';

commit;
