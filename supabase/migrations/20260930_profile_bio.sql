alter table public.profiles
  add column if not exists bio text,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.update_profile_bio(new_bio text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_bio text := coalesce(new_bio, '');
  saved_bio text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if char_length(normalized_bio) > 30 then
    raise exception 'bio_too_long';
  end if;

  update public.profiles as profile
     set bio = normalized_bio,
         updated_at = now()
   where profile.id = auth.uid()
   returning profile.bio into saved_bio;

  if not found then
    raise exception 'profile_not_found';
  end if;

  return saved_bio;
end;
$$;

revoke all on function public.update_profile_bio(text) from public;
grant execute on function public.update_profile_bio(text) to authenticated;

notify pgrst, 'reload schema';
