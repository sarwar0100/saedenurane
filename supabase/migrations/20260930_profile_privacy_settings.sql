alter table public.profiles
  add column if not exists hide_profile_details boolean not null default false,
  add column if not exists hide_following boolean not null default false,
  add column if not exists hide_city_age boolean not null default false,
  add column if not exists hide_online_status boolean not null default false,
  add column if not exists online boolean not null default true;

create or replace function public.update_profile_privacy_settings(
  new_online boolean,
  new_hide_profile_details boolean,
  new_hide_following boolean
)
returns table (
  online boolean,
  hide_profile_details boolean,
  hide_following boolean
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  changed_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  update public.profiles as profile
     set online = new_online,
         hide_profile_details = new_hide_profile_details,
         hide_following = new_hide_following,
         hide_city_age = new_hide_profile_details,
         hide_online_status = not new_online,
         updated_at = now()
   where profile.id = auth.uid()
   returning profile.* into changed_profile;

  if not found then
    raise exception 'profile_not_found';
  end if;

  online := changed_profile.online;
  hide_profile_details := changed_profile.hide_profile_details;
  hide_following := changed_profile.hide_following;
  return next;
end;
$function$;

revoke all on function public.update_profile_privacy_settings(boolean, boolean, boolean) from public;
grant execute on function public.update_profile_privacy_settings(boolean, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';