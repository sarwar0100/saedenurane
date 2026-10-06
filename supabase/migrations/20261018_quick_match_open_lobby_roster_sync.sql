begin;

-- Participants can read every queue row in their lobby; queue rows remain private
-- to unrelated users. Full delete payloads let the lobby client refresh on leave.
drop policy if exists quick_match_queue_read_self on public.quick_match_queue;
drop policy if exists quick_match_queue_read_lobby_participants on public.quick_match_queue;
create policy quick_match_queue_read_lobby_participants
on public.quick_match_queue for select to authenticated
using (
  user_id = auth.uid()
  or public.is_game_lobby_participant(lobby_id, auth.uid())
);
grant select on public.quick_match_queue to authenticated;
alter table public.quick_match_queue replica identity full;

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

  if found then
    select * into v_lobby
    from public.game_lobbies as lobby
    where lobby.id = v_self.lobby_id
    for update;

    if found
      and v_self.status = 'waiting'
      and v_lobby.status = 'waiting'
      and (select count(*) from public.lobby_players as member where member.lobby_id = v_lobby.id) < 4 then
      v_game_id := coalesce(v_lobby.game_id, gen_random_uuid());
      v_board := public.quick_match_normalize_board(v_lobby.match_config -> 'board');

      update public.quick_match_queue
      set requested_board = v_board,
          requested_token_url = $2
      where user_id = v_user_id;

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
      set game_id = v_game_id,
          match_config = v_config
      where id = v_lobby.id
        and status = 'waiting';

      update public.quick_match_queue
      set status = 'waiting',
          game_id = v_game_id,
          match_config = v_config
      where lobby_id = v_lobby.id;

      return jsonb_build_object(
        'status', 'waiting',
        'match_config', v_config,
        'lobby_created_at', v_lobby.created_at
      );
    end if;

    -- A matched or closed queue row is never reused for a new search.
    delete from public.quick_match_queue
    where user_id = v_user_id;
  end if;

  -- Only waiting, non-full rooms are eligible. A one-player room can wait
  -- indefinitely; the timer begins when the second membership is inserted.
  select lobby.* into v_lobby
  from public.game_lobbies as lobby
  where lobby.status = 'waiting'
    and lobby.match_config ->> 'mode' = 'quick'
    and (select count(*) from public.lobby_players as member where member.lobby_id = lobby.id) < 4
    and (
      (select count(*) from public.lobby_players as member where member.lobby_id = lobby.id) < 2
      or lobby.created_at > now() - interval '15 seconds'
    )
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
      v_user_id,
      4,
      'waiting',
      v_game_id,
      jsonb_build_object(
        'mode', 'quick',
        'gameId', v_game_id,
        'hostId', v_user_id,
        'board', v_board,
        'players', '[]'::jsonb
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
      'gameId', v_game_id,
      'lobbyId', v_lobby.id,
      'hostId', v_lobby.host_id,
      'board', v_board,
      'players', coalesce(v_players, '[]'::jsonb)
    );

  update public.game_lobbies
  set game_id = v_game_id,
      status = 'waiting',
      match_config = v_config,
      created_at = case when v_count = 2 then now() else created_at end
  where id = v_lobby.id
    and status = 'waiting'
  returning * into v_lobby;

  insert into public.quick_match_queue (
    user_id, requested_board, requested_token_url, status,
    lobby_id, game_id, match_config
  ) values (
    v_user_id, v_board, $2, 'waiting',
    v_lobby.id, v_game_id, v_config
  ) on conflict (user_id) do update
    set status = 'waiting',
        lobby_id = excluded.lobby_id,
        game_id = excluded.game_id,
        match_config = excluded.match_config,
        requested_board = excluded.requested_board,
        requested_token_url = excluded.requested_token_url;

  update public.quick_match_queue
  set status = 'waiting',
      game_id = v_game_id,
      match_config = v_config
  where lobby_id = v_lobby.id;

  return jsonb_build_object(
    'status', 'waiting',
    'match_config', v_config,
    'lobby_created_at', v_lobby.created_at
  );
end;
$$;

revoke all on function public.find_or_create_quick_match(jsonb, text) from public;
grant execute on function public.find_or_create_quick_match(jsonb, text) to authenticated;

notify pgrst, 'reload schema';
commit;
