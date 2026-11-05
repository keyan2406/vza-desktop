-- Erinnerungen: merken, was schon gesendet wurde
alter table public.events
  add column reminder_60_sent_at timestamptz,
  add column reminder_10_sent_at timestamptz,
  add column time_set_at timestamptz not null default now();

-- Ändert sich der Beginn, gelten die Erinnerungen von vorn
create or replace function public.reset_event_reminders()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reminder_60_sent_at := null;
  new.reminder_10_sent_at := null;
  new.time_set_at := now();
  return new;
end;
$$;

create trigger events_time_changed
  before update of starts_at on public.events
  for each row
  when (old.starts_at is distinct from new.starts_at)
  execute function public.reset_event_reminders();

-- Holt die fälligen Erinnerungen und markiert sie sofort als gesendet (keine Doppelten).
-- Nur der Service-Schlüssel der Seite darf das aufrufen.
create or replace function public.claim_due_reminders()
returns table (event_id bigint, kind text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with h1 as (
    update public.events e
       set reminder_60_sent_at = now()
     where e.id in (
       select x.id from public.events x
       where x.status = 'planned'
         and x.reminder_60_sent_at is null
         and x.starts_at > now() + interval '12 minutes'
         and x.starts_at <= now() + interval '60 minutes'
         -- keine Stunden-Erinnerung, wenn die Zeit erst kurz vorher festgelegt wurde
         and x.time_set_at <= x.starts_at - interval '61 minutes'
       for update skip locked
     )
     returning e.id
  ),
  m10 as (
    update public.events e
       set reminder_10_sent_at = now()
     where e.id in (
       select x.id from public.events x
       where x.status = 'planned'
         and x.reminder_10_sent_at is null
         and x.starts_at > now()
         and x.starts_at <= now() + interval '12 minutes'
       for update skip locked
     )
     returning e.id
  )
  select h1.id, 'h1'::text from h1
  union all
  select m10.id, 'm10'::text from m10;
end;
$$;

revoke all on function public.reset_event_reminders() from public, anon, authenticated;
revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;
