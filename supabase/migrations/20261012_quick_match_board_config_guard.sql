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
  v_board jsonb;
  v_game_id uuid;
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

  v_game_id := coalesce(v_lobby.game_id, gen_random_uuid());
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

  v_board := v_lobby.match_config -> 'board';
  if jsonb_typeof(v_board) is distinct from 'object' then
    v_board := jsonb_build_object(
      'id', 'b1',
      'name', 'Classic Board',
      'colors', jsonb_build_array('#176b52', '#e4b84f', '#d15b4d')
    );
  elsif nullif(btrim(v_board ->> 'id'), '') is null
    or nullif(btrim(v_board ->> 'name'), '') is null
    or jsonb_typeof(v_board -> 'colors') is distinct from 'array' then
    v_board := jsonb_build_object(
      'id', 'b1',
      'name', 'Classic Board',
      'colors', jsonb_build_array('#176b52', '#e4b84f', '#d15b4d')
    );
  elsif jsonb_array_length(v_board -> 'colors') < 3
    or nullif(btrim(v_board -> 'colors' ->> 0), '') is null
    or nullif(btrim(v_board -> 'colors' ->> 1), '') is null
    or nullif(btrim(v_board -> 'colors' ->> 2), '') is null then
    v_board := jsonb_build_object(
      'id', 'b1',
      'name', 'Classic Board',
      'colors', jsonb_build_array('#176b52', '#e4b84f', '#d15b4d')
    );
  else
    v_board := v_board || jsonb_build_object(
      'id', btrim(v_board ->> 'id'),
      'name', btrim(v_board ->> 'name')
    );
  end if;

  v_config := coalesce(v_lobby.match_config, '{}'::jsonb)
    || jsonb_build_object(
      'gameId', v_game_id,
      'lobbyId', v_lobby.id,
      'hostId', v_lobby.host_id,
      'board', v_board,
      'players', coalesce(v_players, '[]'::jsonb)
    );

  if v_count >= 4 or (v_count between 2 and 3 and v_expired) then
    update public.game_lobbies
    set status = 'in_progress', game_id = v_game_id, match_config = v_config
    where id = v_lobby.id
    returning * into v_lobby;

    update public.quick_match_queue
    set status = 'matched', match_config = v_config, game_id = v_game_id
    where lobby_id = v_lobby.id;

    return jsonb_build_object(
      'status', 'matched',
      'match_config', v_config,
      'lobby_created_at', v_lobby.created_at
    );
  end if;

  if v_count = 1 and v_expired then
    update public.game_lobbies
    set status = 'waiting', game_id = v_game_id, created_at = now(), match_config = v_config
    where id = v_lobby.id
    returning * into v_lobby;
  else
    update public.game_lobbies
    set status = 'waiting', game_id = v_game_id, match_config = v_config
    where id = v_lobby.id
    returning * into v_lobby;
  end if;

  update public.quick_match_queue
  set status = 'waiting', match_config = v_config, game_id = v_game_id
  where lobby_id = v_lobby.id;

  return jsonb_build_object(
    'status', 'waiting',
    'match_config', v_config,
    'lobby_created_at', v_lobby.created_at
  );
end;
$$;

revoke all on function public.start_quick_match() from public;
grant execute on function public.start_quick_match() to authenticated;

notify pgrst, 'reload schema';

commit;
