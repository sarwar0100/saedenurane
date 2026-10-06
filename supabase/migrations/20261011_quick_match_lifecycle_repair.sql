begin;

create or replace function public.start_quick_match()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_queue public.quick_match_queue%rowtype;
  v_lobby public.game_lobbies%rowtype;
  v_players jsonb;
  v_config jsonb;
  v_count integer;
  v_expired boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(731942, 1);

  select * into v_queue
  from public.quick_match_queue as queue
  where queue.user_id = v_user_id
  for update;
  if not found then
    raise exception 'Player is not in the quick-match queue';
  end if;

  select * into v_lobby
  from public.game_lobbies as lobby
  where lobby.id = v_queue.lobby_id
  for update;
  if not found then
    raise exception 'Quick-match room no longer exists';
  end if;
  if v_lobby.status not in ('waiting', 'in_progress') then
    raise exception 'Quick-match room is no longer active';
  end if;

  v_expired := v_lobby.created_at <= now() - interval '15 seconds';

  select count(*) into v_count
  from public.lobby_players as member
  join public.profiles as profile on profile.id = member.user_id
  where member.lobby_id = v_lobby.id
    and profile.online
    and profile.status = 'online';

  select jsonb_agg(
    jsonb_build_object(
      'id', profile.id::text,
      'name', coalesce(profile.display_name, profile.username),
      'avatar', coalesce(profile.avatar_url, ''),
      'token_url', member.token_url
    ) order by member.joined_at, member.user_id
  ) into v_players
  from public.lobby_players as member
  join public.profiles as profile on profile.id = member.user_id
  where member.lobby_id = v_lobby.id
    and profile.online
    and profile.status = 'online';

  v_config := coalesce(v_lobby.match_config, '{}'::jsonb)
    || jsonb_build_object('players', coalesce(v_players, '[]'::jsonb));

  if v_count >= 4 or (v_count between 2 and 3 and v_expired) then
    update public.game_lobbies
    set status = 'in_progress', match_config = v_config
    where id = v_lobby.id
    returning * into v_lobby;

    update public.quick_match_queue
    set status = 'matched', match_config = v_config, game_id = v_lobby.game_id
    where lobby_id = v_lobby.id;

    return jsonb_build_object(
      'status', 'matched',
      'match_config', v_config,
      'lobby_created_at', v_lobby.created_at
    );
  end if;

  if v_count = 1 and v_expired then
    update public.game_lobbies
    set status = 'waiting', created_at = now(), match_config = v_config
    where id = v_lobby.id
    returning * into v_lobby;
  else
    update public.game_lobbies
    set status = 'waiting', match_config = v_config
    where id = v_lobby.id
    returning * into v_lobby;
  end if;

  update public.quick_match_queue
  set status = 'waiting', match_config = v_config, game_id = v_lobby.game_id
  where lobby_id = v_lobby.id;

  return jsonb_build_object(
    'status', 'waiting',
    'match_config', v_config,
    'lobby_created_at', v_lobby.created_at
  );
end;
$$;

create or replace function public.leave_quick_match()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_queue public.quick_match_queue%rowtype;
  v_lobby public.game_lobbies%rowtype;
  v_remaining integer;
  v_config jsonb;
  v_players jsonb;
  v_new_host uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(731942, 1);

  select * into v_queue
  from public.quick_match_queue as queue
  where queue.user_id = v_user_id
  for update;

  if not found then
    return;
  end if;

  delete from public.quick_match_queue where user_id = v_user_id;

  if v_queue.lobby_id is null then
    return;
  end if;

  select * into v_lobby
  from public.game_lobbies as lobby
  where lobby.id = v_queue.lobby_id
  for update;

  if not found or v_lobby.status <> 'waiting' then
    return;
  end if;

  delete from public.lobby_players
  where lobby_id = v_lobby.id and user_id = v_user_id;

  select count(*) into v_remaining
  from public.lobby_players
  where lobby_id = v_lobby.id;

  if v_remaining = 0 then
    delete from public.game_lobbies
    where id = v_lobby.id and status = 'waiting';
    delete from public.quick_match_queue where lobby_id = v_lobby.id;
    return;
  end if;

  select user_id into v_new_host
  from public.lobby_players
  where lobby_id = v_lobby.id
  order by joined_at, user_id
  limit 1;

  select jsonb_agg(
    jsonb_build_object(
      'id', profile.id::text,
      'name', coalesce(profile.display_name, profile.username),
      'avatar', coalesce(profile.avatar_url, ''),
      'token_url', member.token_url
    ) order by member.joined_at, member.user_id
  ) into v_players
  from public.lobby_players as member
  join public.profiles as profile on profile.id = member.user_id
  where member.lobby_id = v_lobby.id;

  v_config := coalesce(v_lobby.match_config, '{}'::jsonb)
    || jsonb_build_object(
      'hostId', v_new_host,
      'players', coalesce(v_players, '[]'::jsonb)
    );

  update public.game_lobbies
  set host_id = v_new_host, match_config = v_config
  where id = v_lobby.id and status = 'waiting';

  update public.quick_match_queue
  set match_config = v_config
  where lobby_id = v_lobby.id and status = 'waiting';
end;
$$;

revoke all on function public.start_quick_match() from public;
revoke all on function public.leave_quick_match() from public;
grant execute on function public.start_quick_match() to authenticated;
grant execute on function public.leave_quick_match() to authenticated;

notify pgrst, 'reload schema';

commit;