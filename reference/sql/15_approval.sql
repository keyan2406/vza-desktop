-- 1) Freigabe-Pflicht: neue Konten sind gesperrt, bis ein Admin sie freigibt
alter table public.profiles add column approved boolean not null default false;

-- Alle bisherigen Konten bleiben freigegeben
update public.profiles set approved = true;

create or replace function public.is_approved()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((select approved from public.profiles where id = (select auth.uid())), false)
$$;

-- Rolle gilt nur für freigegebene Konten
create or replace function public.get_my_role()
returns public.app_role
language sql
security definer
stable
set search_path = ''
as $$
  select case when approved then role end
  from public.profiles where id = (select auth.uid())
$$;

-- 2) Lesen nur für freigegebene Konten
alter policy "Eingeloggte dürfen Profile lesen" on public.profiles
  using (
    id = (select auth.uid())
    or (public.is_approved() and (approved or public.get_my_role() = 'admin'))
  );

alter policy "Eingeloggte dürfen Schiffe lesen" on public.ships using (public.is_approved());
alter policy "Eingeloggte sehen alle Hangare" on public.hangar_ships using (public.is_approved());
alter policy "Eingeloggte sehen Operationen" on public.events using (public.is_approved());
alter policy "Eingeloggte sehen Anmeldungen" on public.event_signups using (public.is_approved());
alter policy "Eingeloggte sehen das Punktebuch" on public.points_log using (public.is_approved());
alter policy "Eingeloggte sehen Level-Schwellen" on public.level_thresholds using (public.is_approved());
alter policy "Eingeloggte sehen benötigte Schiffe" on public.event_ship_requirements using (public.is_approved());
alter policy "Eingeloggte sehen benötigte Rollen" on public.event_role_requirements using (public.is_approved());
alter policy "Eingeloggte sehen den Loot" on public.loot_items using (public.is_approved());
alter policy "Eingeloggte sehen das Lager-Protokoll" on public.loot_log using (public.is_approved());
alter policy "Eingeloggte sehen Claims" on public.loot_claims using (public.is_approved());
alter policy "Eingeloggte sehen den Katalog" on public.blueprints using (public.is_approved());
alter policy "Eingeloggte sehen alle Blaupausen-Besitzer" on public.player_blueprints using (public.is_approved());

-- Eigene Schiffe nur für freigegebene Konten
alter policy "Eigene Schiffe eintragen" on public.hangar_ships
  with check (user_id = (select auth.uid()) and public.is_approved());
alter policy "Eigene Schiffe ändern" on public.hangar_ships
  using (user_id = (select auth.uid()) and public.is_approved())
  with check (user_id = (select auth.uid()) and public.is_approved());

-- Rangliste zeigt nur freigegebene Mitglieder
create or replace view public.player_stats
with (security_invoker = true) as
with totals as (
  select p.id, p.username,
         coalesce(sum(l.points), 0)::int as total_points,
         count(l.event_id)::int as ops_count
  from public.profiles p
  left join public.points_log l on l.user_id = p.id
  where p.approved
  group by p.id, p.username
)
select t.id as user_id,
       t.username,
       t.total_points,
       t.ops_count,
       coalesce(
         (select max(th.level) from public.level_thresholds th
          where th.min_points <= t.total_points),
         1
       ) as level
from totals t;

-- 3) Auch die Mitglieder-Funktionen verweigern nicht freigegebenen Konten den Dienst
create or replace function public.require_approved_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = new.user_id and approved
  ) then
    raise exception 'Konto noch nicht freigegeben';
  end if;
  return new;
end;
$$;

create trigger require_approved before insert on public.event_signups
  for each row execute function public.require_approved_user();
create trigger require_approved before insert on public.loot_claims
  for each row execute function public.require_approved_user();
create trigger require_approved before insert on public.player_blueprints
  for each row execute function public.require_approved_user();

-- 4) Admin: freigeben oder ablehnen
create or replace function public.approve_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin' then
    raise exception 'Keine Berechtigung';
  end if;
  update public.profiles set approved = true where id = p_user_id;
  if not found then
    raise exception 'Benutzer nicht gefunden';
  end if;
end;
$$;

-- Lehnt eine Anfrage ab und entfernt das noch nicht freigegebene Konto.
create or replace function public.reject_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin' then
    raise exception 'Keine Berechtigung';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and not approved) then
    raise exception 'Nur offene Anfragen können abgelehnt werden';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

-- 5) Rechte aufräumen: Fremde ohne Login brauchen keine dieser Funktionen
revoke all on function public.is_approved() from public, anon;
revoke all on function public.approve_user(uuid) from public, anon;
revoke all on function public.reject_user(uuid) from public, anon;
revoke all on function public.require_approved_user() from public, anon, authenticated;
revoke all on function public.get_my_role() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.is_approved() to authenticated;
grant execute on function public.approve_user(uuid) to authenticated;
grant execute on function public.reject_user(uuid) to authenticated;
grant execute on function public.get_my_role() to authenticated;

-- 6) Auch den Anzeigenamen dürfen nur freigegebene Konten ändern
create or replace function public.set_display_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet';
  end if;
  if not public.is_approved() then
    raise exception 'Konto noch nicht freigegeben';
  end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 32 then
    raise exception 'Der Name braucht 2 bis 32 Zeichen';
  end if;
  if exists (
    select 1 from public.profiles
    where lower(username) = lower(v_name) and id <> v_uid
  ) then
    raise exception 'Dieser Name ist bereits vergeben';
  end if;
  update public.profiles set username = v_name where id = v_uid;
end;
$$;
