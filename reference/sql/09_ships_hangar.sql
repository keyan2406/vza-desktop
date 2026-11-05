create table public.ships (id bigint generated always as identity primary key, name text not null unique, manufacturer text not null, created_at timestamptz not null default now());
alter table public.ships enable row level security;
create policy "Eingeloggte dürfen Schiffe lesen" on public.ships for select to authenticated using (true);
create policy "Officer und Admin pflegen Schiffe" on public.ships for all to authenticated
  using (public.get_my_role() in ('officer', 'admin')) with check (public.get_my_role() in ('officer', 'admin'));
insert into public.ships (name, manufacturer) values ('Prospector','MISC'),('Cutlass Black','Drake');
create type public.ship_source as enum ('ingame', 'pledge');
create table public.hangar_ships (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ship_id bigint not null references public.ships(id),
  source public.ship_source not null default 'ingame',
  pledge_value_eur numeric(10,2) check (pledge_value_eur is null or pledge_value_eur >= 0),
  created_at timestamptz not null default now(),
  constraint pledge_value_only_for_pledge check (source = 'pledge' or pledge_value_eur is null));
create index on public.hangar_ships (user_id); create index on public.hangar_ships (ship_id);
alter table public.hangar_ships enable row level security;
create policy "Eingeloggte sehen alle Hangare" on public.hangar_ships for select to authenticated using (true);
create policy "Eigene Schiffe eintragen" on public.hangar_ships for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Eigene Schiffe ändern" on public.hangar_ships for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Eigene Schiffe löschen, Admin darf alle" on public.hangar_ships for delete to authenticated using (user_id = (select auth.uid()) or public.get_my_role() = 'admin');
