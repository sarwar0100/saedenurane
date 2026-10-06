alter table public.game_lobbies
  add column if not exists status text not null default 'waiting';

alter table public.game_lobbies
  drop constraint if exists game_lobbies_status_check;

alter table public.game_lobbies
  add constraint game_lobbies_status_check
  check (status in ('waiting', 'in_game', 'finished', 'disbanded'));alter table public.game_lobbies
  add column if not exists status text not null default 'waiting';

alter table public.game_lobbies
  drop constraint if exists game_lobbies_status_check;

alter table public.game_lobbies
  add constraint game_lobbies_status_check
  check (status in ('waiting', 'in_game', 'finished', 'disbanded'));