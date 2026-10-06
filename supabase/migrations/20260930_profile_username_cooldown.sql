alter table public.profiles
  add column if not exists last_username_change_at timestamptz;

create or replace function public.update_profile_display_name(new_display_name text)
returns table (display_name text, last_name_change_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := btrim(new_display_name);
  current_change_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if normalized_name is null or normalized_name = '' then
    raise exception 'display_name_required';
  end if;
  if char_length(normalized_name) > 14 then
    raise exception 'display_name_too_long';
  end if;

  select profile.last_name_change_at
    into current_change_at
    from public.profiles as profile
   where profile.id = auth.uid()
   for update;

  if not found then
    raise exception 'profile_not_found';
  end if;
  if current_change_at is not null and now() < current_change_at + interval '7 days' then
    raise exception 'name_change_cooldown';
  end if;
  if exists (
    select 1
      from public.profiles as other_profile
     where other_profile.id <> auth.uid()
       and lower(btrim(coalesce(other_profile.display_name, other_profile.username))) = lower(normalized_name)
  ) then
    raise exception 'display_name_taken';
  end if;

  update public.profiles as profile
     set display_name = normalized_name,
         last_name_change_at = now(),
         updated_at = now()
   where profile.id = auth.uid()
   returning profile.display_name, profile.last_name_change_at
        into display_name, last_name_change_at;

  return next;
exception
  when unique_violation then
    raise exception 'display_name_taken';
end;
$$;

revoke all on function public.update_profile_display_name(text) from public;
grant execute on function public.update_profile_display_name(text) to authenticated;

create or replace function public.update_profile_username(new_username text)
returns table (username text, last_username_change_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(regexp_replace(btrim(new_username), '^@+', ''));
  current_username text;
  current_change_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if normalized_username is null or normalized_username = '' then
    raise exception 'username_required';
  end if;
  if char_length(normalized_username) > 10 then
    raise exception 'username_too_long';
  end if;

  select profile.username, profile.last_username_change_at
    into current_username, current_change_at
    from public.profiles as profile
   where profile.id = auth.uid()
   for update;

  if not found then
    raise exception 'profile_not_found';
  end if;
  if lower(btrim(current_username)) = normalized_username then
    username := current_username;
    last_username_change_at := current_change_at;
    return next;
    return;
  end if;
  if current_change_at is not null and now() < current_change_at + interval '30 days' then
    raise exception 'username_change_cooldown';
  end if;
  if exists (
    select 1
      from public.profiles as other_profile
     where other_profile.id <> auth.uid()
       and lower(btrim(other_profile.username)) = normalized_username
  ) then
    raise exception 'username_taken';
  end if;

  update public.profiles as profile
     set username = normalized_username,
         last_username_change_at = now(),
         updated_at = now()
   where profile.id = auth.uid()
   returning profile.username, profile.last_username_change_at
        into username, last_username_change_at;

  return next;
exception
  when unique_violation then
    raise exception 'username_taken';
end;
$$;

revoke all on function public.update_profile_username(text) from public;
grant execute on function public.update_profile_username(text) to authenticated;

notify pgrst, 'reload schema';