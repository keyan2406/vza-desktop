-- 1) Mitglieder sperren statt sofort löschen
alter table public.profiles add column blocked boolean not null default false;

-- Sperren: Zugang weg, Verlauf (Punkte, Hangar, Historie) bleibt erhalten
create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_approved boolean;
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin' then
    raise exception 'Keine Berechtigung';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'Du kannst dich nicht selbst sperren';
  end if;

  select role, approved into v_role, v_approved
  from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Benutzer nicht gefunden';
  end if;
  if not v_approved then
    raise exception 'Nur freigegebene Mitglieder können gesperrt werden';
  end if;
  if v_role = 'admin'
     and (select count(*) from public.profiles where role = 'admin' and approved) <= 1 then
    raise exception 'Der letzte Admin kann nicht gesperrt werden';
  end if;

  update public.profiles
     set approved = false, blocked = true, role = 'member'
   where id = p_user_id;

  -- Offene Anmeldungen und Claims gesperrter Mitglieder sollen niemanden mehr täuschen
  delete from public.event_signups s
   using public.events e
   where s.user_id = p_user_id and e.id = s.event_id and e.status = 'planned';
  delete from public.loot_claims c
   using public.loot_items i
   where c.user_id = p_user_id and c.status = 'pending'
     and i.id = c.item_id and i.status = 'released';
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin' then
    raise exception 'Keine Berechtigung';
  end if;
  update public.profiles set blocked = false, approved = true
   where id = p_user_id and blocked;
  if not found then
    raise exception 'Benutzer ist nicht gesperrt';
  end if;
end;
$$;

-- Endgültig löschen (z. B. auf Wunsch): nur gesperrte oder noch nicht freigegebene Konten
create or replace function public.delete_member(p_user_id uuid)
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
    raise exception 'Nur gesperrte oder offene Konten können gelöscht werden';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

-- Ablehnen betrifft nur neue Anfragen, nicht gesperrte Mitglieder
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
  if not exists (select 1 from public.profiles where id = p_user_id and not approved and not blocked) then
    raise exception 'Nur offene Anfragen können abgelehnt werden';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

-- 2) Operation bearbeiten (nur solange sie geplant ist)
create or replace function public.update_event(
  p_event_id bigint,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_min_players integer,
  p_points integer,
  p_ships jsonb,
  p_roles jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_role record;
  v_keep text[] := '{}';
begin
  if coalesce(public.get_my_role()::text, '') not in ('officer', 'admin') then
    raise exception 'Keine Berechtigung';
  end if;
  if p_title is null or char_length(btrim(p_title)) < 3 or char_length(btrim(p_title)) > 100 then
    raise exception 'Der Titel braucht 3 bis 100 Zeichen';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Operation nicht gefunden';
  end if;
  if v_event.status <> 'planned' then
    raise exception 'Nur geplante Operationen lassen sich bearbeiten';
  end if;

  update public.events
     set title = btrim(p_title),
         description = nullif(btrim(coalesce(p_description, '')), ''),
         starts_at = p_starts_at,
         min_players = p_min_players,
         points = p_points
   where id = p_event_id;

  -- Schiffe: einfach neu setzen
  delete from public.event_ship_requirements where event_id = p_event_id;
  insert into public.event_ship_requirements (event_id, ship_id, quantity)
  select p_event_id, s.ship_id, least(sum(s.qty), 100)::integer
  from (
    select (x->>'ship_id')::bigint as ship_id,
           coalesce((x->>'quantity')::integer, 1) as qty
    from jsonb_array_elements(coalesce(p_ships, '[]'::jsonb)) as x
  ) s
  group by s.ship_id;

  -- Rollen: bestehende behalten ihre Anmeldungen, neue kommen dazu, entfernte fallen weg
  for v_role in
    select min(btrim(x->>'name')) as name,
           least(sum(coalesce((x->>'quantity')::integer, 1)), 100)::integer as qty
    from jsonb_array_elements(coalesce(p_roles, '[]'::jsonb)) as x
    where btrim(coalesce(x->>'name', '')) <> ''
    group by lower(btrim(x->>'name'))
  loop
    update public.event_role_requirements
       set name = v_role.name, quantity = v_role.qty
     where event_id = p_event_id and lower(name) = lower(v_role.name);
    if not found then
      insert into public.event_role_requirements (event_id, name, quantity)
      values (p_event_id, v_role.name, v_role.qty);
    end if;
    v_keep := v_keep || lower(v_role.name);
  end loop;

  delete from public.event_role_requirements
   where event_id = p_event_id and lower(name) <> all (v_keep);

  return jsonb_build_object('time_changed', v_event.starts_at is distinct from p_starts_at);
end;
$$;

-- 3) Rechte
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.delete_member(uuid) from public, anon;
revoke all on function public.update_event(bigint, text, text, timestamptz, integer, integer, jsonb, jsonb) from public, anon;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.delete_member(uuid) to authenticated;
grant execute on function public.update_event(bigint, text, text, timestamptz, integer, integer, jsonb, jsonb) to authenticated;

-- 4) Freigeben gilt nur für neue Anfragen, gesperrte Konten gibt "unblock_user" wieder frei
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
  update public.profiles set approved = true where id = p_user_id and not blocked;
  if not found then
    raise exception 'Benutzer nicht gefunden';
  end if;
end;
$$;
