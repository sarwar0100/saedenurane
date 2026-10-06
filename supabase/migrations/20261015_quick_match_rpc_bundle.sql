begin;

alter table public.quick_match_queue
  drop constraint if exists quick_match_queue_match_state_check;

-- Repair any legacy queue rows before reinstating the queue-state constraint.
update public.game_lobbies as lobby
set game_id = coalesce(lobby.game_id, gen_random_uuid()),
    match_config = coalesce(lobby.match_config, '{}'::jsonb)
where lobby.status in ('waiting', 'in_progress')
  and exists (
    select 1 from public.quick_match_queue as queue
    where queue.lobby_id = lobby.id
  );

update public.quick_match_queue as queue
set status = case when lobby.status = 'in_progress' then 'matched' else 'waiting' end,
    game_id = lobby.game_id,
    match_config = coalesce(queue.match_config, lobby.match_config, '{}'::jsonb)
from public.game_lobbies as lobby
where queue.lobby_id = lobby.id
  and lobby.status in ('waiting', 'in_progress');

delete from public.quick_match_queue as queue
where queue.lobby_id is null
   or not exists (
     select 1 from public.game_lobbies as lobby
     where lobby.id = queue.lobby_id
       and lobby.status in ('waiting', 'in_progress')
   );

alter table public.quick_match_queue
  add constraint quick_match_queue_match_state_check
  check (
    status is not null
    and btrim(status) <> ''
    and status in ('waiting', 'matched')
    and lobby_id is not null
    and game_id is not null
    and match_config is not null
  );

create or replace function public.quick_match_normalize_board(p_board jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  v_board jsonb := p_board;
begin
  if jsonb_typeof(v_board) is distinct from 'object' then
    return jsonb_build_object(
      'id', 'b1', 'name', 'Classic Board',
      'colors', jsonb_build_array('#176b52', '#e4b84f', '#d15b4d')
    );
  end if;

  if nullif(btrim(v_board ->> 'id'), '') is null
    or nullif(btrim(v_board ->> 'name'), '') is null
    or jsonb_typeof(v_board -> 'colors') is distinct from 'array' then
    return jsonb_build_object(
      'id', 'b1', 'name', 'Classic Board',
      'colors', jsonb_build_array('#176b52', '#e4b84f', '#d15b4d')
    );
  end if;

  if jsonb_array_length(v_board -> 'colors') < 3
    or nullif(btrim(v_board -> 'colors' ->> 0), '') is null
    or nullif(btrim(v_board -> 'colors' ->> 1), '') is null
    or nullif(btrim(v_board -> 'colors' ->> 2), '') is null then
    return jsonb_build_object(
      'id', 'b1', 'name', 'Classic Board',
      'colors', jsonb_build_array('#176b52', '#e4b84f', '#d15b4d')
    );
  end if;

  return v_board || jsonb_build_object(
    'id', btrim(v_board ->> 'id'),
    'name', btrim(v_board ->> 'name')
  );
end;
$$;

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
  v_config jsonb;
  v_players jsonb;
  v_game_id uuid;
  v_count integer;
  v_status text;
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
    where profile.id = v_user_id
      and profile.online
      and profile.status = 'online'
  ) then
    raise exception 'Player is not available for matchmaking';
  end if;

  delete from public.quick_match_queue as queue
  where queue.status = 'waiting'
    and queue.updated_at < now() - interval '15 minutes';

  delete from public.game_lobbies as lobby
  where lobby.status = 'waiting'
    and lobby.match_config ->> 'mode' = 'quick'
    and lobby.created_at < now() - interval '15 minutes'
    and not exists (
      select 1 from public.quick_match_queue as queue
      where queue.lobby_id = lobby.id and queue.status = 'waiting'
    );

  select * into v_self
  from public.quick_match_queue as queue
  where queue.user_id = v_user_id
  for update;

  if found and v_self.status = 'matched' then
    return jsonb_build_object('status', 'matched', 'match_config', v_self.match_config);
  end if;

  if found and v_self.status = 'waiting' then
    select * into v_lobby
    from public.game_lobbies as lobby
    where lobby.id = v_self.lobby_id
    for update;

    if found and v_lobby.status = 'waiting' then
      v_game_id := coalesce(v_lobby.game_id, gen_random_uuid());
      v_board := public.quick_match_normalize_board(v_lobby.match_config -> 'board');

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
          'gameId', v_game_id,
          'lobbyId', v_lobby.id,
          'hostId', v_lobby.host_id,
          'board', v_board,
          'players', coalesce(v_players, '[]'::jsonb)
        );

      update public.game_lobbies
      set game_id = v_game_id, match_config = v_config
      where id = v_lobby.id;
      update public.quick_match_queue
      set requested_board = v_board,
          requested_token_url = $2
        where user_id = v_user_id;
        update public.quick_match_queue
        set status = 'waiting',
          game_id = v_game_id,
          match_config = v_config
      where lobby_id = v_lobby.id;

      return jsonb_build_object(
        'status', 'waiting', 'match_config', v_config,
        'lobby_created_at', v_lobby.created_at
      );
    end if;

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

  update public.game_lobbies
  set game_id = v_game_id
  where id = v_lobby.id;

  insert into public.lobby_players (lobby_id, user_id, token_url)
  values (v_lobby.id, v_user_id, $2)
  on conflict (lobby_id, user_id) do update
    set token_url = excluded.token_url;

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

  select count(*) into v_count
  from public.lobby_players as member
  where member.lobby_id = v_lobby.id;

  v_status := case when v_count >= 4 then 'matched' else 'waiting' end;
  v_config := coalesce(v_lobby.match_config, '{}'::jsonb)
    || jsonb_build_object(
      'gameId', v_game_id,
      'lobbyId', v_lobby.id,
      'hostId', v_lobby.host_id,
      'board', v_board,
      'players', coalesce(v_players, '[]'::jsonb)
    );

  update public.game_lobbies
  set status = case when v_status = 'matched' then 'in_progress' else 'waiting' end,
      game_id = v_game_id,
      match_config = v_config
  where id = v_lobby.id;

  insert into public.quick_match_queue (
    user_id, requested_board, requested_token_url, status,
    lobby_id, game_id, match_config
  ) values (
    v_user_id, v_board, $2, v_status,
    v_lobby.id, v_game_id, v_config
  ) on conflict (user_id) do update
    set status = excluded.status,
        lobby_id = excluded.lobby_id,
        game_id = excluded.game_id,
        match_config = excluded.match_config,
        requested_board = excluded.requested_board,
        requested_token_url = excluded.requested_token_url;

  update public.quick_match_queue
  set status = v_status, game_id = v_game_id, match_config = v_config
  where lobby_id = v_lobby.id;

  return jsonb_build_object(
    'status', v_status, 'match_config', v_config,
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
  if not found or v_lobby.status not in ('waiting', 'in_progress') then
    raise exception 'Quick-match room is no longer active';
  end if;

  v_game_id := coalesce(v_lobby.game_id, gen_random_uuid());
  v_board := public.quick_match_normalize_board(v_lobby.match_config -> 'board');
  v_expired := v_lobby.created_at <= now() - interval '15 seconds';

  if v_lobby.status = 'in_progress'
    and v_queue.status = 'matched'
    and v_expired then
    return jsonb_build_object(
      'status', 'matched',
      'match_config', v_lobby.match_config,
      'lobby_created_at', v_lobby.created_at
    );
  end if;

  select count(*) into v_count
  from public.lobby_players as member
  join public.profiles as profile on profile.id = member.user_id
  where member.lobby_id = v_lobby.id
    and profile.online and profile.status = 'online';

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
    and profile.online and profile.status = 'online';

  v_config := coalesce(v_lobby.match_config, '{}'::jsonb)
    || jsonb_build_object(
      'gameId', v_game_id, 'lobbyId', v_lobby.id,
      'hostId', v_lobby.host_id, 'board', v_board,
      'players', coalesce(v_players, '[]'::jsonb)
    );

  if v_count between 2 and 4 and v_expired then
    update public.game_lobbies
    set status = 'in_progress', game_id = v_game_id, match_config = v_config
    where id = v_lobby.id;
    update public.quick_match_queue
    set status = 'matched', game_id = v_game_id, match_config = v_config
    where lobby_id = v_lobby.id;
    return jsonb_build_object(
      'status', 'matched', 'match_config', v_config,
      'lobby_created_at', v_lobby.created_at
    );
  end if;

  if v_count = 1 and v_expired then
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
    'status', 'waiting', 'match_config', v_config,
    'lobby_created_at', v_lobby.created_at
  );
end;
$$;

create or replace function public.leave_quick_match(
  p_lobby_id uuid,
  p_player_id uuid
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
  v_game_id uuid;
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

  v_target_lobby_id := coalesce(p_lobby_id, v_queue.lobby_id);
  if found then
    delete from public.quick_match_queue
    where user_id = v_user_id
      and (p_lobby_id is null or lobby_id = p_lobby_id);
  end if;
  if v_target_lobby_id is null then return; end if;

  select * into v_lobby
  from public.game_lobbies as lobby
  where lobby.id = v_target_lobby_id
  for update;
  if not found then return; end if;

  delete from public.lobby_players
  where lobby_id = v_lobby.id and user_id = v_user_id;
  if v_lobby.status <> 'waiting' then return; end if;

  select count(*) into v_remaining
  from public.lobby_players where lobby_id = v_lobby.id;
  if v_remaining = 0 then
    delete from public.game_lobbies where id = v_lobby.id and status = 'waiting';
    delete from public.quick_match_queue where lobby_id = v_lobby.id;
    return;
  end if;

  select user_id into v_new_host
  from public.lobby_players
  where lobby_id = v_lobby.id
  order by joined_at, user_id limit 1;

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

  v_game_id := coalesce(v_lobby.game_id, gen_random_uuid());
  v_config := coalesce(v_lobby.match_config, '{}'::jsonb)
    || jsonb_build_object(
      'gameId', v_game_id, 'lobbyId', v_lobby.id,
      'hostId', v_new_host, 'players', coalesce(v_players, '[]'::jsonb)
    );

  update public.game_lobbies
  set host_id = v_new_host, game_id = v_game_id,
      status = 'waiting', match_config = v_config
  where id = v_lobby.id and status = 'waiting';

  update public.quick_match_queue
  set status = 'waiting', game_id = v_game_id, match_config = v_config
  where lobby_id = v_lobby.id and status in ('waiting', 'matched');
end;
$$;

drop function if exists public.leave_quick_match();

revoke all on function public.quick_match_normalize_board(jsonb) from public;
revoke all on function public.find_or_create_quick_match(jsonb, text) from public;
revoke all on function public.start_quick_match() from public;
revoke all on function public.leave_quick_match(uuid, uuid) from public;
grant execute on function public.find_or_create_quick_match(jsonb, text) to authenticated;
grant execute on function public.start_quick_match() to authenticated;
grant execute on function public.leave_quick_match(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
