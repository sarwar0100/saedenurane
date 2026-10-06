alter table public.profiles enable row level security;

drop policy if exists "Authenticated users can read leaderboard profiles" on public.profiles;
drop policy if exists "Public profiles are readable" on public.profiles;
drop policy if exists "Users can read public leaderboard profiles" on public.profiles;

create policy "Users can read public leaderboard profiles"
on public.profiles
for select
to authenticated
using (
  not exists (
    select 1
    from public.profile_blocks
    where (profile_blocks.blocker_id = auth.uid() and profile_blocks.blocked_id = profiles.id)
       or (profile_blocks.blocker_id = profiles.id and profile_blocks.blocked_id = auth.uid())
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end
$$;

notify pgrst, 'reload schema';