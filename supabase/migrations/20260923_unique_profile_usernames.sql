do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'profiles_username_key'
			and conrelid = 'public.profiles'::regclass
	) then
		alter table public.profiles
			add constraint profiles_username_key unique (username);
	end if;
end
$$;

create unique index if not exists profiles_username_unique_idx
on public.profiles (lower(btrim(username)));
