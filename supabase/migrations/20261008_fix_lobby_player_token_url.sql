begin;

alter table public.lobby_players
  add column if not exists token_url text;

drop policy if exists "Users update own lobby readiness" on public.lobby_players;
drop policy if exists "Users update own lobby token" on public.lobby_players;
create policy "Users update own lobby token"
on public.lobby_players for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke update on public.lobby_players from authenticated;
grant update (token_url) on public.lobby_players to authenticated;

notify pgrst, 'reload schema';

commit;
