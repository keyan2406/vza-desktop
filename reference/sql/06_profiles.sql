create type public.app_role as enum ('member', 'officer', 'admin');
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text, username text, avatar_url text,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create or replace function public.get_my_role() returns public.app_role language sql security definer stable set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, discord_id, username, avatar_url)
  values (new.id, new.raw_user_meta_data->>'provider_id',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Unbekannt'),
    new.raw_user_meta_data->>'avatar_url');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create policy "Eingeloggte dürfen Profile lesen" on public.profiles for select to authenticated using (true);
create policy "Nur Admins ändern Profile" on public.profiles for update to authenticated
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
