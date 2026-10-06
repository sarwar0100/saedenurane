begin;

create or replace function public.sync_quick_match_countdown_from_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lobby_id uuid := case when tg_op = 'DELETE' then old.lobby_id else new.lobby_id end;
  v_active_count integer;
begin
  select count(*) into v_active_count
  from public.lobby_players m
  join public.profiles p on p.id = m.user_id
  where m.lobby_id = v_lobby_id
    and p.online is true
    and p.status = 'online';

  if v_active_count < 2 or (tg_op = 'INSERT' and v_active_count = 2) then
    update public.game_lobbies l
    set created_at = now()
    where l.id = v_lobby_id
      and l.status = 'waiting'
      and l.match_config ->> 'mode' = 'quick';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.sync_quick_match_countdown_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lobby record;
  v_active_count integer;
  v_was_active boolean := old.online is true and old.status = 'online';
  v_is_active boolean := new.online is true and new.status = 'online';
begin
  if v_was_active = v_is_active then return new; end if;

  for v_lobby in
    select l.id
    from public.game_lobbies l
    join public.lobby_players m on m.lobby_id = l.id
    where m.user_id = new.id
      and l.status = 'waiting'
      and l.match_config ->> 'mode' = 'quick'
  loop
    select count(*) into v_active_count
    from public.lobby_players m
    join public.profiles p on p.id = m.user_id
    where m.lobby_id = v_lobby.id
      and p.online is true
      and p.status = 'online';

    if v_active_count < 2 or (v_is_active and v_active_count = 2) then
      update public.game_lobbies
      set created_at = now()
      where id = v_lobby.id and status = 'waiting';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists quick_match_countdown_membership on public.lobby_players;
create trigger quick_match_countdown_membership
after insert or delete on public.lobby_players
for each row execute function public.sync_quick_match_countdown_from_membership();

drop trigger if exists quick_match_countdown_presence on public.profiles;
create trigger quick_match_countdown_presence
after update of online, status on public.profiles
for each row execute function public.sync_quick_match_countdown_from_profile();

revoke all on function public.sync_quick_match_countdown_from_membership() from public;
revoke all on function public.sync_quick_match_countdown_from_profile() from public;

notify pgrst, 'reload schema';
commit;
