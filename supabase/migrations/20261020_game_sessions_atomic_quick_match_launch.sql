begin;

alter table public.game_lobbies
  drop constraint if exists game_lobbies_status_check;

alter table public.game_lobbies
  add constraint game_lobbies_status_check
  check (status in ('waiting', 'matched', 'in_progress', 'finished', 'disbanded'));

create table if not exists public.game_sessions (
  game_id uuid primary key,
  lobby_id uuid not null references public.game_lobbies(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  launch_reason text not null check (launch_reason in ('full', 'timer', 'host')),
  board jsonb not null,
  players jsonb not null check (jsonb_typeof(players) = 'array'),
  turn_index smallint not null default 0 check (turn_index between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_sessions_lobby_id_unique unique (lobby_id)
);

alter table public.game_sessions enable row level security;
drop policy if exists game_sessions_read_lobby_participants on public.game_sessions;
create policy game_sessions_read_lobby_participants
on public.game_sessions for select to authenticated
using (public.is_game_lobby_participant(lobby_id, auth.uid()));
grant select on public.game_sessions to authenticated;
alter table public.game_sessions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'game_sessions'
    ) then
    alter publication supabase_realtime add table public.game_sessions;
  end if;
end
$$;

create or replace function public.launch_quick_match()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_queue public.quick_match_queue%rowtype;
  v_lobby public.game_lobbies%rowtype;
  v_session public.game_sessions%rowtype;
  v_players jsonb;
  v_config jsonb;
  v_board jsonb;
  v_game_id uuid;
  v_active_count integer;
  v_seat_count integer;
  v_expired boolean;
  v_has_session boolean;
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
    select * into v_session
    from public.game_sessions as session
    where session.game_id = v_lobby.game_id;
    v_has_session := found;

    return jsonb_build_object(
      'status', 'matched',
      'game_id', v_lobby.game_id,
      'match_config', coalesce(v_lobby.match_config, '{}'::jsonb),
      'game_session', case when v_has_session then to_jsonb(v_session) else null end,
      'lobby_created_at', v_lobby.created_at
    );
  end if;
  if v_lobby.status <> 'waiting' then
    raise exception 'Quick-match room is no longer waiting';
  end if;

  v_expired := v_lobby.created_at <= now() - interval '15 seconds';

  select count(*) into v_seat_count
  from public.lobby_players as member
  where member.lobby_id = v_lobby.id;
  if v_seat_count < 2 or v_seat_count > 4 then
    return jsonb_build_object(
      'status', 'waiting',
      'match_config', v_lobby.match_config,
      'lobby_created_at', v_lobby.created_at
    );
  end if;

  select count(*) into v_active_count
  from public.lobby_players as member
  join public.profiles as profile on profile.id = member.user_id
  where member.lobby_id = v_lobby.id
    and profile.online is true
    and profile.status = 'online';

  if not (v_seat_count = 4 or (v_expired and v_active_count >= 2)) then
    return jsonb_build_object(
      'status', 'waiting',
      'match_config', v_lobby.match_config,
      'lobby_created_at', v_lobby.created_at
    );
  end if;

  if v_active_count < 2 then
    return jsonb_build_object(
      'status', 'waiting',
      'match_config', v_lobby.match_config,
      'lobby_created_at', v_lobby.created_at
    );
  end if;

  v_game_id := gen_random_uuid();
  v_board := public.quick_match_normalize_board(v_lobby.match_config -> 'board');

  select jsonb_agg(
    jsonb_build_object(
      'id', profile.id::text,
      'name', coalesce(profile.display_name, profile.username),
      'avatar', coalesce(profile.avatar_url, ''),
      'token_url', member.token_url,
      'score', coalesce(profile.points, 0),
      'position', 0,
      'connected', profile.online is true and profile.status = 'online'
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

  insert into public.game_sessions (
    game_id, lobby_id, status, launch_reason, board, players, turn_index
  ) values (
    v_game_id,
    v_lobby.id,
    'in_progress',
    case when v_seat_count = 4 then 'full' else 'timer' end,
    v_board,
    coalesce(v_players, '[]'::jsonb),
    0
  );

  update public.game_lobbies
  set status = 'matched',
      game_id = v_game_id,
      match_config = v_config
  where id = v_lobby.id and status = 'waiting';

  update public.quick_match_queue
  set status = 'matched',
      game_id = v_game_id,
      match_config = v_config
  where lobby_id = v_lobby.id;

  select * into v_session
  from public.game_sessions as session
  where session.game_id = v_game_id;

  return jsonb_build_object(
    'status', 'matched',
    'game_id', v_game_id,
    'match_config', v_config,
    'game_session', to_jsonb(v_session),
    'lobby_created_at', v_lobby.created_at
  );
end;
$$;

create or replace function public.launch_friend_lobby(
  p_lobby_id uuid,
  p_board jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby public.game_lobbies%rowtype;
  v_game_id uuid;
  v_players jsonb;
  v_config jsonb;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_lobby
  from public.game_lobbies as lobby
  where lobby.id = p_lobby_id
    and lobby.host_id = v_user_id
    and lobby.status = 'waiting'
  for update;
  if not found then
    raise exception 'Lobby is not available for launch';
  end if;

  select count(*) into v_count
  from public.lobby_players as member
  where member.lobby_id = v_lobby.id;
  if v_count < 2 or v_count > v_lobby.max_players then
    raise exception 'Lobby needs between two and its capacity players';
  end if;

  v_game_id := gen_random_uuid();
  select jsonb_agg(
    jsonb_build_object(
      'id', profile.id::text,
      'name', coalesce(profile.display_name, profile.username),
      'avatar', coalesce(profile.avatar_url, ''),
      'token_url', member.token_url,
      'score', coalesce(profile.points, 0),
      'position', 0,
      'connected', profile.online is true and profile.status in ('online', 'in_game')
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
      'board', public.quick_match_normalize_board(p_board),
      'players', coalesce(v_players, '[]'::jsonb)
    );

  insert into public.game_sessions (
    game_id, lobby_id, status, launch_reason, board, players, turn_index
  ) values (
    v_game_id, v_lobby.id, 'in_progress', 'host',
    public.quick_match_normalize_board(p_board), coalesce(v_players, '[]'::jsonb), 0
  );

  update public.game_lobbies
  set status = 'in_progress', game_id = v_game_id, match_config = v_config
  where id = v_lobby.id and status = 'waiting';

  return jsonb_build_object(
    'status', 'matched',
    'game_id', v_game_id,
    'match_config', v_config
  );
end;
$$;

create or replace function public.start_quick_match()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.launch_quick_match();
$$;

revoke all on function public.launch_quick_match() from public;
revoke all on function public.launch_friend_lobby(uuid, jsonb) from public;
revoke all on function public.start_quick_match() from public;
grant execute on function public.launch_quick_match() to authenticated;
grant execute on function public.launch_friend_lobby(uuid, jsonb) to authenticated;
grant execute on function public.start_quick_match() to authenticated;

notify pgrst, 'reload schema';
commit;