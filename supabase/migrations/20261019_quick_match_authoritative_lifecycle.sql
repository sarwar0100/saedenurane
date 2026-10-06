begin;

create or replace function public.find_or_create_quick_match(
  requested_board jsonb,
  requested_token_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_self public.quick_match_queue%rowtype;
  v_lobby public.game_lobbies%rowtype;
  v_board jsonb;
  v_players jsonb;
  v_config jsonb;
  v_game_id uuid;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if $2 is not null and char_length($2) > 2048 then
    raise exception 'Token URL is too long';
  end if;

  v_board := public.quick_match_normalize_board($1);
  perform pg_advisory_xact_lock(731942, 1);

  if not exists (
    select 1 from public.profiles as profile
    where profile.id = v_user_id and profile.online and profile.status = 'online'
  ) then
    raise exception 'Player is not available for matchmaking';
  end if;

  delete from public.quick_match_queue as queue
  where queue.status = 'waiting'
    and queue.updated_at < now() - interval '15 minutes';

  select * into v_self
  from public.quick_match_queue as queue
  where queue.user_id = v_user_id
  for update;

  if found and v_self.status = 'waiting' then
    select * into v_lobby
    from public.game_lobbies as lobby
    where lobby.id = v_self.lobby_id
    for update;

    if found and v_lobby.status = 'waiting' then
      insert into public.lobby_players (lobby_id, user_id, token_url)
      values (v_lobby.id, v_user_id, $2)
      on conflict (lobby_id, user_id) do update
        set token_url = excluded.token_url;

      v_board := public.quick_match_normalize_board(v_lobby.match_config -> 'board');
      v_game_id := coalesce(v_lobby.game_id, gen_random_uuid());
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
          'gameId', v_game_id, 'lobbyId', v_lobby.id,
          'hostId', v_lobby.host_id, 'board', v_board,
          'players', coalesce(v_players, '[]'::jsonb)
        );
      update public.game_lobbies
      set game_id = v_game_id, match_config = v_config
      where id = v_lobby.id and status = 'waiting';
      update public.quick_match_queue
      set requested_board = v_board, requested_token_url = $2,
          status = 'waiting', game_id = v_game_id, match_config = v_config
      where lobby_id = v_lobby.id;

      return jsonb_build_object(
        'status', 'waiting', 'match_config', v_config,
        'lobby_created_at', v_lobby.created_at
      );
    end if;
  end if;

  if found then
    delete from public.quick_match_queue where user_id = v_user_id;
  end if;

  select lobby.* into v_lobby
  from public.game_lobbies as lobby
  where lobby.status = 'waiting'
    and lobby.match_config ->> 'mode' = 'quick'
    and (select count(*) from public.lobby_players as member where member.lobby_id = lobby.id) < 4
    and not exists (
      select 1
      from public.lobby_players as member
      join public.profile_blocks as block
        on (block.blocker_id = v_user_id and block.blocked_id = member.user_id)
        or (block.blocker_id = member.user_id and block.blocked_id = v_user_id)
      where member.lobby_id = lobby.id
    )
  order by lobby.created_at, lobby.id
  limit 1
  for update skip locked;

  if not found then
    v_game_id := gen_random_uuid();
    insert into public.game_lobbies (
      host_id, max_players, status, game_id, match_config
    ) values (
      v_user_id, 4, 'waiting', v_game_id,
      jsonb_build_object(
        'mode', 'quick', 'gameId', v_game_id,
        'hostId', v_user_id, 'board', v_board, 'players', '[]'::jsonb
      )
    ) returning * into v_lobby;
  end if;

  v_game_id := coalesce(v_lobby.game_id, gen_random_uuid());
  v_board := public.quick_match_normalize_board(v_lobby.match_config -> 'board');
  insert into public.lobby_players (lobby_id, user_id, token_url)
  values (v_lobby.id, v_user_id, $2)
  on conflict (lobby_id, user_id) do update
    set token_url = excluded.token_url;

  select count(*) into v_count
  from public.lobby_players as member where member.lobby_id = v_lobby.id;
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
      'gameId', v_game_id, 'lobbyId', v_lobby.id,
      'hostId', v_lobby.host_id, 'board', v_board,
      'players', coalesce(v_players, '[]'::jsonb)
    );
  update public.game_lobbies
  set game_id = v_game_id, status = 'waiting', match_config = v_config,
      created_at = case when v_count = 2 then now() else created_at end
  where id = v_lobby.id and status = 'waiting'
  returning * into v_lobby;

  insert into public.quick_match_queue (
    user_id, requested_board, requested_token_url, status,
    lobby_id, game_id, match_config
  ) values (
    v_user_id, v_board, $2, 'waiting', v_lobby.id, v_game_id, v_config
  ) on conflict (user_id) do update
    set status = 'waiting', lobby_id = excluded.lobby_id,
        game_id = excluded.game_id, match_config = excluded.match_config,
        requested_board = excluded.requested_board,
        requested_token_url = excluded.requested_token_url;

  update public.quick_match_queue
  set status = 'waiting', game_id = v_game_id, match_config = v_config
  where lobby_id = v_lobby.id;

  return jsonb_build_object(
    'status', 'waiting', 'match_config', v_config,
    'lobby_created_at', v_lobby.created_at
  );
end;
$$;

create or replace function public.rejoin_quick_match()
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
  v_already_seated boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(731942, 1);

  select * into v_queue
  from public.quick_match_queue as queue
  where queue.user_id = v_user_id and queue.status = 'waiting'
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_lobby
  from public.game_lobbies as lobby
  where lobby.id = v_queue.lobby_id
  for update;
  if not found or v_lobby.status <> 'waiting' then
    return jsonb_build_object('status', 'closed');
  end if;

  select exists (
    select 1 from public.lobby_players as member
    where member.lobby_id = v_lobby.id and member.user_id = v_user_id
  ) into v_already_seated;

  select count(*) into v_count
  from public.lobby_players as member
  where member.lobby_id = v_lobby.id;
  if not v_already_seated and v_count >= 4 then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.lobby_players (lobby_id, user_id, token_url)
  values (v_lobby.id, v_user_id, v_queue.requested_token_url)
  on conflict (lobby_id, user_id) do update
    set token_url = excluded.token_url;

  select count(*) into v_count
  from public.lobby_players as member
  where member.lobby_id = v_lobby.id;

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
      'gameId', v_lobby.game_id,
      'lobbyId', v_lobby.id,
      'hostId', v_lobby.host_id,
      'players', coalesce(v_players, '[]'::jsonb)
    );

  update public.game_lobbies
  set match_config = v_config,
      created_at = case when v_count = 2 and not v_already_seated then now() else created_at end
  where id = v_lobby.id and status = 'waiting'
  returning * into v_lobby;

  update public.quick_match_queue
  set status = 'waiting', game_id = v_lobby.game_id, match_config = v_config
  where lobby_id = v_lobby.id and status = 'waiting';

  return jsonb_build_object(
    'status', 'waiting',
    'match_config', v_config,
    'lobby_created_at', v_lobby.created_at
  );
end;
$$;

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

  if v_lobby.status in ('matched', 'in_progress') then
    return jsonb_build_object(
      'status', 'matched',
      'match_config', v_lobby.match_config,
      'lobby_created_at', v_lobby.created_at
    );
  end if;
  if v_lobby.status <> 'waiting' then
    raise exception 'Quick-match room is no longer waiting';
  end if;

  v_expired := v_lobby.created_at <= now() - interval '15 seconds';
  v_board := public.quick_match_normalize_board(v_lobby.match_config -> 'board');
  v_game_id := coalesce(v_lobby.game_id, gen_random_uuid());

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
    || jsonb_build_object(
      'gameId', v_game_id,
      'lobbyId', v_lobby.id,
      'hostId', v_lobby.host_id,
      'board', v_board,
      'players', coalesce(v_players, '[]'::jsonb)
    );

  if v_count between 2 and 4 and v_expired then
    v_game_id := gen_random_uuid();
    v_config := v_config || jsonb_build_object('gameId', v_game_id);

    update public.game_lobbies
    set status = 'in_progress', game_id = v_game_id, match_config = v_config
    where id = v_lobby.id and status = 'waiting';

    update public.quick_match_queue
    set status = 'matched', game_id = v_game_id, match_config = v_config
    where lobby_id = v_lobby.id;

    return jsonb_build_object(
      'status', 'matched',
      'match_config', v_config,
      'lobby_created_at', v_lobby.created_at
    );
  end if;

  if v_count < 2 and v_expired then
    update public.game_lobbies
    set status = 'waiting', game_id = v_game_id,
        created_at = now(), match_config = v_config
    where id = v_lobby.id
    returning * into v_lobby;
  else
    update public.game_lobbies
    set status = 'waiting', game_id = v_game_id, match_config = v_config
    where id = v_lobby.id
    returning * into v_lobby;
  end if;

  update public.quick_match_queue
  set status = 'waiting', game_id = v_game_id, match_config = v_config
  where lobby_id = v_lobby.id;

  return jsonb_build_object(
    'status', 'waiting',
    'match_config', v_config,
    'lobby_created_at', v_lobby.created_at
  );
end;
$$;

drop function if exists public.leave_quick_match(uuid, uuid);
drop function if exists public.leave_quick_match(uuid, uuid, boolean);

create function public.leave_quick_match(
  p_lobby_id uuid,
  p_player_id uuid,
  p_keep_room boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_queue public.quick_match_queue%rowtype;
  v_lobby public.game_lobbies%rowtype;
  v_target_lobby_id uuid;
  v_has_queue boolean;
  v_remaining integer;
  v_new_host uuid;
  v_players jsonb;
  v_config jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_player_id is distinct from v_user_id then
    raise exception 'A player can only leave their own quick-match seat';
  end if;

  perform pg_advisory_xact_lock(731942, 1);

  select * into v_queue
  from public.quick_match_queue as queue
  where queue.user_id = v_user_id
    and (p_lobby_id is null or queue.lobby_id = p_lobby_id)
  for update;
  v_has_queue := found;
  v_target_lobby_id := coalesce(p_lobby_id, v_queue.lobby_id);

  if v_target_lobby_id is null then
    if v_has_queue and not p_keep_room then
      delete from public.quick_match_queue where user_id = v_user_id;
    end if;
    return;
  end if;

  select * into v_lobby
  from public.game_lobbies as lobby
  where lobby.id = v_target_lobby_id
  for update;
  if not found then
    delete from public.quick_match_queue
    where user_id = v_user_id and lobby_id = v_target_lobby_id;
    return;
  end if;

  if v_lobby.status <> 'waiting' then
    delete from public.quick_match_queue
    where user_id = v_user_id and lobby_id = v_target_lobby_id;
    return;
  end if;

  delete from public.lobby_players
  where lobby_id = v_lobby.id and user_id = v_user_id;

  select count(*) into v_remaining
  from public.lobby_players
  where lobby_id = v_lobby.id;
  if v_remaining = 0 then
    delete from public.game_lobbies where id = v_lobby.id and status = 'waiting';
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
      'gameId', coalesce(v_lobby.game_id, gen_random_uuid()),
      'lobbyId', v_lobby.id,
      'hostId', v_new_host,
      'players', coalesce(v_players, '[]'::jsonb)
    );

  update public.game_lobbies
  set host_id = v_new_host,
      status = 'waiting',
      match_config = v_config,
      created_at = case when v_remaining = 1 then now() else created_at end
  where id = v_lobby.id and status = 'waiting'
  returning * into v_lobby;

  update public.quick_match_queue
  set status = 'waiting', game_id = v_lobby.game_id, match_config = v_config
  where lobby_id = v_lobby.id and status in ('waiting', 'matched');

  if not p_keep_room then
    delete from public.quick_match_queue
    where user_id = v_user_id and lobby_id = v_lobby.id;
  end if;
end;
$$;

revoke all on function public.rejoin_quick_match() from public;
revoke all on function public.find_or_create_quick_match(jsonb, text) from public;
revoke all on function public.start_quick_match() from public;
revoke all on function public.leave_quick_match(uuid, uuid, boolean) from public;
grant execute on function public.rejoin_quick_match() to authenticated;
grant execute on function public.find_or_create_quick_match(jsonb, text) to authenticated;
grant execute on function public.start_quick_match() to authenticated;
grant execute on function public.leave_quick_match(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;