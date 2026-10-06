begin;

alter table public.game_lobbies
  add column if not exists game_id uuid,
  add column if not exists match_config jsonb;

alter table public.game_lobbies
  drop constraint if exists game_lobbies_status_check;

update public.game_lobbies
set status = 'waiting'
where status is null
   or status not in ('waiting', 'in_progress', 'finished', 'disbanded');

alter table public.game_lobbies
  alter column status set default 'waiting',
  alter column status set not null;

alter table public.game_lobbies
  add constraint game_lobbies_status_check
  check (status in ('waiting', 'in_progress', 'finished', 'disbanded'));

create unique index if not exists game_lobbies_game_id_idx
  on public.game_lobbies (game_id)
  where game_id is not null;

alter table public.lobby_players
  add column if not exists token_url text;

alter table public.lobby_players
  drop column if exists ready;

drop policy if exists "Users update own lobby readiness" on public.lobby_players;
drop policy if exists "Users update own lobby token" on public.lobby_players;
create policy "Users update own lobby token"
on public.lobby_players for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke update on public.lobby_players from authenticated;
grant update (token_url) on public.lobby_players to authenticated;
grant update on public.game_lobbies to authenticated;

create or replace function public.respond_to_game_invitation(invitation_id uuid, response text)
returns public.game_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.game_invitations%rowtype;
  lobby_capacity smallint;
  player_count integer;
begin
  if response not in ('accepted', 'declined') then
    raise exception 'Unsupported invitation response';
  end if;

  select * into invitation
  from public.game_invitations
  where id = invitation_id
    and receiver_id = auth.uid()
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Invitation is no longer pending';
  end if;

  if response = 'accepted' then
    select max_players into lobby_capacity
    from public.game_lobbies
    where id = invitation.lobby_id
      and status = 'waiting'
    for update;

    if not found then
      raise exception 'Lobby is no longer waiting';
    end if;

    select count(*) into player_count
    from public.lobby_players
    where lobby_id = invitation.lobby_id;

    if player_count >= lobby_capacity then
      raise exception 'Lobby is full';
    end if;

    insert into public.lobby_players (lobby_id, user_id)
    values (invitation.lobby_id, auth.uid())
    on conflict (lobby_id, user_id) do nothing;
  end if;

  update public.game_invitations
  set status = response, updated_at = now()
  where id = invitation.id
  returning * into invitation;

  return invitation;
end;
$$;

revoke all on function public.respond_to_game_invitation(uuid, text) from public;
grant execute on function public.respond_to_game_invitation(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
