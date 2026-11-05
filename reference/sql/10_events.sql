create type public.event_status as enum ('planned', 'running', 'finished', 'cancelled');
create table public.events (
  id bigint generated always as identity primary key, title text not null, description text,
  starts_at timestamptz not null, min_players integer not null default 1 check (min_players >= 0),
  required_roles text, points integer not null default 10 check (points >= 0),
  status public.event_status not null default 'planned',
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), finished_at timestamptz);
alter table public.events enable row level security;
create policy "Eingeloggte sehen Operationen" on public.events for select to authenticated using (true);
create policy "Officer und Admin legen Operationen an" on public.events for insert to authenticated with check (public.get_my_role() in ('officer', 'admin') and created_by = (select auth.uid()));
create policy "Officer und Admin ändern Operationen" on public.events for update to authenticated using (public.get_my_role() in ('officer', 'admin')) with check (public.get_my_role() in ('officer', 'admin'));
create policy "Officer und Admin löschen Operationen" on public.events for delete to authenticated using (public.get_my_role() in ('officer', 'admin'));
create table public.event_signups (
  event_id bigint not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attended boolean not null default false, signed_up_at timestamptz not null default now(),
  primary key (event_id, user_id));
create index on public.event_signups (user_id);
alter table public.event_signups enable row level security;
create policy "Eingeloggte sehen Anmeldungen" on public.event_signups for select to authenticated using (true);
create policy "Selbst anmelden, solange geplant" on public.event_signups for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.events e where e.id = event_id and e.status = 'planned'));
create policy "Selbst abmelden, solange geplant" on public.event_signups for delete to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.events e where e.id = event_id and e.status = 'planned'));
create table public.points_log (id bigint generated always as identity primary key, user_id uuid not null references public.profiles(id) on delete cascade, event_id bigint references public.events(id) on delete set null, points integer not null, reason text not null, created_at timestamptz not null default now());
create index on public.points_log (user_id);
create unique index points_log_one_per_event on public.points_log (user_id, event_id) where event_id is not null;
alter table public.points_log enable row level security;
create policy "Eingeloggte sehen das Punktebuch" on public.points_log for select to authenticated using (true);
create table public.level_thresholds (level integer primary key, min_points integer not null);
alter table public.level_thresholds enable row level security;
create policy "Eingeloggte sehen Level-Schwellen" on public.level_thresholds for select to authenticated using (true);
create policy "Admin pflegt Level-Schwellen" on public.level_thresholds for all to authenticated using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
insert into public.level_thresholds (level, min_points) values (1, 0), (2, 30), (3, 70), (4, 120), (5, 180), (6, 250), (7, 330), (8, 420), (9, 520), (10, 640);
create view public.player_stats with (security_invoker = true) as
with totals as (
  select p.id, p.username, coalesce(sum(l.points), 0)::int as total_points, count(l.event_id)::int as ops_count
  from public.profiles p left join public.points_log l on l.user_id = p.id group by p.id, p.username)
select t.id as user_id, t.username, t.total_points, t.ops_count,
  coalesce((select max(th.level) from public.level_thresholds th where th.min_points <= t.total_points), 1) as level
from totals t;
create or replace function public.finish_event(p_event_id bigint, p_attendees uuid[]) returns integer language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype; v_count integer;
begin
  if coalesce(public.get_my_role()::text, '') not in ('officer', 'admin') then raise exception 'Keine Berechtigung'; end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Operation nicht gefunden'; end if;
  if v_event.status = 'finished' then raise exception 'Operation ist bereits abgeschlossen'; end if;
  if v_event.status = 'cancelled' then raise exception 'Operation wurde abgesagt'; end if;
  insert into public.event_signups (event_id, user_id, attended) select p_event_id, u, true from unnest(p_attendees) as u where exists (select 1 from public.profiles pr where pr.id = u) on conflict (event_id, user_id) do update set attended = true;
  update public.event_signups set attended = false where event_id = p_event_id and user_id <> all (p_attendees);
  insert into public.points_log (user_id, event_id, points, reason) select s.user_id, p_event_id, v_event.points, 'Teilnahme: ' || v_event.title from public.event_signups s where s.event_id = p_event_id and s.attended;
  get diagnostics v_count = row_count;
  update public.events set status = 'finished', finished_at = now() where id = p_event_id;
  return v_count;
end; $$;
revoke all on function public.finish_event(bigint, uuid[]) from public, anon;
grant execute on function public.finish_event(bigint, uuid[]) to authenticated;
