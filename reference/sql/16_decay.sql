-- 1) Inaktivität: Wer 30 Tage an keiner Operation teilnimmt, verliert 1 Level
create table public.maintenance_runs (
  name text primary key,
  last_run timestamptz not null
);

alter table public.maintenance_runs enable row level security;

create or replace function public.apply_inactivity_decay()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select ps.user_id, ps.total_points, ps.level, th.min_points
    from public.player_stats ps
    join public.level_thresholds th on th.level = ps.level
    join public.profiles p on p.id = ps.user_id
    where ps.level > 1
      and greatest(
            p.created_at,
            coalesce((
              select max(coalesce(e.finished_at, e.starts_at))
              from public.event_signups s
              join public.events e on e.id = s.event_id
              where s.user_id = p.id and s.attended
            ), 'epoch'::timestamptz),
            coalesce((
              select max(l.created_at)
              from public.points_log l
              where l.user_id = p.id and l.event_id is null and l.points < 0
            ), 'epoch'::timestamptz)
          ) <= now() - interval '30 days'
  loop
    -- Auf den höchsten Punktestand des Levels darunter setzen
    insert into public.points_log (user_id, event_id, points, reason)
    values (v_row.user_id, null, (v_row.min_points - 1) - v_row.total_points,
            'Inaktivität: 1 Level verloren');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Läuft höchstens einmal am Tag, wenn jemand die Seite benutzt (kein Zeitplan nötig)
create or replace function public.run_daily_maintenance()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ran boolean;
begin
  if not public.is_approved() then
    return false;
  end if;

  insert into public.maintenance_runs (name, last_run)
  values ('inactivity_decay', now() - interval '2 days')
  on conflict (name) do nothing;

  update public.maintenance_runs
     set last_run = now()
   where name = 'inactivity_decay'
     and last_run < now() - interval '20 hours'
  returning true into v_ran;

  if coalesce(v_ran, false) then
    perform public.apply_inactivity_decay();
  end if;

  return coalesce(v_ran, false);
end;
$$;

-- 2) Meldung an Admins bei neuen Freigabe-Anfragen (genau einmal pro Konto)
alter table public.profiles add column pending_notified boolean not null default false;
update public.profiles set pending_notified = true;

create or replace function public.claim_pending_notice()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first boolean;
begin
  update public.profiles
     set pending_notified = true
   where id = (select auth.uid())
     and not approved
     and not pending_notified
  returning true into v_first;
  return coalesce(v_first, false);
end;
$$;

-- 3) Rechte
revoke all on function public.apply_inactivity_decay() from public, anon, authenticated;
revoke all on function public.run_daily_maintenance() from public, anon;
revoke all on function public.claim_pending_notice() from public, anon;
grant execute on function public.run_daily_maintenance() to authenticated;
grant execute on function public.claim_pending_notice() to authenticated;
