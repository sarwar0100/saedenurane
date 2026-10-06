create table if not exists public.game_lobbies (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  max_players smallint not null default 4 check (max_players between 2 and 4),
  created_at timestamptz not null default now()
);

create table if not exists public.lobby_players (
  lobby_id uuid not null references public.game_lobbies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);

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

create index if not exists game_invitations_receiver_status_created_idx
  on public.game_invitations (receiver_id, status, created_at desc);
create index if not exists game_invitations_sender_status_updated_idx
  on public.game_invitations (sender_id, status, updated_at desc);
create index if not exists lobby_players_user_id_idx
  on public.lobby_players (user_id, joined_at);

alter table public.game_lobbies enable row level security;
alter table public.lobby_players enable row level security;
alter table public.game_invitations enable row level security;

create or replace function public.is_game_lobby_participant(target_lobby_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lobby_players
    where lobby_id = target_lobby_id and user_id = target_user_id
  );
$$;

revoke all on function public.is_game_lobby_participant(uuid, uuid) from public;
grant execute on function public.is_game_lobby_participant(uuid, uuid) to authenticated;

drop policy if exists "Lobby participants and invitees can read lobbies" on public.game_lobbies;
create policy "Lobby participants and invitees can read lobbies"
on public.game_lobbies for select to authenticated
using (
  host_id = auth.uid()
  or public.is_game_lobby_participant(id, auth.uid())
  or exists (
    select 1 from public.game_invitations invitation
    where invitation.lobby_id = id
      and invitation.receiver_id = auth.uid()
      and invitation.status in ('pending', 'accepted')
  )
);

drop policy if exists "Users create own hosted lobbies" on public.game_lobbies;
create policy "Users create own hosted lobbies"
on public.game_lobbies for insert to authenticated
with check (host_id = auth.uid());

drop policy if exists "Hosts update lobbies" on public.game_lobbies;
create policy "Hosts update lobbies"
on public.game_lobbies for update to authenticated
using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists "Hosts delete lobbies" on public.game_lobbies;
create policy "Hosts delete lobbies"
on public.game_lobbies for delete to authenticated
using (host_id = auth.uid());

drop policy if exists "Participants and invitees read lobby players" on public.lobby_players;
create policy "Participants and invitees read lobby players"
on public.lobby_players for select to authenticated
using (
  public.is_game_lobby_participant(lobby_id, auth.uid())
  or exists (
    select 1 from public.game_invitations invitation
    where invitation.lobby_id = lobby_players.lobby_id
      and invitation.receiver_id = auth.uid()
      and invitation.status in ('pending', 'accepted')
  )
);

drop policy if exists "Users join own hosted or accepted lobbies" on public.lobby_players;
create policy "Users join own hosted or accepted lobbies"
on public.lobby_players for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    exists (
      select 1 from public.game_lobbies lobby
      where lobby.id = lobby_id and lobby.host_id = auth.uid()
    )
    or exists (
      select 1 from public.game_invitations invitation
      where invitation.lobby_id = lobby_players.lobby_id
        and invitation.receiver_id = auth.uid()
        and invitation.status = 'accepted'
    )
  )
);

drop policy if exists "Users update own lobby readiness" on public.lobby_players;
create policy "Users update own lobby readiness"
on public.lobby_players for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users or hosts remove lobby players" on public.lobby_players;
create policy "Users or hosts remove lobby players"
on public.lobby_players for delete to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.game_lobbies lobby
    where lobby.id = lobby_id and lobby.host_id = auth.uid()
  )
);

drop policy if exists "Invitation participants read invitations" on public.game_invitations;
create policy "Invitation participants read invitations"
on public.game_invitations for select to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "Lobby participants invite friends" on public.game_invitations;
create policy "Lobby participants invite friends"
on public.game_invitations for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.lobby_players member
    where member.lobby_id = game_invitations.lobby_id
      and member.user_id = auth.uid()
  )
  and exists (
    select 1 from public.friend_requests friendship
    where friendship.status = 'accepted'
      and (
        (friendship.sender_id = auth.uid() and friendship.receiver_id = game_invitations.receiver_id)
        or (friendship.receiver_id = auth.uid() and friendship.sender_id = game_invitations.receiver_id)
      )
  )
  and not exists (
    select 1 from public.profile_blocks block
    where (block.blocker_id = auth.uid() and block.blocked_id = game_invitations.receiver_id)
       or (block.blocker_id = game_invitations.receiver_id and block.blocked_id = auth.uid())
  )
);

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
  where id = invitation_id and receiver_id = auth.uid() and status = 'pending'
  for update;

  if not found then
    raise exception 'Invitation is no longer pending';
  end if;

  if response = 'accepted' then
    select max_players into lobby_capacity
    from public.game_lobbies where id = invitation.lobby_id for update;

    select count(*) into player_count
    from public.lobby_players where lobby_id = invitation.lobby_id;

    if player_count >= lobby_capacity then
      raise exception 'Lobby is full';
    end if;

    insert into public.lobby_players (lobby_id, user_id, ready)
    values (invitation.lobby_id, auth.uid(), false)
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

grant select, insert, update, delete on public.game_lobbies to authenticated;
grant select, insert, delete on public.lobby_players to authenticated;
revoke update on public.lobby_players from authenticated;
grant update (ready) on public.lobby_players to authenticated;
grant select, insert on public.game_invitations to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_lobbies') then
    alter publication supabase_realtime add table public.game_lobbies;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lobby_players') then
    alter publication supabase_realtime add table public.lobby_players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_invitations') then
    alter publication supabase_realtime add table public.game_invitations;
  end if;
end
$$;