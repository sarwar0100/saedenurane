create table if not exists public.profile_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_blocks_different_users check (blocker_id <> blocked_id),
  constraint profile_blocks_unique_pair unique (blocker_id, blocked_id)
);

alter table public.profile_blocks enable row level security;

drop policy if exists "Users can read their block relationships" on public.profile_blocks;
create policy "Users can read their block relationships"
on public.profile_blocks
for select
to authenticated
using (auth.uid() = blocker_id or auth.uid() = blocked_id);

drop policy if exists "Users can block profiles" on public.profile_blocks;
create policy "Users can block profiles"
on public.profile_blocks
for insert
to authenticated
with check (auth.uid() = blocker_id);

drop policy if exists "Users can remove their blocks" on public.profile_blocks;
create policy "Users can remove their blocks"
on public.profile_blocks
for delete
to authenticated
using (auth.uid() = blocker_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profile_blocks'
  ) then
    alter publication supabase_realtime add table public.profile_blocks;
  end if;
end
$$;

notify pgrst, 'reload schema';