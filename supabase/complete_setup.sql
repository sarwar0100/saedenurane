-- Zagros Games Supabase database bootstrap
-- Run once in the Supabase SQL Editor on a fresh project.
-- Supabase-managed schemas auth, storage and publication supabase_realtime must exist.
-- User data is not exposed to anon; public catalog reads and public avatar reads are allowed.
-- To enable catalog administration, assign app_metadata.role = 'admin' to trusted accounts.

begin;

create schema if not exists public;
grant all on schema public to postgres, service_role;
grant usage on schema public to anon, authenticated;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  bio text not null default '',
  avatar_url text not null default '',
  birth_year text,
  age integer,
  city text,
  status text not null default 'online' check (status in ('online', 'in_game')),
  online boolean not null default true,
  hide_profile_details boolean not null default false,
  hide_following boolean not null default false,
  hide_city_age boolean not null default false,
  hide_online_status boolean not null default false,
  points integer not null default 0 check (points >= 0),
  gold integer not null default 75 check (gold >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  last_name_change_at timestamptz,
  last_username_change_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_nonempty check (length(btrim(username)) between 1 and 20),
  constraint profiles_bio_length check (char_length(bio) <= 30)
);
create unique index if not exists profiles_username_lower_uidx on public.profiles (lower(btrim(username)));
create unique index if not exists profiles_display_name_lower_uidx
  on public.profiles (lower(btrim(display_name))) where nullif(btrim(display_name), '') is not null;
create index if not exists profiles_leaderboard_idx on public.profiles (points desc, wins desc, id);

-- A single accepted row in either direction represents a friendship.
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_distinct_users check (sender_id <> receiver_id),
  constraint friend_requests_pair_unique unique (sender_id, receiver_id)
);
create index if not exists friend_requests_receiver_status_idx on public.friend_requests (receiver_id, status, created_at desc);
create index if not exists friend_requests_sender_status_idx on public.friend_requests (sender_id, status, updated_at desc);

create table if not exists public.profile_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_blocks_distinct_users check (blocker_id <> blocked_id),
  constraint profile_blocks_unique_pair unique (blocker_id, blocked_id)
);
create index if not exists profile_blocks_blocked_idx on public.profile_blocks (blocked_id, blocker_id);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  image_url text,
  read_at timestamptz,
  reaction text,
  reply_to_id uuid references public.direct_messages(id) on delete set null,
  reply_to_text text,
  reply_to_sender_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint direct_messages_distinct_participants check (sender_id <> receiver_id),
  constraint direct_messages_has_content check (length(trim(body)) > 0 or image_url is not null)
);
create index if not exists direct_messages_sender_receiver_created_idx on public.direct_messages (sender_id, receiver_id, created_at);
create index if not exists direct_messages_reply_idx on public.direct_messages (reply_to_id);

-- Friends lobbies and memberships.
create table if not exists public.game_lobbies (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  max_players smallint not null default 4 check (max_players between 2 and 4),
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'in_progress', 'finished', 'disbanded')),
  game_id uuid,
  match_config jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists game_lobbies_game_id_uidx on public.game_lobbies (game_id) where game_id is not null;
create index if not exists game_lobbies_waiting_idx on public.game_lobbies (created_at, id) where status = 'waiting';

create table if not exists public.lobby_players (
  lobby_id uuid not null references public.game_lobbies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_url text,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);
create index if not exists lobby_players_user_idx on public.lobby_players (user_id, joined_at);

create table if not exists public.game_invitations (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.game_lobbies(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_invitations_distinct_users check (sender_id <> receiver_id)
);
create index if not exists game_invitations_receiver_idx on public.game_invitations (receiver_id, status, created_at desc);
create index if not exists game_invitations_lobby_sender_idx on public.game_invitations (lobby_id, sender_id, updated_at desc);

create table if not exists public.quick_match_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  requested_board jsonb not null,
  requested_token_url text,
  status text not null check (status in ('waiting', 'matched')),
  lobby_id uuid not null references public.game_lobbies(id) on delete cascade,
  game_id uuid not null,
  match_config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_match_queue_token_length check (requested_token_url is null or char_length(requested_token_url) <= 2048)
);
create index if not exists quick_match_queue_lobby_idx on public.quick_match_queue (lobby_id, status, created_at);

create table if not exists public.game_sessions (
  game_id uuid primary key,
  lobby_id uuid not null unique references public.game_lobbies(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  launch_reason text not null check (launch_reason in ('full', 'timer', 'host')),
  board jsonb not null,
  players jsonb not null check (jsonb_typeof(players) = 'array'),
  turn_index smallint not null default 0 check (turn_index between 0 and 3),
  last_roll smallint check (last_roll between 1 and 6),
  turn_number bigint not null default 0 check (turn_number >= 0),
  turn_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- App catalog tables. Catalog content is public-read; only app_metadata admins can mutate.
create table if not exists public.sounds (
  id bigint generated by default as identity primary key,
  name text not null,
  audio_url text not null,
  price integer not null default 0 check (price >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.stickers (
  id bigint generated by default as identity primary key,
  name text not null,
  image_url text not null,
  price integer not null default 0 check (price >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.boards (
  id bigint generated by default as identity primary key,
  name text not null,
  image_url text not null,
  price integer not null default 0 check (price >= 0),
  colors jsonb not null default '["#176b52", "#e4b84f", "#d15b4d"]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.tokens (
  id bigint generated by default as identity primary key,
  name text not null,
  image_url text not null,
  price integer not null default 0 check (price >= 0),
  created_at timestamptz not null default now()
);

-- Profile creation on Auth signup. Signup may upsert additional profile fields afterwards.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(lower(btrim(new.raw_user_meta_data ->> 'username')), ''), 'player-' || left(new.id::text, 8)),
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at := now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
drop trigger if exists friend_requests_touch_updated_at on public.friend_requests;
create trigger friend_requests_touch_updated_at before update on public.friend_requests
for each row execute function public.touch_updated_at();
drop trigger if exists game_invitations_touch_updated_at on public.game_invitations;
create trigger game_invitations_touch_updated_at before update on public.game_invitations
for each row execute function public.touch_updated_at();
drop trigger if exists quick_match_queue_touch_updated_at on public.quick_match_queue;
create trigger quick_match_queue_touch_updated_at before update on public.quick_match_queue
for each row execute function public.touch_updated_at();
drop trigger if exists game_sessions_touch_updated_at on public.game_sessions;
create trigger game_sessions_touch_updated_at before update on public.game_sessions
for each row execute function public.touch_updated_at();
drop trigger if exists on_auth_user_created_profile on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_game_lobby_participant(target_lobby_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select target_user_id = auth.uid() and exists (select 1 from public.lobby_players m where m.lobby_id = target_lobby_id and m.user_id = auth.uid()); $$;

create or replace function public.are_profiles_blocked(first_user_id uuid, second_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profile_blocks b
    where auth.uid() = first_user_id
      and ((b.blocker_id = first_user_id and b.blocked_id = second_user_id)
        or (b.blocker_id = second_user_id and b.blocked_id = first_user_id))
  );
$$;

create or replace function public.quick_match_normalize_board(p_board jsonb)
returns jsonb language plpgsql immutable security definer set search_path = public
as $$
begin
  if jsonb_typeof(p_board) = 'object'
    and nullif(btrim(p_board ->> 'id'), '') is not null
    and nullif(btrim(p_board ->> 'name'), '') is not null
    and jsonb_typeof(p_board -> 'colors') = 'array'
    and jsonb_array_length(p_board -> 'colors') >= 3 then
    return p_board || jsonb_build_object('id', btrim(p_board ->> 'id'), 'name', btrim(p_board ->> 'name'));
  end if;
  return jsonb_build_object('id', 'b1', 'name', 'Classic Board', 'colors', jsonb_build_array('#176b52', '#e4b84f', '#d15b4d'));
end;
$$;

-- Matchmaking assignment is serialized using an advisory transaction lock. Queue row and seat
-- are created/updated in the same transaction; finished rooms are never candidates.
create or replace function public.find_or_create_quick_match(requested_board jsonb, requested_token_url text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_lobby public.game_lobbies%rowtype;
  v_config jsonb;
  v_players jsonb;
  v_game uuid;
  v_count integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if requested_token_url is not null and char_length(requested_token_url) > 2048 then raise exception 'Token URL is too long'; end if;
  perform pg_advisory_xact_lock(731942, 1);
  if not exists (select 1 from public.profiles p where p.id = v_user and p.online is true and p.status = 'online') then
    raise exception 'Player is not available for matchmaking';
  end if;

  select l.* into v_lobby
  from public.game_lobbies l
  where l.status = 'waiting'
    and l.match_config ->> 'mode' = 'quick'
    and (select count(*) from public.lobby_players m where m.lobby_id = l.id) < 4
    and not exists (
      select 1 from public.lobby_players m join public.profile_blocks b
        on (b.blocker_id = v_user and b.blocked_id = m.user_id)
        or (b.blocker_id = m.user_id and b.blocked_id = v_user)
      where m.lobby_id = l.id
    )
  order by l.created_at, l.id
  limit 1 for update skip locked;

  if not found then
    v_game := gen_random_uuid();
    insert into public.game_lobbies (host_id, max_players, status, game_id, match_config)
    values (v_user, 4, 'waiting', v_game, jsonb_build_object(
      'mode', 'quick', 'gameId', v_game, 'hostId', v_user,
      'board', public.quick_match_normalize_board(requested_board), 'players', '[]'::jsonb
    )) returning * into v_lobby;
  end if;

  insert into public.lobby_players (lobby_id, user_id, token_url)
  values (v_lobby.id, v_user, requested_token_url)
  on conflict (lobby_id, user_id) do update set token_url = excluded.token_url;

  select count(*) into v_count from public.lobby_players m where m.lobby_id = v_lobby.id;
  v_game := coalesce(v_lobby.game_id, gen_random_uuid());
  select jsonb_agg(jsonb_build_object(
    'id', p.id::text,
    'name', coalesce(p.display_name, p.username),
    'avatar', coalesce(p.avatar_url, ''),
    'token_url', m.token_url,
    'score', coalesce(p.points, 0),
    'position', 0,
    'connected', p.online is true and p.status = 'online'
  ) order by m.joined_at, m.user_id)
  into v_players
  from public.lobby_players m join public.profiles p on p.id = m.user_id
  where m.lobby_id = v_lobby.id;

  v_config := coalesce(v_lobby.match_config, '{}'::jsonb) || jsonb_build_object(
    'gameId', v_game, 'lobbyId', v_lobby.id, 'hostId', v_lobby.host_id,
    'board', public.quick_match_normalize_board(v_lobby.match_config -> 'board'),
    'players', coalesce(v_players, '[]'::jsonb)
  );

  create or replace function public.sync_quick_match_countdown_from_membership()
  returns trigger language plpgsql security definer set search_path = public
  as $$
  update public.game_lobbies set game_id = v_game, match_config = v_config,
    v_lobby_id uuid := case when tg_op = 'DELETE' then old.lobby_id else new.lobby_id end;
    v_active_count integer;
    created_at = case when v_count = 2 then now() else created_at end
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
  returns trigger language plpgsql security definer set search_path = public
  as $$
  where id = v_lobby.id and status = 'waiting' returning * into v_lobby;
    v_lobby record;
    v_active_count integer;
    v_was_active boolean := old.online is true and old.status = 'online';
    v_is_active boolean := new.online is true and new.status = 'online';

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
        update public.game_lobbies set created_at = now()
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
  insert into public.quick_match_queue (user_id, requested_board, requested_token_url, status, lobby_id, game_id, match_config)
  values (v_user, public.quick_match_normalize_board(requested_board), requested_token_url, 'waiting', v_lobby.id, v_game, v_config)
  on conflict (user_id) do update set requested_board = excluded.requested_board,
    requested_token_url = excluded.requested_token_url, status = 'waiting',
    lobby_id = excluded.lobby_id, game_id = excluded.game_id, match_config = excluded.match_config,
    updated_at = now();
  update public.quick_match_queue set status = 'waiting', game_id = v_game, match_config = v_config, updated_at = now()
    where lobby_id = v_lobby.id;

  return jsonb_build_object('status', 'waiting', 'match_config', v_config, 'lobby_created_at', v_lobby.created_at);
end;
$$;

create or replace function public.join_quick_match(requested_board jsonb, requested_token_url text default null)
returns jsonb language sql security definer set search_path = public
as $$ select public.find_or_create_quick_match(requested_board, requested_token_url); $$;

create or replace function public.rejoin_quick_match()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_queue public.quick_match_queue%rowtype;
  v_lobby public.game_lobbies%rowtype;
  v_config jsonb;
  v_players jsonb;
  v_count integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(731942, 1);
  select * into v_queue from public.quick_match_queue q where q.user_id = v_user and q.status = 'waiting' for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into v_lobby from public.game_lobbies l where l.id = v_queue.lobby_id for update;
  if not found or v_lobby.status <> 'waiting' then return jsonb_build_object('status', 'closed'); end if;
  insert into public.lobby_players (lobby_id, user_id, token_url)
  values (v_lobby.id, v_user, v_queue.requested_token_url)
  on conflict (lobby_id, user_id) do update set token_url = excluded.token_url;
  select count(*) into v_count from public.lobby_players m where m.lobby_id = v_lobby.id;
  select jsonb_agg(jsonb_build_object('id', p.id::text, 'name', coalesce(p.display_name,p.username),
      'avatar',coalesce(p.avatar_url,''),'token_url',m.token_url,'score',coalesce(p.points,0),'position',0,
      'connected',p.online is true and p.status='online') order by m.joined_at,m.user_id)
    into v_players from public.lobby_players m join public.profiles p on p.id=m.user_id where m.lobby_id=v_lobby.id;
  v_config := coalesce(v_lobby.match_config,'{}'::jsonb) || jsonb_build_object('gameId',v_lobby.game_id,
    'lobbyId',v_lobby.id,'hostId',v_lobby.host_id,'players',coalesce(v_players,'[]'::jsonb));
  update public.game_lobbies set match_config=v_config, created_at=case when v_count=2 then now() else created_at end
    where id=v_lobby.id and status='waiting' returning * into v_lobby;
  update public.quick_match_queue set status='waiting',game_id=v_lobby.game_id,match_config=v_config,updated_at=now()
    where lobby_id=v_lobby.id and status='waiting';
  return jsonb_build_object('status','waiting','match_config',v_config,'lobby_created_at',v_lobby.created_at);
end;
$$;

create or replace function public.launch_quick_match()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_queue public.quick_match_queue%rowtype;
  v_lobby public.game_lobbies%rowtype;
  v_session public.game_sessions%rowtype;
  v_config jsonb;
  v_players jsonb;
  v_board jsonb;
  v_game uuid;
  v_seats integer;
  v_active integer;
  v_expired boolean;
  v_has_session boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(731942,1);
  select * into v_queue from public.quick_match_queue q where q.user_id=v_user for update;
  if not found then raise exception 'Player is not in quick-match queue'; end if;
  select * into v_lobby from public.game_lobbies l where l.id=v_queue.lobby_id for update;
  if not found then raise exception 'Quick-match room no longer exists'; end if;

  if v_lobby.status in ('matched','in_progress') then
    select * into v_session from public.game_sessions s where s.game_id=v_lobby.game_id;
    v_has_session := found;
    return jsonb_build_object('status','matched','game_id',v_lobby.game_id,
      'match_config',coalesce(v_lobby.match_config,'{}'::jsonb),
      'game_session',case when v_has_session then to_jsonb(v_session) else null end,
      'lobby_created_at',v_lobby.created_at);
  end if;
  if v_lobby.status <> 'waiting' then raise exception 'Quick-match room is closed'; end if;
  v_expired := v_lobby.created_at <= now() - interval '15 seconds';
  select count(*) into v_seats from public.lobby_players m where m.lobby_id=v_lobby.id;
  select count(*) into v_active from public.lobby_players m join public.profiles p on p.id=m.user_id
    where m.lobby_id=v_lobby.id and p.online is true and p.status='online';
  if v_seats < 2 or v_seats > 4 or not (v_seats=4 or (v_expired and v_active>=2)) or v_active<2 then
    return jsonb_build_object('status','waiting','match_config',v_lobby.match_config,'lobby_created_at',v_lobby.created_at);
  end if;

  v_game := gen_random_uuid();
  v_board := public.quick_match_normalize_board(v_lobby.match_config->'board');
  select jsonb_agg(jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.username),
      'avatar',coalesce(p.avatar_url,''),'token_url',m.token_url,'score',coalesce(p.points,0),
      'position',0,'connected',p.online is true and p.status='online') order by m.joined_at,m.user_id)
    into v_players from public.lobby_players m join public.profiles p on p.id=m.user_id where m.lobby_id=v_lobby.id;
  v_config := coalesce(v_lobby.match_config,'{}'::jsonb) || jsonb_build_object('gameId',v_game,'lobbyId',v_lobby.id,
    'hostId',v_lobby.host_id,'board',v_board,'players',coalesce(v_players,'[]'::jsonb));
  insert into public.game_sessions(game_id,lobby_id,status,launch_reason,board,players,turn_index)
    values(v_game,v_lobby.id,'in_progress',case when v_seats=4 then 'full' else 'timer' end,v_board,coalesce(v_players,'[]'::jsonb),0);
  update public.game_lobbies set status='matched',game_id=v_game,match_config=v_config where id=v_lobby.id and status='waiting';
  update public.quick_match_queue set status='matched',game_id=v_game,match_config=v_config,updated_at=now() where lobby_id=v_lobby.id;
  select * into v_session from public.game_sessions s where s.game_id=v_game;
  return jsonb_build_object('status','matched','game_id',v_game,'match_config',v_config,
    'game_session',to_jsonb(v_session),'lobby_created_at',v_lobby.created_at);
end;
$$;
create or replace function public.start_quick_match() returns jsonb language sql security definer set search_path=public as $$ select public.launch_quick_match(); $$;

create or replace function public.roll_game_turn(p_game_id uuid,p_expected_turn_number bigint)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_session public.game_sessions%rowtype;
  v_players jsonb;
  v_player_id text;
  v_position integer;
  v_target integer;
  v_roll integer;
  v_count integer;
  v_next_turn integer;
  v_idx integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_session from public.game_sessions s where s.game_id=p_game_id for update;
  if not found or v_session.status <> 'in_progress' then raise exception 'Game session is not active'; end if;
  if v_session.turn_number <> p_expected_turn_number then raise exception 'Turn state is stale'; end if;
  if v_session.turn_index >= jsonb_array_length(v_session.players) then raise exception 'Invalid active turn'; end if;
  v_player_id:=v_session.players->v_session.turn_index->>'id';
  if v_player_id is distinct from v_user::text
    and not exists(
      select 1 from jsonb_array_elements(v_session.players) as entries(player)
      where player->>'id'=v_user::text
    )
    then raise exception 'Only a match participant can roll'; end if;
  if v_player_id is distinct from v_user::text
    and now() < v_session.turn_started_at + interval '10 seconds'
    then raise exception 'Active player turn has not expired'; end if;

  v_count:=jsonb_array_length(v_session.players);
  if v_count < 2 or v_count > 4 then raise exception 'Invalid game roster'; end if;
  v_roll:=floor(random()*6)::integer+1;
  v_players:=v_session.players;
  v_position:=coalesce((v_players->v_session.turn_index->>'position')::integer,0);
  v_target:=v_position+v_roll;
  if v_target>100 then v_target:=100-(v_target-100); end if;

  v_target:=case v_target
    when 9 then 29 when 41 then 62 when 70 then 89 when 30 then 69
    when 26 then 65 when 64 then 96 when 80 then 100 when 48 then 67
    when 38 then 18 when 87 then 66 when 98 then 78 when 93 then 73
    when 33 then 8 when 45 then 14 when 58 then 25 when 21 then 2
    else v_target end;

  v_players:=jsonb_set(v_players,array[v_session.turn_index::text,'position'],to_jsonb(v_target),false);
  if v_target>0 then
    for v_idx in 0..v_count-1 loop
      if v_idx<>v_session.turn_index
        and coalesce((v_players->v_idx->>'position')::integer,0)=v_target then
        v_players:=jsonb_set(v_players,array[v_idx::text,'position'],'0'::jsonb,false);
      end if;
    end loop;
  end if;

  v_next_turn:=case when v_target=100 or v_roll=6 then v_session.turn_index
    else (v_session.turn_index+1)%v_count end;
  update public.game_sessions
  set players=v_players,
      turn_index=v_next_turn,
      last_roll=v_roll,
      turn_number=turn_number+1,
      turn_started_at=now(),
      status=case when v_target=100 then 'finished' else 'in_progress' end
  where game_id=p_game_id
  returning * into v_session;
  return to_jsonb(v_session);
end;
$$;

create or replace function public.leave_quick_match(p_lobby_id uuid, p_player_id uuid, p_keep_room boolean default false)
returns void language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid:=auth.uid(); v_lobby public.game_lobbies%rowtype; v_target uuid; v_queue public.quick_match_queue%rowtype;
  v_players jsonb; v_config jsonb; v_host uuid; v_left integer;
begin
  if v_user is null or p_player_id is distinct from v_user then raise exception 'Can only leave own quick-match seat'; end if;
  perform pg_advisory_xact_lock(731942,1);
  select * into v_queue from public.quick_match_queue q where q.user_id=v_user and (p_lobby_id is null or q.lobby_id=p_lobby_id) for update;
  v_target:=coalesce(p_lobby_id,v_queue.lobby_id);
  if v_target is null then if not p_keep_room then delete from public.quick_match_queue where user_id=v_user; end if; return; end if;
  select * into v_lobby from public.game_lobbies l where l.id=v_target for update;
  if not found or v_lobby.status <> 'waiting' then
    if not p_keep_room then delete from public.quick_match_queue where user_id=v_user and lobby_id=v_target; end if;
    return;
  end if;
  delete from public.lobby_players where lobby_id=v_target and user_id=v_user;
  if not p_keep_room then delete from public.quick_match_queue where user_id=v_user and lobby_id=v_target; end if;
  select count(*) into v_left from public.lobby_players where lobby_id=v_target;
  if v_left=0 and not p_keep_room then
    delete from public.game_lobbies where id=v_target and status='waiting';
    delete from public.quick_match_queue where lobby_id=v_target;
    return;
  end if;
  select user_id into v_host from public.lobby_players where lobby_id=v_target order by joined_at,user_id limit 1;
  if v_host is null then v_host:=v_lobby.host_id; end if;
  select jsonb_agg(jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.username),
      'avatar',coalesce(p.avatar_url,''),'token_url',m.token_url,'score',coalesce(p.points,0),
      'position',0,'connected',p.online is true and p.status='online') order by m.joined_at,m.user_id)
    into v_players from public.lobby_players m join public.profiles p on p.id=m.user_id where m.lobby_id=v_target;
  v_config:=coalesce(v_lobby.match_config,'{}'::jsonb)||jsonb_build_object('gameId',v_lobby.game_id,'lobbyId',v_target,
    'hostId',v_host,'players',coalesce(v_players,'[]'::jsonb));
  update public.game_lobbies set host_id=v_host,match_config=v_config,
    created_at=case when v_left=1 then now() else created_at end where id=v_target and status='waiting';
  update public.quick_match_queue set status='waiting',match_config=v_config,updated_at=now()
    where lobby_id=v_target and status='waiting';
end;
$$;

create or replace function public.launch_friend_lobby(p_lobby_id uuid,p_board jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid:=auth.uid(); v_lobby public.game_lobbies%rowtype; v_game uuid; v_players jsonb; v_config jsonb; v_count integer; v_board jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_lobby from public.game_lobbies l where l.id=p_lobby_id and l.host_id=v_user and l.status='waiting' for update;
  if not found then raise exception 'Lobby is not available'; end if;
  select count(*) into v_count from public.lobby_players where lobby_id=p_lobby_id;
  if v_count<2 or v_count>v_lobby.max_players then raise exception 'Invalid lobby player count'; end if;
  v_game:=gen_random_uuid(); v_board:=public.quick_match_normalize_board(p_board);
  select jsonb_agg(jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.username),
      'avatar',coalesce(p.avatar_url,''),'token_url',m.token_url,'score',coalesce(p.points,0),
      'position',0,'connected',p.online is true and p.status in ('online','in_game')) order by m.joined_at,m.user_id)
    into v_players from public.lobby_players m join public.profiles p on p.id=m.user_id where m.lobby_id=p_lobby_id;
  v_config:=coalesce(v_lobby.match_config,'{}'::jsonb)||jsonb_build_object('gameId',v_game,'lobbyId',p_lobby_id,
    'hostId',v_lobby.host_id,'board',v_board,'players',coalesce(v_players,'[]'::jsonb));
  insert into public.game_sessions(game_id,lobby_id,status,launch_reason,board,players,turn_index)
    values(v_game,p_lobby_id,'in_progress','host',v_board,coalesce(v_players,'[]'::jsonb),0);
  update public.game_lobbies set status='in_progress',game_id=v_game,match_config=v_config where id=p_lobby_id and status='waiting';
  return jsonb_build_object('status','matched','game_id',v_game,'match_config',v_config);
end;
$$;

create or replace function public.respond_to_game_invitation(invitation_id uuid,response text)
returns public.game_invitations language plpgsql security definer set search_path=public
as $$
declare v_inv public.game_invitations%rowtype; v_capacity integer; v_count integer;
begin
  if auth.uid() is null or response not in ('accepted','declined') then raise exception 'Invalid invitation response'; end if;
  select * into v_inv from public.game_invitations i where i.id=invitation_id and i.receiver_id=auth.uid() and i.status='pending' for update;
  if not found then raise exception 'Invitation is no longer pending'; end if;
  if response='accepted' then
    select max_players into v_capacity from public.game_lobbies where id=v_inv.lobby_id and status='waiting' for update;
    if not found then raise exception 'Lobby is no longer waiting'; end if;
    select count(*) into v_count from public.lobby_players where lobby_id=v_inv.lobby_id;
    if v_count>=v_capacity then raise exception 'Lobby is full'; end if;
    insert into public.lobby_players(lobby_id,user_id) values(v_inv.lobby_id,auth.uid()) on conflict do nothing;
  end if;
  update public.game_invitations set status=response,updated_at=now() where id=v_inv.id returning * into v_inv;
  return v_inv;
end;
$$;

-- User/profile RPCs used by the app.
create or replace function public.update_profile_display_name(new_display_name text)
returns table(display_name text,last_name_change_at timestamptz) language plpgsql security definer set search_path=public
as $$
declare v_name text:=btrim(new_display_name); v_changed timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if v_name is null or v_name='' then raise exception 'display_name_required'; end if;
  if char_length(v_name)>14 then raise exception 'display_name_too_long'; end if;
  select p.last_name_change_at into v_changed from public.profiles p where p.id=auth.uid() for update;
  if not found then raise exception 'profile_not_found'; end if;
  if v_changed is not null and now()<v_changed+interval '7 days' then raise exception 'name_change_cooldown'; end if;
  if exists(select 1 from public.profiles p where p.id<>auth.uid() and lower(btrim(coalesce(p.display_name,p.username)))=lower(v_name)) then raise exception 'display_name_taken'; end if;
  update public.profiles p set display_name=v_name,last_name_change_at=now(),updated_at=now()
    where p.id=auth.uid() returning p.display_name,p.last_name_change_at into display_name,last_name_change_at;
  return next;
exception when unique_violation then raise exception 'display_name_taken';
end; $$;

create or replace function public.update_profile_username(new_username text)
returns table(username text,last_username_change_at timestamptz) language plpgsql security definer set search_path=public
as $$
declare v_name text:=lower(regexp_replace(btrim(new_username),'^@+','')); v_old text; v_changed timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if v_name is null or v_name='' then raise exception 'username_required'; end if;
  if char_length(v_name)>20 then raise exception 'username_too_long'; end if;
  select p.username,p.last_username_change_at into v_old,v_changed from public.profiles p where p.id=auth.uid() for update;
  if not found then raise exception 'profile_not_found'; end if;
  if lower(btrim(v_old))=v_name then username:=v_old; last_username_change_at:=v_changed; return next; return; end if;
  if v_changed is not null and now()<v_changed+interval '30 days' then raise exception 'username_change_cooldown'; end if;
  if exists(select 1 from public.profiles p where p.id<>auth.uid() and lower(btrim(p.username))=v_name) then raise exception 'username_taken'; end if;
  update public.profiles p set username=v_name,last_username_change_at=now(),updated_at=now()
    where p.id=auth.uid() returning p.username,p.last_username_change_at into username,last_username_change_at;
  return next;
exception when unique_violation then raise exception 'username_taken';
end; $$;

create or replace function public.update_profile_bio(new_bio text)
returns text language plpgsql security definer set search_path=public
as $$ declare v_bio text:=coalesce(new_bio,''); begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if char_length(v_bio)>30 then raise exception 'bio_too_long'; end if;
  update public.profiles set bio=v_bio,updated_at=now() where id=auth.uid();
  if not found then raise exception 'profile_not_found'; end if;
  return v_bio;
end; $$;

create or replace function public.update_profile_avatar(new_avatar_url text)
returns text language plpgsql security definer set search_path=public
as $$ declare v_avatar text; v_expected text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  v_expected:=format('/storage/v1/object/public/profile-avatars/%s/',auth.uid());
  if new_avatar_url is null or char_length(new_avatar_url)>2048 or position(v_expected in new_avatar_url)=0 then raise exception 'avatar_url_invalid'; end if;
  update public.profiles set avatar_url=new_avatar_url,updated_at=now() where id=auth.uid() returning avatar_url into v_avatar;
  if not found then raise exception 'profile_not_found'; end if;
  return v_avatar;
end; $$;

create or replace function public.update_profile_privacy_settings(new_online boolean,new_hide_profile_details boolean,new_hide_following boolean)
returns table(online boolean,hide_profile_details boolean,hide_following boolean) language plpgsql security definer set search_path=public
as $$ begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  update public.profiles p set online=new_online,hide_profile_details=new_hide_profile_details,
    hide_following=new_hide_following,hide_city_age=new_hide_profile_details,hide_online_status=not new_online,updated_at=now()
    where p.id=auth.uid() returning p.online,p.hide_profile_details,p.hide_following into online,hide_profile_details,hide_following;
  if not found then raise exception 'profile_not_found'; end if;
  return next;
end; $$;

create or replace function public.set_profile_game_status(new_status text)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new_status not in ('online','in_game') then raise exception 'Unsupported profile game status'; end if;
  update public.profiles set status=new_status,updated_at=now() where id=auth.uid();
  if not found then raise exception 'Profile not found'; end if;
end; $$;

create or replace function public.add_gold(player_id uuid,amount integer)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if auth.uid() is distinct from player_id then raise exception 'Only the player can update their gold'; end if;
  if amount not in (100,400,700,1100,1800) then raise exception 'Unsupported gold package'; end if;
  update public.profiles set gold=gold+amount,updated_at=now() where id=player_id;
end; $$;

create or replace function public.record_game_result(player_id uuid,did_win boolean)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if auth.uid() is distinct from player_id then raise exception 'Only the player can record their own result'; end if;
  update public.profiles set games_played=games_played+1,wins=wins+case when did_win then 1 else 0 end,
    losses=losses+case when did_win then 0 else 1 end,points=points+case when did_win then 100 else 10 end,updated_at=now()
    where id=player_id;
end; $$;

create or replace function public.accept_friend_request(request_id uuid default null,sender_user_id uuid default null,receiver_user_id uuid default null)
returns void language plpgsql security definer set search_path=public
as $$ declare v_sender uuid; v_receiver uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if request_id is not null then
    select sender_id,receiver_id into v_sender,v_receiver from public.friend_requests
      where id=request_id and receiver_id=auth.uid() and status='pending' for update;
  else
    v_sender:=sender_user_id; v_receiver:=receiver_user_id;
    if v_receiver is distinct from auth.uid() then raise exception 'Only receiver can accept'; end if;
    perform 1 from public.friend_requests f
      where f.sender_id=v_sender and f.receiver_id=v_receiver and f.status='pending' for update;
    if not found then raise exception 'Friend request not found'; end if;
  end if;
  if v_sender is null or v_receiver is null then raise exception 'Friend request not found'; end if;
  update public.friend_requests set status='accepted',updated_at=now()
    where sender_id=v_sender and receiver_id=v_receiver and status='pending';
  insert into public.friend_requests(sender_id,receiver_id,status) values(v_receiver,v_sender,'accepted')
    on conflict(sender_id,receiver_id) do update set status='accepted',updated_at=now();
end; $$;

create or replace function public.remove_friend_relationship(friend_user_id uuid)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if auth.uid() is null or friend_user_id is null or friend_user_id=auth.uid() then raise exception 'Invalid friend ID'; end if;
  delete from public.direct_messages where (sender_id=auth.uid() and receiver_id=friend_user_id) or (sender_id=friend_user_id and receiver_id=auth.uid());
  delete from public.friend_requests where (sender_id=auth.uid() and receiver_id=friend_user_id) or (sender_id=friend_user_id and receiver_id=auth.uid());
end; $$;

create or replace function public.unblock_profile_relationship(p_user_id uuid,p_target_id uuid)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Authenticated user does not match p_user_id'; end if;
  if p_target_id is null or p_target_id=p_user_id then raise exception 'Invalid target user'; end if;
  delete from public.friend_requests where (sender_id=p_user_id and receiver_id=p_target_id) or (sender_id=p_target_id and receiver_id=p_user_id);
  delete from public.profile_blocks where blocker_id=p_user_id and blocked_id=p_target_id;
end; $$;

create or replace function public.is_friend(user_a uuid,user_b uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select (user_a=auth.uid() or user_b=auth.uid()) and exists(select 1 from public.friend_requests f where f.status='accepted'
  and ((f.sender_id=user_a and f.receiver_id=user_b) or (f.sender_id=user_b and f.receiver_id=user_a))); $$;

-- RLS, grants and policy reset (safe to rerun).
do $$ declare t text; begin
  foreach t in array array['profiles','friend_requests','profile_blocks','direct_messages','game_lobbies','lobby_players','game_invitations','quick_match_queue','game_sessions','sounds','stickers','boards','tokens'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

-- Remove policies with these canonical names before recreation.
drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_username_lookup_anon on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists friend_requests_select_participant on public.friend_requests;
drop policy if exists friend_requests_insert_sender on public.friend_requests;
drop policy if exists friend_requests_update_receiver on public.friend_requests;
drop policy if exists friend_requests_delete_participant on public.friend_requests;
drop policy if exists profile_blocks_select_participant on public.profile_blocks;
drop policy if exists profile_blocks_insert_self on public.profile_blocks;
drop policy if exists profile_blocks_update_self on public.profile_blocks;
drop policy if exists profile_blocks_delete_self on public.profile_blocks;
drop policy if exists direct_messages_select_participant on public.direct_messages;
drop policy if exists direct_messages_insert_sender on public.direct_messages;
drop policy if exists direct_messages_update_participant on public.direct_messages;
drop policy if exists direct_messages_delete_sender on public.direct_messages;
drop policy if exists lobbies_select_participant on public.game_lobbies;
drop policy if exists lobbies_insert_host on public.game_lobbies;
drop policy if exists lobbies_update_host on public.game_lobbies;
drop policy if exists lobbies_delete_host on public.game_lobbies;
drop policy if exists lobby_players_select_participant on public.lobby_players;
drop policy if exists lobby_players_insert_self on public.lobby_players;
drop policy if exists lobby_players_update_self on public.lobby_players;
drop policy if exists lobby_players_delete_self_or_host on public.lobby_players;
drop policy if exists invitations_select_participant on public.game_invitations;
drop policy if exists invitations_insert_member on public.game_invitations;
drop policy if exists invitations_update_receiver on public.game_invitations;
drop policy if exists queue_select_lobby_member on public.quick_match_queue;
drop policy if exists sessions_select_lobby_member on public.game_sessions;
drop policy if exists catalog_select_public_sounds on public.sounds;
drop policy if exists catalog_select_public_stickers on public.stickers;
drop policy if exists catalog_select_public_boards on public.boards;
drop policy if exists catalog_select_public_tokens on public.tokens;
drop policy if exists catalog_admin_sounds on public.sounds;
drop policy if exists catalog_admin_stickers on public.stickers;
drop policy if exists catalog_admin_boards on public.boards;
drop policy if exists catalog_admin_tokens on public.tokens;

create policy profiles_select_authenticated on public.profiles for select to authenticated
using (id=auth.uid() or not exists(select 1 from public.profile_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=profiles.id) or (b.blocker_id=profiles.id and b.blocked_id=auth.uid())));
create policy profiles_username_lookup_anon on public.profiles for select to anon using (true);
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id=auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy friend_requests_select_participant on public.friend_requests for select to authenticated using (sender_id=auth.uid() or receiver_id=auth.uid());
create policy friend_requests_insert_sender on public.friend_requests for insert to authenticated
with check (sender_id=auth.uid() and status='pending' and not public.are_profiles_blocked(sender_id,receiver_id));
create policy friend_requests_update_receiver on public.friend_requests for update to authenticated using (receiver_id=auth.uid()) with check (receiver_id=auth.uid());
create policy friend_requests_delete_participant on public.friend_requests for delete to authenticated using (sender_id=auth.uid() or receiver_id=auth.uid());

create policy profile_blocks_select_participant on public.profile_blocks for select to authenticated using (blocker_id=auth.uid() or blocked_id=auth.uid());
create policy profile_blocks_insert_self on public.profile_blocks for insert to authenticated with check (blocker_id=auth.uid());
create policy profile_blocks_update_self on public.profile_blocks for update to authenticated using (blocker_id=auth.uid()) with check (blocker_id=auth.uid());
create policy profile_blocks_delete_self on public.profile_blocks for delete to authenticated using (blocker_id=auth.uid());

create policy direct_messages_select_participant on public.direct_messages for select to authenticated using (sender_id=auth.uid() or receiver_id=auth.uid());
create policy direct_messages_insert_sender on public.direct_messages for insert to authenticated with check (sender_id=auth.uid() and not public.are_profiles_blocked(sender_id,receiver_id));
create policy direct_messages_update_participant on public.direct_messages for update to authenticated using (sender_id=auth.uid() or receiver_id=auth.uid()) with check (sender_id=auth.uid() or receiver_id=auth.uid());
create policy direct_messages_delete_sender on public.direct_messages for delete to authenticated using (sender_id=auth.uid());

create policy lobbies_select_participant on public.game_lobbies for select to authenticated using (
  host_id=auth.uid() or public.is_game_lobby_participant(id,auth.uid()) or exists(select 1 from public.game_invitations i where i.lobby_id=id and i.receiver_id=auth.uid() and i.status in ('pending','accepted')));
create policy lobbies_insert_host on public.game_lobbies for insert to authenticated with check (host_id=auth.uid());
create policy lobbies_update_host on public.game_lobbies for update to authenticated
using (host_id=auth.uid())
with check (host_id=auth.uid() and status in ('waiting','finished','disbanded'));
create policy lobbies_delete_host on public.game_lobbies for delete to authenticated using (host_id=auth.uid());

create policy lobby_players_select_participant on public.lobby_players for select to authenticated using (public.is_game_lobby_participant(lobby_id,auth.uid()) or exists(select 1 from public.game_invitations i where i.lobby_id=lobby_players.lobby_id and i.receiver_id=auth.uid() and i.status in ('pending','accepted')));
create policy lobby_players_insert_self on public.lobby_players for insert to authenticated with check (user_id=auth.uid() and (exists(select 1 from public.game_lobbies l where l.id=lobby_id and l.host_id=auth.uid()) or exists(select 1 from public.game_invitations i where i.lobby_id=lobby_players.lobby_id and i.receiver_id=auth.uid() and i.status='accepted')));
create policy lobby_players_update_self on public.lobby_players for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy lobby_players_delete_self_or_host on public.lobby_players for delete to authenticated using (user_id=auth.uid() or exists(select 1 from public.game_lobbies l where l.id=lobby_players.lobby_id and l.host_id=auth.uid()));

create policy invitations_select_participant on public.game_invitations for select to authenticated using (sender_id=auth.uid() or receiver_id=auth.uid());
create policy invitations_insert_member on public.game_invitations for insert to authenticated with check (
  sender_id=auth.uid() and status='pending' and exists(select 1 from public.lobby_players m where m.lobby_id=game_invitations.lobby_id and m.user_id=auth.uid())
  and public.is_friend(auth.uid(),receiver_id) and not public.are_profiles_blocked(auth.uid(),receiver_id));
create policy invitations_update_receiver on public.game_invitations for update to authenticated using (receiver_id=auth.uid() or sender_id=auth.uid()) with check (receiver_id=auth.uid() or sender_id=auth.uid());

create policy queue_select_lobby_member on public.quick_match_queue for select to authenticated using (user_id=auth.uid() or public.is_game_lobby_participant(lobby_id,auth.uid()));
create policy sessions_select_lobby_member on public.game_sessions for select to authenticated using (public.is_game_lobby_participant(lobby_id,auth.uid()));

create policy catalog_select_public_sounds on public.sounds for select to anon,authenticated using (true);
create policy catalog_select_public_stickers on public.stickers for select to anon,authenticated using (true);
create policy catalog_select_public_boards on public.boards for select to anon,authenticated using (true);
create policy catalog_select_public_tokens on public.tokens for select to anon,authenticated using (true);
create policy catalog_admin_sounds on public.sounds for all to authenticated using ((auth.jwt()->'app_metadata'->>'role')='admin') with check ((auth.jwt()->'app_metadata'->>'role')='admin');
create policy catalog_admin_stickers on public.stickers for all to authenticated using ((auth.jwt()->'app_metadata'->>'role')='admin') with check ((auth.jwt()->'app_metadata'->>'role')='admin');
create policy catalog_admin_boards on public.boards for all to authenticated using ((auth.jwt()->'app_metadata'->>'role')='admin') with check ((auth.jwt()->'app_metadata'->>'role')='admin');
create policy catalog_admin_tokens on public.tokens for all to authenticated using ((auth.jwt()->'app_metadata'->>'role')='admin') with check ((auth.jwt()->'app_metadata'->>'role')='admin');

-- Reset table grants, then expose only operations the application actually uses.
revoke all on public.profiles,public.friend_requests,public.profile_blocks,public.direct_messages,
  public.game_lobbies,public.lobby_players,public.game_invitations,public.quick_match_queue,
  public.game_sessions,public.sounds,public.stickers,public.boards,public.tokens from anon,authenticated;
grant select(username) on public.profiles to anon;
grant select on public.profiles to authenticated;
grant insert(id,username,avatar_url,birth_year,age,city) on public.profiles to authenticated;
grant update(id,username,avatar_url,birth_year,age,city) on public.profiles to authenticated;
grant select,insert,delete on public.friend_requests to authenticated;
grant update(status) on public.friend_requests to authenticated;
grant select,insert,delete on public.profile_blocks to authenticated;
grant update(blocker_id,blocked_id) on public.profile_blocks to authenticated;
grant select,insert,delete on public.direct_messages to authenticated;
grant update(read_at,reaction) on public.direct_messages to authenticated;
grant select,insert,delete on public.game_lobbies to authenticated;
grant update(status) on public.game_lobbies to authenticated;
grant select,insert,delete on public.lobby_players to authenticated;
grant update(token_url) on public.lobby_players to authenticated;
grant select,insert on public.game_invitations to authenticated;
grant select on public.quick_match_queue,public.game_sessions to authenticated;
grant select on public.sounds,public.stickers,public.boards,public.tokens to anon,authenticated;
grant insert,update,delete on public.sounds,public.stickers,public.boards,public.tokens to authenticated;
grant usage,select on all sequences in schema public to authenticated;

-- Realtime tables subscribed to by source code; replica identity full supports DELETE payload filters.
do $$ declare t text; begin
  foreach t in array array['profiles','friend_requests','profile_blocks','direct_messages','game_lobbies','lobby_players','game_invitations','quick_match_queue','game_sessions'] loop
    execute format('alter table public.%I replica identity full',t);
    if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
      select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
end $$;

-- Avatar storage: public reads, owner-scoped writes under <auth.uid()>/ paths.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-avatars','profile-avatars',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Public profile avatars are readable" on storage.objects;
drop policy if exists "Users can upload their profile avatars" on storage.objects;
drop policy if exists "Users can update their profile avatars" on storage.objects;
drop policy if exists "Users can delete their profile avatars" on storage.objects;
drop policy if exists profile_avatars_public_read on storage.objects;
drop policy if exists profile_avatars_owner_insert on storage.objects;
drop policy if exists profile_avatars_owner_update on storage.objects;
drop policy if exists profile_avatars_owner_delete on storage.objects;
create policy profile_avatars_public_read on storage.objects for select to anon,authenticated using(bucket_id='profile-avatars');
create policy profile_avatars_owner_insert on storage.objects for insert to authenticated with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy profile_avatars_owner_update on storage.objects for update to authenticated using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy profile_avatars_owner_delete on storage.objects for delete to authenticated using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

-- Least-privilege RPC grants.
revoke all on function public.is_game_lobby_participant(uuid,uuid) from public;
revoke all on function public.is_friend(uuid,uuid) from public;
revoke all on function public.are_profiles_blocked(uuid,uuid) from public;
revoke all on function public.quick_match_normalize_board(jsonb) from public;
revoke all on function public.sync_quick_match_countdown_from_membership() from public;
revoke all on function public.sync_quick_match_countdown_from_profile() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.touch_updated_at() from public;
revoke all on function public.find_or_create_quick_match(jsonb,text) from public;
revoke all on function public.join_quick_match(jsonb,text) from public;
revoke all on function public.rejoin_quick_match() from public;
revoke all on function public.launch_quick_match() from public;
revoke all on function public.start_quick_match() from public;
revoke all on function public.leave_quick_match(uuid,uuid,boolean) from public;
revoke all on function public.launch_friend_lobby(uuid,jsonb) from public;
revoke all on function public.roll_game_turn(uuid,bigint) from public;
revoke all on function public.respond_to_game_invitation(uuid,text) from public;
revoke all on function public.update_profile_display_name(text) from public;
revoke all on function public.update_profile_username(text) from public;
revoke all on function public.update_profile_bio(text) from public;
revoke all on function public.update_profile_avatar(text) from public;
revoke all on function public.update_profile_privacy_settings(boolean,boolean,boolean) from public;
revoke all on function public.set_profile_game_status(text) from public;
revoke all on function public.add_gold(uuid,integer) from public;
revoke all on function public.record_game_result(uuid,boolean) from public;
revoke all on function public.accept_friend_request(uuid,uuid,uuid) from public;
revoke all on function public.remove_friend_relationship(uuid) from public;
revoke all on function public.unblock_profile_relationship(uuid,uuid) from public;

grant execute on function public.is_game_lobby_participant(uuid,uuid) to authenticated;
grant execute on function public.is_friend(uuid,uuid) to authenticated;
grant execute on function public.are_profiles_blocked(uuid,uuid) to authenticated;
grant execute on function public.quick_match_normalize_board(jsonb) to authenticated;
grant execute on function public.find_or_create_quick_match(jsonb,text) to authenticated;
grant execute on function public.join_quick_match(jsonb,text) to authenticated;
grant execute on function public.rejoin_quick_match() to authenticated;
grant execute on function public.launch_quick_match() to authenticated;
grant execute on function public.start_quick_match() to authenticated;
grant execute on function public.leave_quick_match(uuid,uuid,boolean) to authenticated;
grant execute on function public.launch_friend_lobby(uuid,jsonb) to authenticated;
grant execute on function public.roll_game_turn(uuid,bigint) to authenticated;
grant execute on function public.respond_to_game_invitation(uuid,text) to authenticated;
grant execute on function public.update_profile_display_name(text) to authenticated;
grant execute on function public.update_profile_username(text) to authenticated;
grant execute on function public.update_profile_bio(text) to authenticated;
grant execute on function public.update_profile_avatar(text) to authenticated;
grant execute on function public.update_profile_privacy_settings(boolean,boolean,boolean) to authenticated;
grant execute on function public.set_profile_game_status(text) to authenticated;
grant execute on function public.add_gold(uuid,integer) to authenticated;
grant execute on function public.record_game_result(uuid,boolean) to authenticated;
grant execute on function public.accept_friend_request(uuid,uuid,uuid) to authenticated;
grant execute on function public.remove_friend_relationship(uuid) to authenticated;
grant execute on function public.unblock_profile_relationship(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
