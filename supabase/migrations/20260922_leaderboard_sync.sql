alter table public.profiles
  add column if not exists points integer not null default 0,
  add column if not exists gold integer not null default 75,
  add column if not exists games_played integer not null default 0,
  add column if not exists wins integer not null default 0,
  add column if not exists losses integer not null default 0,
  add column if not exists online boolean not null default true;

update public.profiles
set points = coalesce(points, 0),
    gold = coalesce(gold, 75),
    games_played = coalesce(games_played, 0),
    wins = coalesce(wins, 0),
    losses = coalesce(losses, 0),
    online = coalesce(online, true);

create or replace function public.handle_new_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url, gold, points, games_played, wins, losses, online)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), nullif(new.email, ''), 'یاریزان'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', ''),
    75, 0, 0, 0, 0, true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_leaderboard on auth.users;
create trigger on_auth_user_created_leaderboard
after insert on auth.users
for each row execute function public.handle_new_auth_profile();

create or replace function public.add_gold(player_id uuid, amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from player_id then
    raise exception 'Only the player can update their gold';
  end if;
  if amount < 0 then
    raise exception 'Gold amount cannot be negative';
  end if;
  update public.profiles
  set gold = gold + amount,
      updated_at = now()
  where id = player_id;
end;
$$;

revoke all on function public.add_gold(uuid, integer) from public;
grant execute on function public.add_gold(uuid, integer) to authenticated;

create or replace function public.record_game_result(player_id uuid, did_win boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from player_id then
    raise exception 'Only the player can record their own result';
  end if;

  update public.profiles
  set games_played = games_played + 1,
      wins = wins + case when did_win then 1 else 0 end,
      losses = losses + case when did_win then 0 else 1 end,
      points = points + case when did_win then 100 else 10 end,
      updated_at = now()
  where id = player_id;
end;
$$;

revoke all on function public.record_game_result(uuid, boolean) from public;
grant execute on function public.record_game_result(uuid, boolean) to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "Authenticated users can read leaderboard profiles" on public.profiles;
create policy "Authenticated users can read leaderboard profiles"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or not exists (
    select 1
    from public.profile_blocks
    where (blocker_id = auth.uid() and blocked_id = profiles.id)
       or (blocker_id = profiles.id and blocked_id = auth.uid())
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end
$$;

notify pgrst, 'reload schema';