alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz not null default now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public profile avatars are readable'
  ) then
    create policy "Public profile avatars are readable"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'profile-avatars');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload their profile avatars'
  ) then
    create policy "Users can upload their profile avatars"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update their profile avatars'
  ) then
    create policy "Users can update their profile avatars"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete their profile avatars'
  ) then
    create policy "Users can delete their profile avatars"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;

create or replace function public.update_profile_avatar(new_avatar_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_avatar_url text;
  expected_path text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  expected_path := format('/storage/v1/object/public/profile-avatars/%s/', auth.uid());
  if new_avatar_url is null
     or char_length(new_avatar_url) > 2048
     or position(expected_path in new_avatar_url) = 0 then
    raise exception 'avatar_url_invalid';
  end if;

  update public.profiles as profile
     set avatar_url = new_avatar_url,
         updated_at = now()
   where profile.id = auth.uid()
   returning profile.avatar_url into saved_avatar_url;

  if not found then
    raise exception 'profile_not_found';
  end if;

  return saved_avatar_url;
end;
$$;

revoke all on function public.update_profile_avatar(text) from public;
grant execute on function public.update_profile_avatar(text) to authenticated;

notify pgrst, 'reload schema';