begin;

-- Quick-match queue rows track each searching player and the latest shared roster.
-- Clear legacy waiting rows from the previous pair-only queue format; active
-- matched rows and their in-progress games are left untouched.
delete from public.quick_match_queue
where status = 'waiting';

alter table public.quick_match_queue
  drop constraint if exists quick_match_queue_match_state_check;

alter table public.quick_match_queue
  add constraint quick_match_queue_match_state_check
  check (
    (status = 'waiting' and lobby_id is not null and game_id is not null and match_config is not null)
    or
    (status = 'matched' and lobby_id is not null and game_id is not null and match_config is not null)
  );

create index if not exists game_lobbies_waiting_quick_match_idx
  on public.game_lobbies (created_at, id)
  where status = 'waiting';

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
  v_config jsonb;
  v_players jsonb;
  v_game_id uuid;
  v_lobby_id uuid;
  v_count integer;
  v_status text;
  v_requested_board jsonb := requested_board;
  v_requested_token_url text := requested_token_url;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_requested_board is null or jsonb_typeof(v_requested_board) <> 'object' then
    raise exception 'A board configuration is required';
  end if;
  if v_requested_token_url is not null and char_length(v_requested_token_url) > 2048 then
    raise exception 'Token URL is too long';
  end if;

  -- One transaction at a time forms a queue room, preventing double-seating.
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
      update public.quick_match_queue
        set requested_board = v_requested_board,
            requested_token_url = v_requested_token_url
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
        || jsonb_build_object('players', coalesce(v_players, '[]'::jsonb));
      update public.game_lobbies set match_config = v_config where id = v_lobby.id;
      update public.quick_match_queue
      set match_config = v_config, game_id = v_lobby.game_id
      where lobby_id = v_lobby.id and status = 'waiting';

      return jsonb_build_object('status', 'waiting', 'match_config', v_config);
    end if;

    delete from public.quick_match_queue where user_id = v_user_id;
  end if;

  -- Find the oldest active random-match room with a free seat.
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
    v_lobby_id := gen_random_uuid();
    insert into public.game_lobbies (
      id, host_id, max_players, status, game_id, match_config
    ) values (
      v_lobby_id,
      v_user_id,
      4,
      'waiting',
      v_game_id,
      jsonb_build_object(
        'mode', 'quick',
        'gameId', v_game_id,
        'lobbyId', v_lobby_id,
        'hostId', v_user_id,
        'board', v_requested_board,
        'players', '[]'::jsonb
      )
    ) returning * into v_lobby;
  else
    v_lobby_id := v_lobby.id;
    v_game_id := v_lobby.game_id;
  end if;

  insert into public.lobby_players (lobby_id, user_id, token_url)
  values (v_lobby.id, v_user_id, v_requested_token_url)
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

  v_config := coalesce(v_lobby.match_config, '{}'::jsonb)
    || jsonb_build_object('players', coalesce(v_players, '[]'::jsonb));

  if v_count >= 4 then
    v_status := 'matched';
    update public.game_lobbies
    set status = 'in_progress', match_config = v_config
    where id = v_lobby.id;
  else
    v_status := 'waiting';
    update public.game_lobbies
    set match_config = v_config
    where id = v_lobby.id;
  end if;

  insert into public.quick_match_queue (
    user_id, requested_board, requested_token_url, status,
    lobby_id, game_id, match_config
  ) values (
    v_user_id, v_requested_board, v_requested_token_url, v_status,
    v_lobby.id, v_lobby.game_id, v_config
  ) on conflict (user_id) do update
    set status = excluded.status,
        lobby_id = excluded.lobby_id,
        game_id = excluded.game_id,
        match_config = excluded.match_config,
        requested_board = excluded.requested_board,
        requested_token_url = excluded.requested_token_url;

  update public.quick_match_queue
  set status = v_status, match_config = v_config, game_id = v_lobby.game_id
  where lobby_id = v_lobby.id;

  return jsonb_build_object('status', v_status, 'match_config', v_config);
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
  v_count integer;
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

  if v_queue.status = 'matched' then
    return jsonb_build_object('status', 'matched', 'match_config', v_queue.match_config);
  end if;

  select * into v_lobby
  from public.game_lobbies as lobby
  where lobby.id = v_queue.lobby_id
  for update;
  if not found or v_lobby.status <> 'waiting' then
    raise exception 'Quick-match room is no longer waiting';
  end if;

  select count(*) into v_count
  from public.lobby_players as member
  join public.profiles as profile on profile.id = member.user_id
  where member.lobby_id = v_lobby.id
    and profile.online
    and profile.status = 'online';

  if v_count < 2 then
    return jsonb_build_object('status', 'waiting', 'match_config', v_queue.match_config);
  end if;

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

  v_config := v_lobby.match_config
    || jsonb_build_object('players', coalesce(v_players, '[]'::jsonb));

  update public.game_lobbies
  set status = 'in_progress', match_config = v_config
  where id = v_lobby.id;

  update public.quick_match_queue
  set status = 'matched', match_config = v_config, game_id = v_lobby.game_id
  where lobby_id = v_lobby.id;

  return jsonb_build_object('status', 'matched', 'match_config', v_config);
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
  v_lobby_id uuid;
  v_remaining integer;
  v_config jsonb;
  v_players jsonb;
  v_new_host uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(731942, 1);

  select queue.lobby_id into v_lobby_id
  from public.quick_match_queue as queue
  where queue.user_id = v_user_id and queue.status = 'waiting'
  for update;

  if v_lobby_id is null then
    return;
  end if;

  delete from public.quick_match_queue where user_id = v_user_id;
  delete from public.lobby_players
  where lobby_id = v_lobby_id and user_id = v_user_id;

  select count(*) into v_remaining
  from public.lobby_players
  where lobby_id = v_lobby_id;

  if v_remaining = 0 then
    delete from public.game_lobbies
    where id = v_lobby_id and status = 'waiting';
    return;
  end if;

  select user_id into v_new_host
  from public.lobby_players
  where lobby_id = v_lobby_id
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
  where member.lobby_id = v_lobby_id;

  select match_config into v_config
  from public.game_lobbies
  where id = v_lobby_id
  for update;

  v_config := v_config || jsonb_build_object(
    'hostId', v_new_host,
    'players', coalesce(v_players, '[]'::jsonb)
  );

  update public.game_lobbies
  set host_id = v_new_host, match_config = v_config
  where id = v_lobby_id and status = 'waiting';

  update public.quick_match_queue
  set match_config = v_config
  where lobby_id = v_lobby_id and status = 'waiting';
end;
$$;

alter table public.quick_match_queue enable row level security;
drop policy if exists quick_match_queue_read_self on public.quick_match_queue;
create policy quick_match_queue_read_self
on public.quick_match_queue for select to authenticated
using (user_id = auth.uid());

grant select on public.quick_match_queue to authenticated;

revoke all on function public.find_or_create_quick_match(jsonb, text) from public;
revoke all on function public.start_quick_match() from public;
revoke all on function public.leave_quick_match() from public;
grant execute on function public.find_or_create_quick_match(jsonb, text) to authenticated;
grant execute on function public.start_quick_match() to authenticated;
grant execute on function public.leave_quick_match() to authenticated;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'quick_match_queue'
  ) then
    alter publication supabase_realtime add table public.quick_match_queue;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
