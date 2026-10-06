begin;

alter table public.game_sessions
  add column if not exists last_roll smallint,
  add column if not exists turn_number bigint not null default 0,
  add column if not exists turn_started_at timestamptz not null default now();

alter table public.game_sessions
  drop constraint if exists game_sessions_last_roll_check;
alter table public.game_sessions
  add constraint game_sessions_last_roll_check
  check (last_roll is null or last_roll between 1 and 6);

alter table public.game_sessions
  drop constraint if exists game_sessions_turn_number_check;
alter table public.game_sessions
  add constraint game_sessions_turn_number_check check (turn_number >= 0);

create or replace function public.roll_game_turn(p_game_id uuid, p_expected_turn_number bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.game_sessions%rowtype;
  v_players jsonb;
  v_active_player_id text;
  v_position integer;
  v_target integer;
  v_roll integer;
  v_player_count integer;
  v_next_turn integer;
  v_index integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_session
  from public.game_sessions as session
  where session.game_id = p_game_id
  for update;
  if not found or v_session.status <> 'in_progress' then
    raise exception 'Game session is not active';
  end if;
  if v_session.turn_number <> p_expected_turn_number then
    raise exception 'Turn state is stale';
  end if;
  if v_session.turn_index >= jsonb_array_length(v_session.players) then
    raise exception 'Invalid active turn';
  end if;

  v_active_player_id := v_session.players -> v_session.turn_index ->> 'id';
  if v_active_player_id is distinct from v_user_id::text
    and not exists (
      select 1 from jsonb_array_elements(v_session.players) as entries(player)
      where player ->> 'id' = v_user_id::text
    ) then
    raise exception 'Only a match participant can roll';
  end if;
  if v_active_player_id is distinct from v_user_id::text
    and now() < v_session.turn_started_at + interval '10 seconds' then
    raise exception 'Active player turn has not expired';
  end if;

  v_player_count := jsonb_array_length(v_session.players);
  if v_player_count < 2 or v_player_count > 4 then
    raise exception 'Invalid game roster';
  end if;

  v_roll := floor(random() * 6)::integer + 1;
  v_players := v_session.players;
  v_position := coalesce((v_players -> v_session.turn_index ->> 'position')::integer, 0);
  v_target := v_position + v_roll;
  if v_target > 100 then
    v_target := 100 - (v_target - 100);
  end if;

  v_target := case v_target
    when 9 then 29 when 41 then 62 when 70 then 89 when 30 then 69
    when 26 then 65 when 64 then 96 when 80 then 100 when 48 then 67
    when 38 then 18 when 87 then 66 when 98 then 78 when 93 then 73
    when 33 then 8 when 45 then 14 when 58 then 25 when 21 then 2
    else v_target
  end;

  v_players := jsonb_set(
    v_players,
    array[v_session.turn_index::text, 'position'],
    to_jsonb(v_target),
    false
  );

  if v_target > 0 then
    for v_index in 0..v_player_count - 1 loop
      if v_index <> v_session.turn_index
        and coalesce((v_players -> v_index ->> 'position')::integer, 0) = v_target then
        v_players := jsonb_set(v_players, array[v_index::text, 'position'], '0'::jsonb, false);
      end if;
    end loop;
  end if;

  v_next_turn := case
    when v_target = 100 or v_roll = 6 then v_session.turn_index
    else (v_session.turn_index + 1) % v_player_count
  end;

  update public.game_sessions
  set players = v_players,
      turn_index = v_next_turn,
      last_roll = v_roll,
      turn_number = turn_number + 1,
      turn_started_at = now(),
      status = case when v_target = 100 then 'finished' else 'in_progress' end,
      updated_at = now()
  where game_id = p_game_id
  returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

revoke all on function public.roll_game_turn(uuid, bigint) from public;
grant execute on function public.roll_game_turn(uuid, bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
