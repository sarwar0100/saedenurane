begin;

-- The client disbands a lobby by updating its status, while failed lobby setup
-- and other cleanup paths may delete the lobby row outright.
alter table public.game_lobbies
  add column if not exists status text not null default 'waiting';

update public.game_lobbies
set status = 'waiting'
where status is null
   or status not in ('waiting', 'in_game', 'finished', 'disbanded');

alter table public.game_lobbies
  alter column status set default 'waiting',
  alter column status set not null;

alter table public.game_lobbies
  drop constraint if exists game_lobbies_status_check;

alter table public.game_lobbies
  add constraint game_lobbies_status_check
  check (status in ('waiting', 'in_game', 'finished', 'disbanded'));

-- Recreate the lobby foreign keys with cascading deletes, even if a deployed
-- database differs from the original migration.
do $$
declare
  lobby_fk record;
begin
  for lobby_fk in
    select constraint_row.conrelid, constraint_row.conname
    from pg_constraint as constraint_row
    join pg_attribute as lobby_id_column
      on lobby_id_column.attrelid = constraint_row.conrelid
     and lobby_id_column.attname = 'lobby_id'
     and not lobby_id_column.attisdropped
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.game_lobbies'::regclass
      and constraint_row.conrelid in (
        'public.lobby_players'::regclass,
        'public.game_invitations'::regclass
      )
      and constraint_row.conkey = array[lobby_id_column.attnum]::smallint[]
  loop
    execute format(
      'alter table %s drop constraint %I',
      lobby_fk.conrelid::regclass,
      lobby_fk.conname
    );
  end loop;
end
$$;

alter table public.lobby_players
  add constraint lobby_players_lobby_id_fkey
  foreign key (lobby_id) references public.game_lobbies(id) on delete cascade;

alter table public.game_invitations
  add constraint game_invitations_lobby_id_fkey
  foreign key (lobby_id) references public.game_lobbies(id) on delete cascade;

alter table public.game_lobbies enable row level security;
alter table public.lobby_players enable row level security;

drop policy if exists "Hosts update lobbies" on public.game_lobbies;
create policy "Hosts update lobbies"
on public.game_lobbies for update to authenticated
using (host_id = auth.uid())
with check (host_id = auth.uid());

drop policy if exists "Hosts delete lobbies" on public.game_lobbies;
create policy "Hosts delete lobbies"
on public.game_lobbies for delete to authenticated
using (host_id = auth.uid());

drop policy if exists "Users update own lobby readiness" on public.lobby_players;
create policy "Users update own lobby readiness"
on public.lobby_players for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users or hosts remove lobby players" on public.lobby_players;
create policy "Users or hosts remove lobby players"
on public.lobby_players for delete to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.game_lobbies as lobby
    where lobby.id = lobby_id
      and lobby.host_id = auth.uid()
  )
);

grant select, insert, update, delete on public.game_lobbies to authenticated;
grant select, insert, delete on public.lobby_players to authenticated;
revoke update on public.lobby_players from authenticated;
grant update (ready) on public.lobby_players to authenticated;

commit;
