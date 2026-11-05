\restrict SZtSZHKNNoKjhM7SOxLEw3wo8phXey1EHHtdPKPINwKEw5WzqhOt9fbXBgojooG
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
CREATE SCHEMA public;
ALTER SCHEMA public OWNER TO pg_database_owner;
COMMENT ON SCHEMA public IS 'standard public schema';
CREATE TYPE public.app_role AS ENUM (
    'member',
    'officer',
    'admin'
);
ALTER TYPE public.app_role OWNER TO postgres;
CREATE TYPE public.event_status AS ENUM (
    'planned',
    'running',
    'finished',
    'cancelled'
);
ALTER TYPE public.event_status OWNER TO postgres;
CREATE TYPE public.loot_location AS ENUM (
    'player',
    'vizsla_bank'
);
ALTER TYPE public.loot_location OWNER TO postgres;
CREATE TYPE public.loot_status AS ENUM (
    'locked',
    'released',
    'sold',
    'awarded'
);
ALTER TYPE public.loot_status OWNER TO postgres;
CREATE TYPE public.ship_source AS ENUM (
    'ingame',
    'pledge'
);
ALTER TYPE public.ship_source OWNER TO postgres;
CREATE FUNCTION public._craft_close(p_uid uuid, p_id bigint, p_action text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_role public.app_role;
  v_req public.craft_requests%rowtype;
  v_staff boolean;
begin
  select role into v_role from public.profiles where id = p_uid and approved;
  if not found then
    return jsonb_build_object('status', 'not_member');
  end if;
  v_staff := v_role in ('officer', 'admin');
  select * into v_req from public.craft_requests where id = p_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_req.status in ('done', 'cancelled') then
    return jsonb_build_object('status', 'closed', 'request_status', v_req.status);
  end if;
  if p_action = 'done' then
    if not (p_uid = v_req.requester_id or p_uid = v_req.taker_id or v_staff) then
      return jsonb_build_object('status', 'forbidden');
    end if;
    update public.craft_requests set status = 'done', updated_at = now() where id = p_id;
  elsif p_action = 'cancel' then
    if not (p_uid = v_req.requester_id or v_staff) then
      return jsonb_build_object('status', 'forbidden');
    end if;
    update public.craft_requests set status = 'cancelled', updated_at = now() where id = p_id;
  elsif p_action = 'release' then
    if v_req.status <> 'taken' or p_uid is distinct from v_req.taker_id then
      return jsonb_build_object('status', 'forbidden');
    end if;
    update public.craft_requests set status = 'open', taker_id = null, updated_at = now() where id = p_id;
  else
    return jsonb_build_object('status', 'bad_action');
  end if;
  return jsonb_build_object('status', 'ok', 'id', p_id, 'action', p_action);
end;
$$;
ALTER FUNCTION public._craft_close(p_uid uuid, p_id bigint, p_action text) OWNER TO postgres;
CREATE FUNCTION public._craft_create(p_uid uuid, p_blueprint_id bigint, p_qty integer, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_me record;
  v_bp record;
  v_existing bigint;
  v_open integer;
  v_owners jsonb;
  v_id bigint;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 200), '');
begin
  select id, username, discord_id into v_me from public.profiles where id = p_uid and approved;
  if not found then
    return jsonb_build_object('status', 'not_member');
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then
    return jsonb_build_object('status', 'bad_qty');
  end if;
  select id, name into v_bp from public.blueprints where id = p_blueprint_id;
  if not found then
    return jsonb_build_object('status', 'no_blueprint');
  end if;
  if exists (select 1 from public.player_blueprints where user_id = p_uid and blueprint_id = p_blueprint_id) then
    return jsonb_build_object('status', 'own', 'blueprint_name', v_bp.name);
  end if;
  select id into v_existing from public.craft_requests
   where requester_id = p_uid and blueprint_id = p_blueprint_id and status in ('open', 'taken') limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'exists', 'id', v_existing, 'blueprint_name', v_bp.name);
  end if;
  select count(*) into v_open from public.craft_requests
   where requester_id = p_uid and status in ('open', 'taken');
  if v_open >= 5 then
    return jsonb_build_object('status', 'too_many');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'discord_id', p.discord_id)
                            order by p.username), '[]'::jsonb)
    into v_owners
  from public.player_blueprints pb
  join public.profiles p on p.id = pb.user_id
  where pb.blueprint_id = p_blueprint_id and p.approved;
  if jsonb_array_length(v_owners) = 0 then
    return jsonb_build_object('status', 'no_owners', 'blueprint_name', v_bp.name);
  end if;
  insert into public.craft_requests (blueprint_id, requester_id, qty, note)
  values (p_blueprint_id, p_uid, p_qty, v_note)
  returning id into v_id;
  return jsonb_build_object(
    'status', 'ok', 'id', v_id, 'blueprint_id', v_bp.id, 'blueprint_name', v_bp.name,
    'qty', p_qty, 'note', v_note,
    'requester', jsonb_build_object('id', v_me.id, 'username', v_me.username, 'discord_id', v_me.discord_id),
    'owners', v_owners
  );
end;
$$;
ALTER FUNCTION public._craft_create(p_uid uuid, p_blueprint_id bigint, p_qty integer, p_note text) OWNER TO postgres;
CREATE FUNCTION public._craft_take(p_uid uuid, p_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_req public.craft_requests%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_uid and approved) then
    return jsonb_build_object('status', 'not_member');
  end if;
  select * into v_req from public.craft_requests where id = p_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_req.status <> 'open' then
    return jsonb_build_object('status', 'closed', 'request_status', v_req.status);
  end if;
  if v_req.requester_id = p_uid then
    return jsonb_build_object('status', 'own_request');
  end if;
  if not exists (select 1 from public.player_blueprints where user_id = p_uid and blueprint_id = v_req.blueprint_id) then
    return jsonb_build_object('status', 'not_owner');
  end if;
  update public.craft_requests set status = 'taken', taker_id = p_uid, updated_at = now() where id = p_id;
  return jsonb_build_object('status', 'ok', 'id', p_id);
end;
$$;
ALTER FUNCTION public._craft_take(p_uid uuid, p_id bigint) OWNER TO postgres;
CREATE FUNCTION public._try(p_id uuid, p_provider text, p_meta jsonb) RETURNS text
    LANGUAGE plpgsql
    AS $$
begin
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values (p_id, p_id::text || '@vza.invalid', p_meta, case when p_provider is null then '{}'::jsonb else jsonb_build_object('provider', p_provider) end);
  return 'angelegt';
exception when others then return 'abgelehnt: ' || sqlerrm; end $$;
ALTER FUNCTION public._try(p_id uuid, p_provider text, p_meta jsonb) OWNER TO postgres;
CREATE FUNCTION public._u(n integer) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    AS $$ select ('00000000-0000-0000-0000-00000000' || lpad(n::text, 4, '0'))::uuid $$;
ALTER FUNCTION public._u(n integer) OWNER TO postgres;
CREATE FUNCTION public.add_my_blueprints(p_items jsonb, p_source text DEFAULT 'import'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_received integer;
  v_clean jsonb;
  v_clean_count integer;
  v_new_catalog integer;
  v_added integer;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet';
  end if;
  if p_source not in ('manual', 'import') then
    raise exception 'Ungültige Quelle';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Ungültige Daten';
  end if;
  v_received := jsonb_array_length(p_items);
  if v_received > 2000 then
    raise exception 'Zu viele Einträge (maximal 2000)';
  end if;
  -- Bereinigen: Namen prüfen, Personennamen aus den Logs ausfiltern, Doppelte entfernen
  select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'ini', c.ini, 'at', c.at)), '[]'::jsonb)
    into v_clean
  from (
    select distinct on (lower(btrim(x.value->>'name')))
           btrim(x.value->>'name') as name,
           nullif(btrim(coalesce(x.value->>'ini', '')), '') as ini,
           case when (x.value->>'at') ~ '^\d{4}-\d{2}-\d{2}T' then (x.value->>'at')::timestamptz end as at
    from jsonb_array_elements(p_items) as x
    where jsonb_typeof(x.value) = 'object'
      and char_length(btrim(coalesce(x.value->>'name', ''))) between 1 and 120
      and coalesce(x.value->>'ini', '') !~* '^Human_'
    order by lower(btrim(x.value->>'name')),
             (nullif(btrim(coalesce(x.value->>'ini', '')), '') is null),
             case when (x.value->>'at') ~ '^\d{4}-\d{2}-\d{2}T' then (x.value->>'at')::timestamptz end nulls last
  ) c;
  v_clean_count := jsonb_array_length(v_clean);
  with ins as (
    insert into public.blueprints (name, ini_key)
    select t.name, left(t.ini, 150)
    from jsonb_to_recordset(v_clean) as t(name text, ini text, at timestamptz)
    on conflict (name_norm) do update
      set ini_key = excluded.ini_key
      where public.blueprints.ini_key is null and excluded.ini_key is not null
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_new_catalog from ins;
  insert into public.player_blueprints (user_id, blueprint_id, acquired_at, source)
  select v_uid, b.id, t.at, p_source
  from jsonb_to_recordset(v_clean) as t(name text, ini text, at timestamptz)
  join public.blueprints b on b.name_norm = lower(btrim(t.name))
  on conflict (user_id, blueprint_id) do nothing;
  get diagnostics v_added = row_count;
  return jsonb_build_object(
    'received', v_received,
    'skipped', v_received - v_clean_count,
    'new_in_catalog', v_new_catalog,
    'added', v_added,
    'already_owned', v_clean_count - v_added
  );
end;
$$;
ALTER FUNCTION public.add_my_blueprints(p_items jsonb, p_source text) OWNER TO postgres;
CREATE FUNCTION public.admin_create_password_reset(p_user_id uuid, p_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_p record;
  v_exp timestamptz := now() + interval '15 minutes';
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin' then
    raise exception 'Keine Berechtigung';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'bad_hash');
  end if;
  select id, username, login_name, blocked into v_p from public.profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_p.blocked then
    return jsonb_build_object('status', 'blocked');
  end if;
  delete from public.password_reset_codes where expires_at < now();
  insert into public.password_reset_codes (user_id, code_hash, source, created_at, expires_at)
  values (v_p.id, p_hash, 'admin', now(), v_exp)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, source = excluded.source, created_at = now(), expires_at = excluded.expires_at;
  return jsonb_build_object('status', 'ok', 'username', v_p.username, 'login_name', v_p.login_name, 'expires_at', v_exp);
exception when unique_violation then
  return jsonb_build_object('status', 'retry');
end;
$_$;
ALTER FUNCTION public.admin_create_password_reset(p_user_id uuid, p_hash text) OWNER TO postgres;
CREATE FUNCTION public.apply_inactivity_decay() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.apply_inactivity_decay() OWNER TO postgres;
CREATE FUNCTION public.approve_user(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.approve_user(p_user_id uuid) OWNER TO postgres;
CREATE FUNCTION public.award_loot(p_item_id bigint, p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_item public.loot_items%rowtype;
  v_name text;
begin
  if coalesce(public.get_my_role()::text, '') not in ('officer', 'admin') then
    raise exception 'Keine Berechtigung';
  end if;
  select * into v_item from public.loot_items where id = p_item_id for update;
  if not found then
    raise exception 'Objekt nicht gefunden';
  end if;
  if v_item.status <> 'released' then
    raise exception 'Objekt ist nicht freigegeben';
  end if;
  if not exists (
    select 1 from public.loot_claims
    where item_id = p_item_id and user_id = p_user_id and status = 'pending'
  ) then
    raise exception 'Dieser Spieler hat keinen Claim gesetzt';
  end if;
  update public.loot_claims
     set status = case when user_id = p_user_id then 'won' else 'lost' end
   where item_id = p_item_id;
  update public.loot_items
     set status = 'awarded', winner_id = p_user_id
   where id = p_item_id;
  select username into v_name from public.profiles where id = p_user_id;
  insert into public.loot_log (item_id, user_id, action, detail)
  values (p_item_id, (select auth.uid()), 'awarded',
          'Zugeteilt an ' || coalesce(v_name, 'Unbekannt'));
end;
$$;
ALTER FUNCTION public.award_loot(p_item_id bigint, p_user_id uuid) OWNER TO postgres;
CREATE FUNCTION public.block_user(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.block_user(p_user_id uuid) OWNER TO postgres;
CREATE FUNCTION public.cancel_award(p_item_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_item public.loot_items%rowtype;
begin
  if coalesce(public.get_my_role()::text, '') not in ('officer', 'admin') then
    raise exception 'Keine Berechtigung';
  end if;
  select * into v_item from public.loot_items where id = p_item_id for update;
  if not found then
    raise exception 'Objekt nicht gefunden';
  end if;
  if v_item.status <> 'awarded' then
    raise exception 'Objekt ist nicht zugeteilt';
  end if;
  delete from public.loot_claims where item_id = p_item_id and status = 'won';
  update public.loot_claims set status = 'pending'
   where item_id = p_item_id and status = 'lost';
  update public.loot_items
     set status = 'released', winner_id = null
   where id = p_item_id;
  insert into public.loot_log (item_id, user_id, action, detail)
  values (p_item_id, (select auth.uid()), 'award_cancelled',
          'Zuteilung aufgehoben, Objekt ist wieder frei');
end;
$$;
ALTER FUNCTION public.cancel_award(p_item_id bigint) OWNER TO postgres;
CREATE FUNCTION public.catalog_org_overview() RETURNS TABLE(blueprint_id bigint, name_norm text, owners integer, mine boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select b.id,
         b.name_norm,
         count(p.id)::integer,
         coalesce(bool_or(pb.user_id = (select auth.uid())), false)
  from public.blueprints b
  left join public.player_blueprints pb on pb.blueprint_id = b.id
  left join public.profiles p on p.id = pb.user_id and p.approved
  where (select public.is_approved())
  group by b.id, b.name_norm
$$;
ALTER FUNCTION public.catalog_org_overview() OWNER TO postgres;
CREATE FUNCTION public.check_invite_code(p_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.invite_codes
    where code = upper(btrim(coalesce(p_code, '')))
      and not revoked
      and uses < max_uses
      and (expires_at is null or expires_at > now())
  );
$$;
ALTER FUNCTION public.check_invite_code(p_code text) OWNER TO postgres;
CREATE FUNCTION public.claim_due_reminders() RETURNS TABLE(event_id bigint, kind text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.claim_due_reminders() OWNER TO postgres;
CREATE FUNCTION public.claim_loot(p_item_id bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.loot_status;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet';
  end if;
  select status into v_status from public.loot_items where id = p_item_id for update;
  if not found then
    raise exception 'Objekt nicht gefunden';
  end if;
  if v_status <> 'released' then
    raise exception 'Dieses Objekt kann nicht geclaimt werden';
  end if;
  if exists (
    select 1 from public.loot_claims where item_id = p_item_id and user_id = v_uid
  ) then
    raise exception 'Du hast dieses Objekt bereits geclaimt';
  end if;
  select username into v_name from public.profiles where id = v_uid;
  insert into public.loot_claims (item_id, user_id) values (p_item_id, v_uid);
  insert into public.loot_log (item_id, user_id, action, detail)
  values (p_item_id, v_uid, 'claimed', 'Claim von ' || coalesce(v_name, 'Unbekannt'));
  return 'pending';
end;
$$;
ALTER FUNCTION public.claim_loot(p_item_id bigint) OWNER TO postgres;
CREATE FUNCTION public.claim_pending_notice() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.claim_pending_notice() OWNER TO postgres;
CREATE FUNCTION public.close_craft_request(p_id bigint, p_action text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public._craft_close((select auth.uid()), p_id, p_action);
$$;
ALTER FUNCTION public.close_craft_request(p_id bigint, p_action text) OWNER TO postgres;
CREATE FUNCTION public.confirm_payment(p_item_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_item public.loot_items%rowtype;
  v_buyer text;
begin
  if coalesce(public.get_my_role()::text, '') not in ('officer', 'admin') then
    raise exception 'Keine Berechtigung';
  end if;
  select * into v_item from public.loot_items where id = p_item_id for update;
  if not found then
    raise exception 'Objekt nicht gefunden';
  end if;
  if v_item.status <> 'awarded' or v_item.winner_id is null then
    raise exception 'Objekt ist nicht zugeteilt';
  end if;
  select username into v_buyer from public.profiles where id = v_item.winner_id;
  update public.loot_items
     set status = 'sold', sold_at = now()
   where id = p_item_id;
  insert into public.cash_ledger
    (item_id, item_name, quantity, buyer_id, buyer_name, amount_auec, confirmed_by)
  values
    (p_item_id, v_item.name, v_item.quantity, v_item.winner_id,
     coalesce(v_buyer, 'Unbekannt'), coalesce(v_item.price_auec, 0), (select auth.uid()));
  insert into public.loot_log (item_id, user_id, action, detail)
  values (p_item_id, (select auth.uid()), 'sold',
          'Zahlung bestätigt: ' || coalesce(v_item.price_auec, 0) || ' aUEC von '
          || coalesce(v_buyer, 'Unbekannt') || '. Aus dem Lager ausgebucht');
end;
$$;
ALTER FUNCTION public.confirm_payment(p_item_id bigint) OWNER TO postgres;
CREATE FUNCTION public.consume_password_reset(p_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid;
begin
  delete from public.password_reset_codes c
   using public.profiles p
   where c.code_hash = p_hash and c.expires_at > now() and p.id = c.user_id and not p.blocked
   returning c.user_id into v_uid;
  if v_uid is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'user_id', v_uid);
end;
$$;
ALTER FUNCTION public.consume_password_reset(p_hash text) OWNER TO postgres;
CREATE FUNCTION public.create_craft_request(p_blueprint_id bigint, p_qty integer DEFAULT 1, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public._craft_create((select auth.uid()), p_blueprint_id, p_qty, p_note);
$$;
ALTER FUNCTION public.create_craft_request(p_blueprint_id bigint, p_qty integer, p_note text) OWNER TO postgres;
CREATE FUNCTION public.create_event(p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id bigint;
begin
  if coalesce(public.get_my_role()::text, '') not in ('officer', 'admin') then
    raise exception 'Keine Berechtigung';
  end if;
  if p_title is null or char_length(btrim(p_title)) < 3 or char_length(btrim(p_title)) > 100 then
    raise exception 'Der Titel braucht 3 bis 100 Zeichen';
  end if;
  insert into public.events (title, description, starts_at, min_players, points, created_by)
  values (btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
          p_starts_at, p_min_players, p_points, (select auth.uid()))
  returning id into v_id;
  insert into public.event_ship_requirements (event_id, ship_id, quantity)
  select v_id, s.ship_id, least(sum(s.qty), 100)::integer
  from (
    select (x->>'ship_id')::bigint as ship_id,
           coalesce((x->>'quantity')::integer, 1) as qty
    from jsonb_array_elements(coalesce(p_ships, '[]'::jsonb)) as x
  ) s
  group by s.ship_id;
  insert into public.event_role_requirements (event_id, name, quantity)
  select v_id, min(r.name), least(sum(r.qty), 100)::integer
  from (
    select btrim(x->>'name') as name,
           coalesce((x->>'quantity')::integer, 1) as qty
    from jsonb_array_elements(coalesce(p_roles, '[]'::jsonb)) as x
  ) r
  where r.name <> ''
  group by lower(r.name);
  return v_id;
end;
$$;
ALTER FUNCTION public.create_event(p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb) OWNER TO postgres;
CREATE FUNCTION public.delete_member(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.delete_member(p_user_id uuid) OWNER TO postgres;
CREATE FUNCTION public.discord_close_craft_request(p_discord_id text, p_id bigint, p_action text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles where discord_id = p_discord_id limit 1;
  if v_uid is null then return jsonb_build_object('status', 'no_account'); end if;
  return public._craft_close(v_uid, p_id, p_action);
end;
$$;
ALTER FUNCTION public.discord_close_craft_request(p_discord_id text, p_id bigint, p_action text) OWNER TO postgres;
CREATE FUNCTION public.discord_create_craft_request(p_discord_id text, p_blueprint_id bigint, p_qty integer DEFAULT 1, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles where discord_id = p_discord_id limit 1;
  if v_uid is null then return jsonb_build_object('status', 'no_account'); end if;
  return public._craft_create(v_uid, p_blueprint_id, p_qty, p_note);
end;
$$;
ALTER FUNCTION public.discord_create_craft_request(p_discord_id text, p_blueprint_id bigint, p_qty integer, p_note text) OWNER TO postgres;
CREATE FUNCTION public.discord_create_password_reset(p_discord_id text, p_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_p record;
  v_exp timestamptz := now() + interval '15 minutes';
begin
  if p_discord_id is null or p_discord_id !~ '^\d{5,25}$' then
    return jsonb_build_object('status', 'bad_id');
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'bad_hash');
  end if;
  select id, username, login_name, blocked into v_p from public.profiles where discord_id = p_discord_id;
  if not found then
    return jsonb_build_object('status', 'no_account');
  end if;
  if v_p.blocked then
    return jsonb_build_object('status', 'blocked');
  end if;
  if exists (select 1 from public.password_reset_codes where user_id = v_p.id and created_at > now() - interval '1 minute') then
    return jsonb_build_object('status', 'too_soon');
  end if;
  delete from public.password_reset_codes where expires_at < now();
  insert into public.password_reset_codes (user_id, code_hash, source, created_at, expires_at)
  values (v_p.id, p_hash, 'discord', now(), v_exp)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, source = excluded.source, created_at = now(), expires_at = excluded.expires_at;
  return jsonb_build_object('status', 'ok', 'username', v_p.username, 'login_name', v_p.login_name, 'expires_at', v_exp);
exception when unique_violation then
  return jsonb_build_object('status', 'retry');
end;
$_$;
ALTER FUNCTION public.discord_create_password_reset(p_discord_id text, p_hash text) OWNER TO postgres;
CREATE FUNCTION public.discord_event_signoff(p_discord_id text, p_event_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user uuid;
  v_approved boolean;
  v_status public.event_status;
begin
  select id, approved into v_user, v_approved
  from public.profiles where discord_id = p_discord_id limit 1;
  if v_user is null then
    return jsonb_build_object('status', 'no_account');
  end if;
  if not v_approved then
    return jsonb_build_object('status', 'pending');
  end if;
  select status into v_status from public.events where id = p_event_id;
  if v_status is null then
    return jsonb_build_object('status', 'no_event');
  end if;
  if v_status <> 'planned' then
    return jsonb_build_object('status', 'closed');
  end if;
  delete from public.event_signups where event_id = p_event_id and user_id = v_user;
  return jsonb_build_object('status', 'ok', 'was_signed_up', found);
end;
$$;
ALTER FUNCTION public.discord_event_signoff(p_discord_id text, p_event_id bigint) OWNER TO postgres;
CREATE FUNCTION public.discord_event_signup(p_discord_id text, p_event_id bigint, p_role_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user uuid;
  v_approved boolean;
  v_status public.event_status;
  v_role_name text;
  v_existed boolean;
begin
  select id, approved into v_user, v_approved
  from public.profiles where discord_id = p_discord_id limit 1;
  if v_user is null then
    return jsonb_build_object('status', 'no_account');
  end if;
  if not v_approved then
    return jsonb_build_object('status', 'pending');
  end if;
  select status into v_status from public.events where id = p_event_id;
  if v_status is null then
    return jsonb_build_object('status', 'no_event');
  end if;
  if v_status <> 'planned' then
    return jsonb_build_object('status', 'closed');
  end if;
  if p_role_id is not null then
    select name into v_role_name
    from public.event_role_requirements
    where id = p_role_id and event_id = p_event_id;
    if v_role_name is null then
      return jsonb_build_object('status', 'bad_role');
    end if;
  end if;
  select exists (
    select 1 from public.event_signups where event_id = p_event_id and user_id = v_user
  ) into v_existed;
  if p_role_id is null then
    -- Nur anmelden, eine schon gewählte Rolle bleibt erhalten
    insert into public.event_signups (event_id, user_id)
    values (p_event_id, v_user)
    on conflict (event_id, user_id) do nothing;
  else
    insert into public.event_signups (event_id, user_id, role_id)
    values (p_event_id, v_user, p_role_id)
    on conflict (event_id, user_id) do update set role_id = excluded.role_id;
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'already', v_existed and p_role_id is null,
    'role', v_role_name
  );
end;
$$;
ALTER FUNCTION public.discord_event_signup(p_discord_id text, p_event_id bigint, p_role_id bigint) OWNER TO postgres;
CREATE FUNCTION public.discord_link_account(p_discord_id text, p_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_row public.discord_link_codes%rowtype;
  v_name text;
begin
  if p_discord_id is null or p_discord_id !~ '^\d{5,25}$' then
    return jsonb_build_object('status', 'bad_id');
  end if;
  select * into v_row from public.discord_link_codes
   where code = upper(btrim(coalesce(p_code, ''))) and expires_at > now()
   for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if exists (select 1 from public.profiles where discord_id = p_discord_id) then
    return jsonb_build_object('status', 'discord_taken');
  end if;
  update public.profiles set discord_id = p_discord_id
   where id = v_row.user_id and discord_id is null
   returning username into v_name;
  if not found then
    return jsonb_build_object('status', 'already_linked');
  end if;
  delete from public.discord_link_codes where user_id = v_row.user_id;
  return jsonb_build_object('status', 'ok', 'username', v_name);
end;
$_$;
ALTER FUNCTION public.discord_link_account(p_discord_id text, p_code text) OWNER TO postgres;
CREATE FUNCTION public.discord_loot_claim(p_discord_id text, p_item_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user uuid;
  v_approved boolean;
  v_name text;
  v_status public.loot_status;
  v_username text;
begin
  select id, approved, username into v_user, v_approved, v_username
  from public.profiles where discord_id = p_discord_id limit 1;
  if v_user is null then
    return jsonb_build_object('status', 'no_account');
  end if;
  if not v_approved then
    return jsonb_build_object('status', 'pending');
  end if;
  select name, status into v_name, v_status
  from public.loot_items where id = p_item_id for update;
  if v_name is null then
    return jsonb_build_object('status', 'no_item');
  end if;
  if v_status <> 'released' then
    return jsonb_build_object('status', 'not_released', 'name', v_name);
  end if;
  if exists (select 1 from public.loot_claims where item_id = p_item_id and user_id = v_user) then
    return jsonb_build_object('status', 'already', 'name', v_name);
  end if;
  insert into public.loot_claims (item_id, user_id) values (p_item_id, v_user);
  insert into public.loot_log (item_id, user_id, action, detail)
  values (p_item_id, v_user, 'claimed', 'Claim von ' || coalesce(v_username, 'Unbekannt') || ' (über Discord)');
  return jsonb_build_object('status', 'ok', 'name', v_name);
end;
$$;
ALTER FUNCTION public.discord_loot_claim(p_discord_id text, p_item_id bigint) OWNER TO postgres;
CREATE FUNCTION public.discord_loot_unclaim(p_discord_id text, p_item_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user uuid;
  v_approved boolean;
  v_name text;
  v_status public.loot_status;
  v_username text;
begin
  select id, approved, username into v_user, v_approved, v_username
  from public.profiles where discord_id = p_discord_id limit 1;
  if v_user is null then
    return jsonb_build_object('status', 'no_account');
  end if;
  if not v_approved then
    return jsonb_build_object('status', 'pending');
  end if;
  select name, status into v_name, v_status
  from public.loot_items where id = p_item_id for update;
  if v_name is null then
    return jsonb_build_object('status', 'no_item');
  end if;
  if v_status <> 'released' then
    return jsonb_build_object('status', 'not_released', 'name', v_name);
  end if;
  delete from public.loot_claims
   where item_id = p_item_id and user_id = v_user and status = 'pending';
  if not found then
    return jsonb_build_object('status', 'none', 'name', v_name);
  end if;
  insert into public.loot_log (item_id, user_id, action, detail)
  values (p_item_id, v_user, 'claim_withdrawn',
          'Claim zurückgezogen von ' || coalesce(v_username, 'Unbekannt') || ' (über Discord)');
  return jsonb_build_object('status', 'ok', 'name', v_name);
end;
$$;
ALTER FUNCTION public.discord_loot_unclaim(p_discord_id text, p_item_id bigint) OWNER TO postgres;
CREATE FUNCTION public.discord_take_craft_request(p_discord_id text, p_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles where discord_id = p_discord_id limit 1;
  if v_uid is null then return jsonb_build_object('status', 'no_account'); end if;
  return public._craft_take(v_uid, p_id);
end;
$$;
ALTER FUNCTION public.discord_take_craft_request(p_discord_id text, p_id bigint) OWNER TO postgres;
CREATE FUNCTION public.ensure_org_blueprint(p_catalog_uuid uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_cat public.catalog_blueprints%rowtype;
  v_id bigint;
begin
  if not (select public.is_approved()) then
    raise exception 'Keine Berechtigung';
  end if;
  select * into v_cat from public.catalog_blueprints where uuid = p_catalog_uuid;
  if not found then
    raise exception 'Unbekannte Blaupause';
  end if;
  select id into v_id from public.blueprints where name_norm = v_cat.name_norm;
  if v_id is null then
    insert into public.blueprints (name, recipe, recipe_state, recipe_checked_at)
    values (
      v_cat.name,
      jsonb_build_object('id', v_cat.uuid, 'secs', v_cat.craft_secs, 'free', v_cat.free, 'missions', v_cat.missions_count, 'items', v_cat.ingredients),
      'ok', now()
    )
    on conflict (name_norm) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.blueprints where name_norm = v_cat.name_norm;
    end if;
  end if;
  return v_id;
end;
$$;
ALTER FUNCTION public.ensure_org_blueprint(p_catalog_uuid uuid) OWNER TO postgres;
CREATE FUNCTION public.finish_event(p_event_id bigint, p_attendees uuid[], p_loot jsonb DEFAULT '[]'::jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_event public.events%rowtype;
  v_count integer;
  v_item jsonb;
  v_name text;
  v_qty integer;
  v_holder uuid;
  v_loc text;
  v_note text;
  v_item_id bigint;
begin
  if coalesce(public.get_my_role()::text, '') not in ('officer', 'admin') then
    raise exception 'Keine Berechtigung';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Operation nicht gefunden';
  end if;
  if v_event.status = 'finished' then
    raise exception 'Operation ist bereits abgeschlossen';
  end if;
  if v_event.status = 'cancelled' then
    raise exception 'Operation wurde abgesagt';
  end if;
  if jsonb_array_length(coalesce(p_loot, '[]'::jsonb)) > 200 then
    raise exception 'Loot: Zu viele Einträge';
  end if;
  -- Teilnehmer vermerken, auch Spontane ohne vorherige Anmeldung
  insert into public.event_signups (event_id, user_id, attended)
  select p_event_id, u, true
  from unnest(p_attendees) as u
  where exists (select 1 from public.profiles pr where pr.id = u)
  on conflict (event_id, user_id) do update set attended = true;
  update public.event_signups
     set attended = false
   where event_id = p_event_id
     and user_id <> all (p_attendees);
  insert into public.points_log (user_id, event_id, points, reason)
  select s.user_id, p_event_id, v_event.points, 'Teilnahme: ' || v_event.title
  from public.event_signups s
  where s.event_id = p_event_id and s.attended;
  get diagnostics v_count = row_count;
  -- Loot einzeln eintragen (Status zunächst gesperrt)
  for v_item in select value from jsonb_array_elements(coalesce(p_loot, '[]'::jsonb))
  loop
    v_name := btrim(coalesce(v_item->>'name', ''));
    v_qty := (v_item->>'quantity')::integer;
    v_holder := nullif(v_item->>'holder_id', '')::uuid;
    v_loc := coalesce(nullif(v_item->>'location', ''), 'player');
    v_note := nullif(btrim(coalesce(v_item->>'location_note', '')), '');
    if v_name = '' or char_length(v_name) > 100 then
      raise exception 'Loot: Name fehlt oder ist zu lang';
    end if;
    if v_qty is null or v_qty < 1 or v_qty > 1000000 then
      raise exception 'Loot: Ungültige Menge';
    end if;
    if v_loc not in ('player', 'vizsla_bank') then
      raise exception 'Loot: Ungültiger Lagerort';
    end if;
    if v_loc = 'player' and v_holder is null then
      raise exception 'Loot: Bitte angeben, bei wem es liegt';
    end if;
    if v_holder is not null and not exists (
      select 1 from public.profiles where id = v_holder
    ) then
      raise exception 'Loot: Spieler nicht gefunden';
    end if;
    insert into public.loot_items
      (event_id, name, quantity, holder_id, location, location_note, created_by)
    values
      (p_event_id, v_name, v_qty, v_holder, v_loc::public.loot_location, v_note,
       (select auth.uid()))
    returning id into v_item_id;
    insert into public.loot_log (item_id, user_id, action, detail)
    values (v_item_id, (select auth.uid()), 'created',
            'Eingetragen beim Abschluss von: ' || v_event.title);
  end loop;
  update public.events
     set status = 'finished', finished_at = now()
   where id = p_event_id;
  return v_count;
end;
$$;
ALTER FUNCTION public.finish_event(p_event_id bigint, p_attendees uuid[], p_loot jsonb) OWNER TO postgres;
CREATE FUNCTION public.get_my_role() RETURNS public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case when approved then role end
  from public.profiles where id = (select auth.uid())
$$;
ALTER FUNCTION public.get_my_role() OWNER TO postgres;
CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', '');
  v_code text;
  v_name text;
begin
  if v_provider = 'discord' then
    raise exception 'Neue Konten gibt es nur mit Benutzername und Einladungscode';
  end if;
  v_code := upper(btrim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  update public.invite_codes
     set uses = uses + 1
   where code = v_code
     and not revoked
     and uses < max_uses
     and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'Ungültiger Einladungscode';
  end if;
  v_name := left(btrim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), 40);
  if v_name = '' then
    v_name := 'Neues Mitglied';
  end if;
  -- Die Discord-Kennung wird nur über den Code in Discord (/verknuepfen) gesetzt, nie aus frei wählbaren Nutzerdaten
  insert into public.profiles (id, discord_id, username, avatar_url)
  values (new.id, null, v_name, null);
  return new;
end;
$$;
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
CREATE FUNCTION public.import_blueprints_for_token(p_token_hash text, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid;
  v_ok boolean;
  v_received integer;
  v_clean jsonb;
  v_clean_count integer;
  v_new_catalog integer;
  v_added integer;
begin
  select user_id into v_uid from public.import_tokens where token_hash = p_token_hash;
  if v_uid is null then
    return jsonb_build_object('status', 'invalid_token');
  end if;
  select (approved and not blocked) into v_ok from public.profiles where id = v_uid;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('status', 'bad_data');
  end if;
  v_received := jsonb_array_length(p_items);
  if v_received > 2000 then
    return jsonb_build_object('status', 'too_many');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'ini', c.ini, 'at', c.at)), '[]'::jsonb)
    into v_clean
  from (
    select distinct on (lower(btrim(x.value->>'name')))
           btrim(x.value->>'name') as name,
           nullif(btrim(coalesce(x.value->>'ini', '')), '') as ini,
           case when (x.value->>'at') ~ '^\d{4}-\d{2}-\d{2}T' then (x.value->>'at')::timestamptz end as at
    from jsonb_array_elements(p_items) as x
    where jsonb_typeof(x.value) = 'object'
      and char_length(btrim(coalesce(x.value->>'name', ''))) between 1 and 120
      and coalesce(x.value->>'ini', '') !~* '^Human_'
    order by lower(btrim(x.value->>'name')),
             (nullif(btrim(coalesce(x.value->>'ini', '')), '') is null),
             case when (x.value->>'at') ~ '^\d{4}-\d{2}-\d{2}T' then (x.value->>'at')::timestamptz end nulls last
  ) c;
  v_clean_count := jsonb_array_length(v_clean);
  with ins as (
    insert into public.blueprints (name, ini_key)
    select t.name, left(t.ini, 150)
    from jsonb_to_recordset(v_clean) as t(name text, ini text, at timestamptz)
    on conflict (name_norm) do update
      set ini_key = excluded.ini_key
      where public.blueprints.ini_key is null and excluded.ini_key is not null
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_new_catalog from ins;
  insert into public.player_blueprints (user_id, blueprint_id, acquired_at, source)
  select v_uid, b.id, t.at, 'import'
  from jsonb_to_recordset(v_clean) as t(name text, ini text, at timestamptz)
  join public.blueprints b on b.name_norm = lower(btrim(t.name))
  on conflict (user_id, blueprint_id) do nothing;
  get diagnostics v_added = row_count;
  update public.import_tokens set last_used_at = now(), use_count = use_count + 1 where user_id = v_uid;
  return jsonb_build_object(
    'status', 'ok',
    'received', v_received,
    'skipped', v_received - v_clean_count,
    'new_in_catalog', v_new_catalog,
    'added', v_added,
    'already_owned', v_clean_count - v_added
  );
end;
$$;
ALTER FUNCTION public.import_blueprints_for_token(p_token_hash text, p_items jsonb) OWNER TO postgres;
CREATE FUNCTION public.is_approved() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce((select approved from public.profiles where id = (select auth.uid())), false)
$$;
ALTER FUNCTION public.is_approved() OWNER TO postgres;
CREATE FUNCTION public.login_throttle_check(p_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select not exists (
    select 1 from public.login_attempts
     where key = lower(left(coalesce(p_key, ''), 64)) and fails >= 10 and window_start > now() - interval '10 minutes'
  );
$$;
ALTER FUNCTION public.login_throttle_check(p_key text) OWNER TO postgres;
CREATE FUNCTION public.login_throttle_fail(p_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_key text := lower(left(coalesce(p_key, ''), 64));
begin
  if v_key = '' then return; end if;
  delete from public.login_attempts where window_start < now() - interval '1 day';
  insert into public.login_attempts (key, fails, window_start) values (v_key, 1, now())
  on conflict (key) do update
    set fails = case when public.login_attempts.window_start < now() - interval '10 minutes' then 1 else public.login_attempts.fails + 1 end,
        window_start = case when public.login_attempts.window_start < now() - interval '10 minutes' then now() else public.login_attempts.window_start end;
end;
$$;
ALTER FUNCTION public.login_throttle_fail(p_key text) OWNER TO postgres;
CREATE FUNCTION public.login_throttle_reset(p_key text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from public.login_attempts where key = lower(left(coalesce(p_key, ''), 64));
$$;
ALTER FUNCTION public.login_throttle_reset(p_key text) OWNER TO postgres;
CREATE FUNCTION public.move_loot(p_item_id bigint, p_location text, p_holder uuid, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_item public.loot_items%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_old text;
  v_new text;
begin
  if coalesce(public.get_my_role()::text, '') not in ('officer', 'admin') then
    raise exception 'Keine Berechtigung';
  end if;
  if p_location not in ('player', 'vizsla_bank') then
    raise exception 'Ungültiger Lagerort';
  end if;
  if p_location = 'player' and p_holder is null then
    raise exception 'Bitte angeben, bei wem das Objekt liegt';
  end if;
  if p_holder is not null and not exists (select 1 from public.profiles where id = p_holder) then
    raise exception 'Spieler nicht gefunden';
  end if;
  select * into v_item from public.loot_items where id = p_item_id for update;
  if not found then
    raise exception 'Objekt nicht gefunden';
  end if;
  if v_item.status = 'sold' then
    raise exception 'Verkaufte Objekte lassen sich nicht verschieben';
  end if;
  v_old := case when v_item.location = 'vizsla_bank' then 'Vizsla Bank Account'
                else 'Spieler: ' || coalesce((select username from public.profiles where id = v_item.holder_id), 'unbekannt') end;
  v_new := case when p_location = 'vizsla_bank' then 'Vizsla Bank Account'
                else 'Spieler: ' || coalesce((select username from public.profiles where id = p_holder), 'unbekannt') end;
  update public.loot_items
     set location = p_location::public.loot_location,
         holder_id = p_holder,
         location_note = v_note
   where id = p_item_id;
  insert into public.loot_log (item_id, user_id, action, detail)
  values (p_item_id, (select auth.uid()), 'moved',
          v_old || ' → ' || v_new || coalesce(' (' || v_note || ')', ''));
end;
$$;
ALTER FUNCTION public.move_loot(p_item_id bigint, p_location text, p_holder uuid, p_note text) OWNER TO postgres;
CREATE FUNCTION public.my_import_helper_status() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select jsonb_build_object('created_at', created_at, 'last_used_at', last_used_at, 'use_count', use_count)
       from public.import_tokens where user_id = (select auth.uid())),
    'null'::jsonb
  );
$$;
ALTER FUNCTION public.my_import_helper_status() OWNER TO postgres;
CREATE FUNCTION public.peek_password_reset(p_hash text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select jsonb_build_object('status', 'ok', 'login_name', p.login_name, 'username', p.username)
       from public.password_reset_codes c
       join public.profiles p on p.id = c.user_id
      where c.code_hash = p_hash and c.expires_at > now() and not p.blocked),
    jsonb_build_object('status', 'invalid')
  );
$$;
ALTER FUNCTION public.peek_password_reset(p_hash text) OWNER TO postgres;
CREATE FUNCTION public.reject_user(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.reject_user(p_user_id uuid) OWNER TO postgres;
CREATE FUNCTION public.release_loot(p_item_id bigint, p_price bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_item public.loot_items%rowtype;
begin
  if coalesce(public.get_my_role()::text, '') not in ('officer', 'admin') then
    raise exception 'Keine Berechtigung';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Ungültiger Preis';
  end if;
  select * into v_item from public.loot_items where id = p_item_id for update;
  if not found then
    raise exception 'Objekt nicht gefunden';
  end if;
  if v_item.status <> 'locked' then
    raise exception 'Objekt ist nicht gesperrt';
  end if;
  update public.loot_items
     set status = 'released', price_auec = p_price,
         released_at = now(), released_by = (select auth.uid())
   where id = p_item_id;
  insert into public.loot_log (item_id, user_id, action, detail)
  values (p_item_id, (select auth.uid()), 'released',
          'Freigegeben für ' || p_price || ' aUEC');
end;
$$;
ALTER FUNCTION public.release_loot(p_item_id bigint, p_price bigint) OWNER TO postgres;
CREATE FUNCTION public.require_approved_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (
    select 1 from public.profiles where id = new.user_id and approved
  ) then
    raise exception 'Konto noch nicht freigegeben';
  end if;
  return new;
end;
$$;
ALTER FUNCTION public.require_approved_user() OWNER TO postgres;
CREATE FUNCTION public.reset_event_reminders() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.reminder_60_sent_at := null;
  new.reminder_10_sent_at := null;
  new.time_set_at := now();
  return new;
end;
$$;
ALTER FUNCTION public.reset_event_reminders() OWNER TO postgres;
CREATE FUNCTION public.revoke_my_import_token() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from public.import_tokens where user_id = (select auth.uid());
$$;
ALTER FUNCTION public.revoke_my_import_token() OWNER TO postgres;
CREATE FUNCTION public.run_daily_maintenance() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.run_daily_maintenance() OWNER TO postgres;
CREATE FUNCTION public.run_daily_maintenance_system() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_ran boolean;
begin
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
ALTER FUNCTION public.run_daily_maintenance_system() OWNER TO postgres;
CREATE FUNCTION public.set_discord_link_code(p_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_uid uuid := (select auth.uid());
  v_discord text;
  v_expires timestamptz := now() + interval '15 minutes';
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  select discord_id into v_discord from public.profiles where id = v_uid;
  if not found then
    return jsonb_build_object('status', 'no_profile');
  end if;
  if v_discord is not null then
    return jsonb_build_object('status', 'already_linked');
  end if;
  if p_code is null or p_code !~ '^[A-Z0-9]{8}$' then
    return jsonb_build_object('status', 'bad_code');
  end if;
  delete from public.discord_link_codes where expires_at < now();
  begin
    insert into public.discord_link_codes (user_id, code, expires_at)
    values (v_uid, p_code, v_expires)
    on conflict (user_id) do update set code = excluded.code, expires_at = excluded.expires_at;
  exception when unique_violation then
    return jsonb_build_object('status', 'retry');
  end;
  return jsonb_build_object('status', 'ok', 'expires_at', v_expires);
end;
$_$;
ALTER FUNCTION public.set_discord_link_code(p_code text) OWNER TO postgres;
CREATE FUNCTION public.set_display_name(p_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.set_display_name(p_name text) OWNER TO postgres;
CREATE FUNCTION public.set_import_token(p_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_uid uuid := (select auth.uid());
  v_ok boolean;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'bad_hash');
  end if;
  select (approved and not blocked) into v_ok from public.profiles where id = v_uid;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  insert into public.import_tokens (user_id, token_hash) values (v_uid, p_hash)
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = now(), last_used_at = null, use_count = 0;
  return jsonb_build_object('status', 'ok');
exception when unique_violation then
  return jsonb_build_object('status', 'retry');
end;
$_$;
ALTER FUNCTION public.set_import_token(p_hash text) OWNER TO postgres;
CREATE FUNCTION public.set_user_role(p_user_id uuid, p_role public.app_role) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_current public.app_role;
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin' then
    raise exception 'Keine Berechtigung';
  end if;
  select role into v_current from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Benutzer nicht gefunden';
  end if;
  if v_current = p_role then
    return;
  end if;
  -- Es muss immer mindestens ein Admin übrig bleiben
  if v_current = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Der letzte Admin kann nicht herabgestuft werden';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;
ALTER FUNCTION public.set_user_role(p_user_id uuid, p_role public.app_role) OWNER TO postgres;
CREATE FUNCTION public.signup_for_event(p_event_id bigint, p_role_id bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.event_status;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet';
  end if;
  select status into v_status from public.events where id = p_event_id;
  if v_status is null then
    raise exception 'Operation nicht gefunden';
  end if;
  if v_status <> 'planned' then
    raise exception 'Anmeldung nur für geplante Operationen möglich';
  end if;
  if p_role_id is not null and not exists (
    select 1 from public.event_role_requirements
    where id = p_role_id and event_id = p_event_id
  ) then
    raise exception 'Rolle gehört nicht zu dieser Operation';
  end if;
  insert into public.event_signups (event_id, user_id, role_id)
  values (p_event_id, v_uid, p_role_id)
  on conflict (event_id, user_id) do update set role_id = excluded.role_id;
end;
$$;
ALTER FUNCTION public.signup_for_event(p_event_id bigint, p_role_id bigint) OWNER TO postgres;
CREATE FUNCTION public.take_craft_request(p_id bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public._craft_take((select auth.uid()), p_id);
$$;
ALTER FUNCTION public.take_craft_request(p_id bigint) OWNER TO postgres;
CREATE FUNCTION public.unblock_user(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.unblock_user(p_user_id uuid) OWNER TO postgres;
CREATE FUNCTION public.update_event(p_event_id bigint, p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
ALTER FUNCTION public.update_event(p_event_id bigint, p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb) OWNER TO postgres;
CREATE FUNCTION public.withdraw_claim(p_item_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.loot_status;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet';
  end if;
  select status into v_status from public.loot_items where id = p_item_id for update;
  if not found then
    raise exception 'Objekt nicht gefunden';
  end if;
  if v_status <> 'released' then
    raise exception 'Claim kann nicht mehr zurückgezogen werden';
  end if;
  delete from public.loot_claims
   where item_id = p_item_id and user_id = v_uid and status = 'pending';
  if not found then
    raise exception 'Kein Claim vorhanden';
  end if;
  select username into v_name from public.profiles where id = v_uid;
  insert into public.loot_log (item_id, user_id, action, detail)
  values (p_item_id, v_uid, 'claim_withdrawn',
          'Claim zurückgezogen von ' || coalesce(v_name, 'Unbekannt'));
end;
$$;
ALTER FUNCTION public.withdraw_claim(p_item_id bigint) OWNER TO postgres;
SET default_tablespace = '';
SET default_table_access_method = heap;
CREATE TABLE public.blueprints (
    id bigint NOT NULL,
    name text NOT NULL,
    name_norm text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
    ini_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category text,
    details jsonb,
    details_checked_at timestamp with time zone,
    recipe jsonb,
    recipe_checked_at timestamp with time zone,
    recipe_state text,
    CONSTRAINT blueprints_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['ruestung'::text, 'waffen'::text, 'schiffswaffen'::text, 'munition'::text, 'komponenten'::text, 'sonstiges'::text])))),
    CONSTRAINT blueprints_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 120))),
    CONSTRAINT blueprints_name_len CHECK ((char_length(name) <= 120)),
    CONSTRAINT blueprints_recipe_state_check CHECK (((recipe_state IS NULL) OR (recipe_state = ANY (ARRAY['ok'::text, 'none'::text, 'unknown'::text]))))
);
ALTER TABLE public.blueprints OWNER TO postgres;
ALTER TABLE public.blueprints ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.blueprints_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.cash_ledger (
    id bigint NOT NULL,
    item_id bigint,
    item_name text NOT NULL,
    quantity integer NOT NULL,
    buyer_id uuid,
    buyer_name text NOT NULL,
    amount_auec bigint NOT NULL,
    confirmed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_ledger_amount_auec_check CHECK ((amount_auec >= 0))
);
ALTER TABLE public.cash_ledger OWNER TO postgres;
ALTER TABLE public.cash_ledger ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cash_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.catalog_blueprints (
    uuid uuid NOT NULL,
    name text NOT NULL,
    name_norm text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
    class_name text,
    type text,
    type_label text,
    grade text,
    craft_secs integer,
    free boolean DEFAULT false NOT NULL,
    ingredient_count integer DEFAULT 0 NOT NULL,
    ingredients jsonb DEFAULT '[]'::jsonb NOT NULL,
    missions_count integer DEFAULT 0 NOT NULL,
    sources jsonb DEFAULT '[]'::jsonb NOT NULL,
    detail jsonb,
    detail_checked_at timestamp with time zone,
    game_version text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.catalog_blueprints OWNER TO postgres;
CREATE TABLE public.catalog_meta (
    id integer DEFAULT 1 NOT NULL,
    synced_at timestamp with time zone,
    blueprint_count integer,
    mission_count integer,
    giver_count integer,
    game_version text,
    CONSTRAINT catalog_meta_id_check CHECK ((id = 1))
);
ALTER TABLE public.catalog_meta OWNER TO postgres;
CREATE TABLE public.craft_requests (
    id bigint NOT NULL,
    blueprint_id bigint NOT NULL,
    requester_id uuid NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    note text,
    status text DEFAULT 'open'::text NOT NULL,
    taker_id uuid,
    discord_channel_id text,
    discord_message_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT craft_requests_note_check CHECK (((note IS NULL) OR (char_length(note) <= 200))),
    CONSTRAINT craft_requests_note_len CHECK (((note IS NULL) OR (char_length(note) <= 200))),
    CONSTRAINT craft_requests_qty_check CHECK (((qty >= 1) AND (qty <= 99))),
    CONSTRAINT craft_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'taken'::text, 'done'::text, 'cancelled'::text])))
);
ALTER TABLE public.craft_requests OWNER TO postgres;
ALTER TABLE public.craft_requests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.craft_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.discord_link_codes (
    user_id uuid NOT NULL,
    code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT discord_link_codes_code_check CHECK ((code ~ '^[A-Z0-9]{8}$'::text))
);
ALTER TABLE public.discord_link_codes OWNER TO postgres;
CREATE TABLE public.event_role_requirements (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    CONSTRAINT event_role_name_len CHECK ((char_length(name) <= 60)),
    CONSTRAINT event_role_requirements_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 60))),
    CONSTRAINT event_role_requirements_quantity_check CHECK (((quantity >= 1) AND (quantity <= 100)))
);
ALTER TABLE public.event_role_requirements OWNER TO postgres;
ALTER TABLE public.event_role_requirements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.event_role_requirements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.event_ship_requirements (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    ship_id bigint NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    CONSTRAINT event_ship_requirements_quantity_check CHECK (((quantity >= 1) AND (quantity <= 100)))
);
ALTER TABLE public.event_ship_requirements OWNER TO postgres;
ALTER TABLE public.event_ship_requirements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.event_ship_requirements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.event_signups (
    event_id bigint NOT NULL,
    user_id uuid NOT NULL,
    attended boolean DEFAULT false NOT NULL,
    signed_up_at timestamp with time zone DEFAULT now() NOT NULL,
    role_id bigint
);
ALTER TABLE public.event_signups OWNER TO postgres;
CREATE TABLE public.events (
    id bigint NOT NULL,
    title text NOT NULL,
    description text,
    starts_at timestamp with time zone NOT NULL,
    min_players integer DEFAULT 1 NOT NULL,
    required_roles text,
    points integer DEFAULT 10 NOT NULL,
    status public.event_status DEFAULT 'planned'::public.event_status NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    discord_channel_id text,
    discord_message_id text,
    reminder_60_sent_at timestamp with time zone,
    reminder_10_sent_at timestamp with time zone,
    time_set_at timestamp with time zone DEFAULT now() NOT NULL,
    discord_event_id text,
    CONSTRAINT events_description_len CHECK (((description IS NULL) OR (char_length(description) <= 4000))),
    CONSTRAINT events_min_players_check CHECK ((min_players >= 0)),
    CONSTRAINT events_points_check CHECK ((points >= 0)),
    CONSTRAINT events_title_len CHECK ((char_length(title) <= 100))
);
ALTER TABLE public.events OWNER TO postgres;
ALTER TABLE public.events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.hangar_ships (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    ship_id bigint NOT NULL,
    source public.ship_source DEFAULT 'ingame'::public.ship_source NOT NULL,
    pledge_value_eur numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hangar_ships_pledge_value_eur_check CHECK (((pledge_value_eur IS NULL) OR (pledge_value_eur >= (0)::numeric))),
    CONSTRAINT pledge_value_only_for_pledge CHECK (((source = 'pledge'::public.ship_source) OR (pledge_value_eur IS NULL)))
);
ALTER TABLE public.hangar_ships OWNER TO postgres;
ALTER TABLE public.hangar_ships ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hangar_ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.import_tokens (
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    use_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT import_tokens_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);
ALTER TABLE public.import_tokens OWNER TO postgres;
CREATE TABLE public.invite_codes (
    code text NOT NULL,
    note text,
    max_uses integer DEFAULT 1 NOT NULL,
    uses integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    revoked boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invite_codes_code_check CHECK ((code ~ '^[A-Z0-9-]{6,32}$'::text)),
    CONSTRAINT invite_codes_max_uses_check CHECK (((max_uses >= 1) AND (max_uses <= 500))),
    CONSTRAINT invite_codes_note_check CHECK (((note IS NULL) OR (char_length(note) <= 80))),
    CONSTRAINT invite_codes_uses_check CHECK ((uses >= 0))
);
ALTER TABLE public.invite_codes OWNER TO postgres;
CREATE TABLE public.level_thresholds (
    level integer NOT NULL,
    min_points integer NOT NULL
);
ALTER TABLE public.level_thresholds OWNER TO postgres;
CREATE TABLE public.login_attempts (
    key text NOT NULL,
    fails integer DEFAULT 0 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT login_attempts_key_check CHECK (((char_length(key) >= 1) AND (char_length(key) <= 64)))
);
ALTER TABLE public.login_attempts OWNER TO postgres;
CREATE TABLE public.loot_claims (
    id bigint NOT NULL,
    item_id bigint NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT loot_claims_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'won'::text, 'lost'::text])))
);
ALTER TABLE public.loot_claims OWNER TO postgres;
ALTER TABLE public.loot_claims ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loot_claims_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.loot_items (
    id bigint NOT NULL,
    event_id bigint,
    name text NOT NULL,
    quantity integer NOT NULL,
    holder_id uuid,
    location public.loot_location DEFAULT 'player'::public.loot_location NOT NULL,
    location_note text,
    status public.loot_status DEFAULT 'locked'::public.loot_status NOT NULL,
    price_auec bigint,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    released_at timestamp with time zone,
    released_by uuid,
    winner_id uuid,
    sold_at timestamp with time zone,
    discord_channel_id text,
    discord_message_id text,
    CONSTRAINT loot_items_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 100))),
    CONSTRAINT loot_items_name_len CHECK ((char_length(name) <= 100)),
    CONSTRAINT loot_items_note_len CHECK (((location_note IS NULL) OR (char_length(location_note) <= 200))),
    CONSTRAINT loot_items_price_auec_check CHECK (((price_auec IS NULL) OR (price_auec >= 0))),
    CONSTRAINT loot_items_quantity_check CHECK ((quantity >= 1))
);
ALTER TABLE public.loot_items OWNER TO postgres;
ALTER TABLE public.loot_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loot_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.loot_log (
    id bigint NOT NULL,
    item_id bigint NOT NULL,
    user_id uuid,
    action text NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.loot_log OWNER TO postgres;
ALTER TABLE public.loot_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.loot_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.maintenance_runs (
    name text NOT NULL,
    last_run timestamp with time zone NOT NULL
);
ALTER TABLE public.maintenance_runs OWNER TO postgres;
CREATE TABLE public.password_reset_codes (
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT password_reset_codes_code_hash_check CHECK ((code_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT password_reset_codes_source_check CHECK ((source = ANY (ARRAY['discord'::text, 'admin'::text])))
);
ALTER TABLE public.password_reset_codes OWNER TO postgres;
CREATE TABLE public.player_blueprints (
    user_id uuid NOT NULL,
    blueprint_id bigint NOT NULL,
    acquired_at timestamp with time zone,
    source text DEFAULT 'import'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT player_blueprints_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'import'::text])))
);
ALTER TABLE public.player_blueprints OWNER TO postgres;
CREATE TABLE public.points_log (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    event_id bigint,
    points integer NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.points_log OWNER TO postgres;
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    discord_id text,
    username text,
    avatar_url text,
    role public.app_role DEFAULT 'member'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    pending_notified boolean DEFAULT false NOT NULL,
    blocked boolean DEFAULT false NOT NULL,
    login_name text,
    CONSTRAINT profiles_login_name_format CHECK (((login_name IS NULL) OR (login_name ~ '^[a-z0-9][a-z0-9._-]{2,23}$'::text))),
    CONSTRAINT profiles_username_len CHECK ((char_length(username) <= 40))
);
ALTER TABLE public.profiles OWNER TO postgres;
CREATE VIEW public.player_stats WITH (security_invoker='true') AS
 WITH totals AS (
         SELECT p.id,
            p.username,
            (COALESCE(sum(l.points), (0)::bigint))::integer AS total_points,
            (count(l.event_id))::integer AS ops_count
           FROM (public.profiles p
             LEFT JOIN public.points_log l ON ((l.user_id = p.id)))
          WHERE p.approved
          GROUP BY p.id, p.username
        )
 SELECT id AS user_id,
    username,
    total_points,
    ops_count,
    COALESCE(( SELECT max(th.level) AS max
           FROM public.level_thresholds th
          WHERE (th.min_points <= t.total_points)), 1) AS level
   FROM totals t;
ALTER VIEW public.player_stats OWNER TO postgres;
ALTER TABLE public.points_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.points_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.ships (
    id bigint NOT NULL,
    name text NOT NULL,
    manufacturer text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ships_name_len CHECK ((char_length(name) <= 100))
);
ALTER TABLE public.ships OWNER TO postgres;
ALTER TABLE public.ships ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.shopping_list (
    user_id uuid NOT NULL,
    blueprint_id bigint NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shopping_list_qty_check CHECK (((qty >= 1) AND (qty <= 99)))
);
ALTER TABLE public.shopping_list OWNER TO postgres;
ALTER TABLE ONLY public.blueprints
    ADD CONSTRAINT blueprints_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cash_ledger
    ADD CONSTRAINT cash_ledger_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.catalog_blueprints
    ADD CONSTRAINT catalog_blueprints_pkey PRIMARY KEY (uuid);
ALTER TABLE ONLY public.catalog_meta
    ADD CONSTRAINT catalog_meta_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.craft_requests
    ADD CONSTRAINT craft_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.discord_link_codes
    ADD CONSTRAINT discord_link_codes_code_key UNIQUE (code);
ALTER TABLE ONLY public.discord_link_codes
    ADD CONSTRAINT discord_link_codes_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.event_role_requirements
    ADD CONSTRAINT event_role_requirements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_ship_requirements
    ADD CONSTRAINT event_ship_requirements_event_id_ship_id_key UNIQUE (event_id, ship_id);
ALTER TABLE ONLY public.event_ship_requirements
    ADD CONSTRAINT event_ship_requirements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.event_signups
    ADD CONSTRAINT event_signups_pkey PRIMARY KEY (event_id, user_id);
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.hangar_ships
    ADD CONSTRAINT hangar_ships_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.import_tokens
    ADD CONSTRAINT import_tokens_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.import_tokens
    ADD CONSTRAINT import_tokens_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (code);
ALTER TABLE ONLY public.level_thresholds
    ADD CONSTRAINT level_thresholds_pkey PRIMARY KEY (level);
ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.loot_claims
    ADD CONSTRAINT loot_claims_item_id_user_id_key UNIQUE (item_id, user_id);
ALTER TABLE ONLY public.loot_claims
    ADD CONSTRAINT loot_claims_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.loot_items
    ADD CONSTRAINT loot_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.loot_log
    ADD CONSTRAINT loot_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.maintenance_runs
    ADD CONSTRAINT maintenance_runs_pkey PRIMARY KEY (name);
ALTER TABLE ONLY public.password_reset_codes
    ADD CONSTRAINT password_reset_codes_code_hash_key UNIQUE (code_hash);
ALTER TABLE ONLY public.password_reset_codes
    ADD CONSTRAINT password_reset_codes_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.player_blueprints
    ADD CONSTRAINT player_blueprints_pkey PRIMARY KEY (user_id, blueprint_id);
ALTER TABLE ONLY public.points_log
    ADD CONSTRAINT points_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_name_key UNIQUE (name);
ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.shopping_list
    ADD CONSTRAINT shopping_list_pkey PRIMARY KEY (user_id, blueprint_id);
CREATE UNIQUE INDEX blueprints_name_norm_key ON public.blueprints USING btree (name_norm);
CREATE INDEX cash_ledger_buyer_idx ON public.cash_ledger USING btree (buyer_id);
CREATE INDEX cash_ledger_confirmed_by_idx ON public.cash_ledger USING btree (confirmed_by);
CREATE INDEX cash_ledger_item_idx ON public.cash_ledger USING btree (item_id);
CREATE INDEX catalog_blueprints_name_norm_idx ON public.catalog_blueprints USING btree (name_norm);
CREATE INDEX catalog_blueprints_synced_idx ON public.catalog_blueprints USING btree (synced_at);
CREATE INDEX craft_requests_blueprint_idx ON public.craft_requests USING btree (blueprint_id);
CREATE INDEX craft_requests_requester_idx ON public.craft_requests USING btree (requester_id);
CREATE INDEX craft_requests_status_idx ON public.craft_requests USING btree (status, created_at DESC);
CREATE INDEX craft_requests_taker_idx ON public.craft_requests USING btree (taker_id);
CREATE UNIQUE INDEX event_role_unique_name ON public.event_role_requirements USING btree (event_id, lower(name));
CREATE INDEX event_ship_requirements_ship_idx ON public.event_ship_requirements USING btree (ship_id);
CREATE INDEX event_signups_role_idx ON public.event_signups USING btree (role_id);
CREATE INDEX event_signups_user_id_idx ON public.event_signups USING btree (user_id);
CREATE INDEX events_created_by_idx ON public.events USING btree (created_by);
CREATE INDEX hangar_ships_ship_id_idx ON public.hangar_ships USING btree (ship_id);
CREATE INDEX hangar_ships_user_id_idx ON public.hangar_ships USING btree (user_id);
CREATE INDEX invite_codes_created_by_idx ON public.invite_codes USING btree (created_by);
CREATE INDEX loot_claims_user_id_idx ON public.loot_claims USING btree (user_id);
CREATE INDEX loot_items_created_by_idx ON public.loot_items USING btree (created_by);
CREATE INDEX loot_items_event_id_idx ON public.loot_items USING btree (event_id);
CREATE INDEX loot_items_holder_id_idx ON public.loot_items USING btree (holder_id);
CREATE INDEX loot_items_released_by_idx ON public.loot_items USING btree (released_by);
CREATE INDEX loot_items_winner_idx ON public.loot_items USING btree (winner_id);
CREATE INDEX loot_log_item_id_idx ON public.loot_log USING btree (item_id);
CREATE INDEX loot_log_user_idx ON public.loot_log USING btree (user_id);
CREATE INDEX player_blueprints_blueprint_id_idx ON public.player_blueprints USING btree (blueprint_id);
CREATE INDEX points_log_event_idx ON public.points_log USING btree (event_id);
CREATE UNIQUE INDEX points_log_one_per_event ON public.points_log USING btree (user_id, event_id) WHERE (event_id IS NOT NULL);
CREATE INDEX points_log_user_id_idx ON public.points_log USING btree (user_id);
CREATE UNIQUE INDEX profiles_discord_id_key ON public.profiles USING btree (discord_id) WHERE (discord_id IS NOT NULL);
CREATE UNIQUE INDEX profiles_login_name_key ON public.profiles USING btree (login_name) WHERE (login_name IS NOT NULL);
CREATE INDEX shopping_list_blueprint_idx ON public.shopping_list USING btree (blueprint_id);
CREATE TRIGGER events_time_changed BEFORE UPDATE OF starts_at ON public.events FOR EACH ROW WHEN ((old.starts_at IS DISTINCT FROM new.starts_at)) EXECUTE FUNCTION public.reset_event_reminders();
CREATE TRIGGER require_approved BEFORE INSERT ON public.event_signups FOR EACH ROW EXECUTE FUNCTION public.require_approved_user();
CREATE TRIGGER require_approved BEFORE INSERT ON public.loot_claims FOR EACH ROW EXECUTE FUNCTION public.require_approved_user();
CREATE TRIGGER require_approved BEFORE INSERT ON public.player_blueprints FOR EACH ROW EXECUTE FUNCTION public.require_approved_user();
ALTER TABLE ONLY public.cash_ledger
    ADD CONSTRAINT cash_ledger_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.cash_ledger
    ADD CONSTRAINT cash_ledger_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.cash_ledger
    ADD CONSTRAINT cash_ledger_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.loot_items(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.craft_requests
    ADD CONSTRAINT craft_requests_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES public.blueprints(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.craft_requests
    ADD CONSTRAINT craft_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.craft_requests
    ADD CONSTRAINT craft_requests_taker_id_fkey FOREIGN KEY (taker_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.discord_link_codes
    ADD CONSTRAINT discord_link_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_role_requirements
    ADD CONSTRAINT event_role_requirements_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_ship_requirements
    ADD CONSTRAINT event_ship_requirements_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_ship_requirements
    ADD CONSTRAINT event_ship_requirements_ship_id_fkey FOREIGN KEY (ship_id) REFERENCES public.ships(id);
ALTER TABLE ONLY public.event_signups
    ADD CONSTRAINT event_signups_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.event_signups
    ADD CONSTRAINT event_signups_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.event_role_requirements(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.event_signups
    ADD CONSTRAINT event_signups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.hangar_ships
    ADD CONSTRAINT hangar_ships_ship_id_fkey FOREIGN KEY (ship_id) REFERENCES public.ships(id);
ALTER TABLE ONLY public.hangar_ships
    ADD CONSTRAINT hangar_ships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.import_tokens
    ADD CONSTRAINT import_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.loot_claims
    ADD CONSTRAINT loot_claims_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.loot_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.loot_claims
    ADD CONSTRAINT loot_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.loot_items
    ADD CONSTRAINT loot_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.loot_items
    ADD CONSTRAINT loot_items_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.loot_items
    ADD CONSTRAINT loot_items_holder_id_fkey FOREIGN KEY (holder_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.loot_items
    ADD CONSTRAINT loot_items_released_by_fkey FOREIGN KEY (released_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.loot_items
    ADD CONSTRAINT loot_items_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.loot_log
    ADD CONSTRAINT loot_log_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.loot_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.loot_log
    ADD CONSTRAINT loot_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.password_reset_codes
    ADD CONSTRAINT password_reset_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_blueprints
    ADD CONSTRAINT player_blueprints_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES public.blueprints(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.player_blueprints
    ADD CONSTRAINT player_blueprints_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.points_log
    ADD CONSTRAINT points_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.points_log
    ADD CONSTRAINT points_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.shopping_list
    ADD CONSTRAINT shopping_list_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES public.blueprints(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.shopping_list
    ADD CONSTRAINT shopping_list_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
CREATE POLICY "Admin pflegt Level-Schwellen" ON public.level_thresholds TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = 'admin'::public.app_role)) WITH CHECK ((( SELECT public.get_my_role() AS get_my_role) = 'admin'::public.app_role));
CREATE POLICY "Anfragen: Freigegebene lesen" ON public.craft_requests FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eigene Blaupausen entfernen" ON public.player_blueprints FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Eigene Schiffe eintragen" ON public.hangar_ships FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.is_approved() AS is_approved)));
CREATE POLICY "Eigene Schiffe löschen, Admin darf alle" ON public.hangar_ships FOR DELETE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT public.get_my_role() AS get_my_role) = 'admin'::public.app_role)));
CREATE POLICY "Eigene Schiffe ändern" ON public.hangar_ships FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.is_approved() AS is_approved))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.is_approved() AS is_approved)));
CREATE POLICY "Eingeloggte dürfen Profile lesen" ON public.profiles FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR (( SELECT public.is_approved() AS is_approved) AND (approved OR (( SELECT public.get_my_role() AS get_my_role) = 'admin'::public.app_role)))));
CREATE POLICY "Eingeloggte dürfen Schiffe lesen" ON public.ships FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen Anmeldungen" ON public.event_signups FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen Claims" ON public.loot_claims FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen Level-Schwellen" ON public.level_thresholds FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen Operationen" ON public.events FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen alle Blaupausen-Besitzer" ON public.player_blueprints FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen alle Hangare" ON public.hangar_ships FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen benötigte Rollen" ON public.event_role_requirements FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen benötigte Schiffe" ON public.event_ship_requirements FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen das Lager-Protokoll" ON public.loot_log FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen das Punktebuch" ON public.points_log FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen den Katalog" ON public.blueprints FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Eingeloggte sehen den Loot" ON public.loot_items FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Einkaufsliste: eigene eintragen" ON public.shopping_list FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.is_approved() AS is_approved)));
CREATE POLICY "Einkaufsliste: eigene lesen" ON public.shopping_list FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.is_approved() AS is_approved)));
CREATE POLICY "Einkaufsliste: eigene löschen" ON public.shopping_list FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Einkaufsliste: eigene ändern" ON public.shopping_list FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.is_approved() AS is_approved))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT public.is_approved() AS is_approved)));
CREATE POLICY "Einladungscodes: nur Admins" ON public.invite_codes TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = 'admin'::public.app_role)) WITH CHECK ((( SELECT public.get_my_role() AS get_my_role) = 'admin'::public.app_role));
CREATE POLICY "Katalog-Stand: Freigegebene lesen" ON public.catalog_meta FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Katalog: Freigegebene lesen" ON public.catalog_blueprints FOR SELECT TO authenticated USING (( SELECT public.is_approved() AS is_approved));
CREATE POLICY "Nur Admins ändern Profile" ON public.profiles FOR UPDATE TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = 'admin'::public.app_role)) WITH CHECK ((( SELECT public.get_my_role() AS get_my_role) = 'admin'::public.app_role));
CREATE POLICY "Officer und Admin legen Operationen an" ON public.events FOR INSERT TO authenticated WITH CHECK (((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role])) AND (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "Officer und Admin löschen Operationen" ON public.events FOR DELETE TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role])));
CREATE POLICY "Officer und Admin pflegen Schiffe" ON public.ships TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role]))) WITH CHECK ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role])));
CREATE POLICY "Officer und Admin pflegen benötigte Rollen" ON public.event_role_requirements TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role]))) WITH CHECK ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role])));
CREATE POLICY "Officer und Admin pflegen benötigte Schiffe" ON public.event_ship_requirements TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role]))) WITH CHECK ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role])));
CREATE POLICY "Officer und Admin pflegen den Katalog" ON public.blueprints TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role]))) WITH CHECK ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role])));
CREATE POLICY "Officer und Admin pflegen den Loot" ON public.loot_items TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role]))) WITH CHECK ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role])));
CREATE POLICY "Officer und Admin sehen das Kassenbuch" ON public.cash_ledger FOR SELECT TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role])));
CREATE POLICY "Officer und Admin ändern Operationen" ON public.events FOR UPDATE TO authenticated USING ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role]))) WITH CHECK ((( SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['officer'::public.app_role, 'admin'::public.app_role])));
CREATE POLICY "Selbst abmelden, solange geplant" ON public.event_signups FOR DELETE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_signups.event_id) AND (e.status = 'planned'::public.event_status))))));
ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.craft_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_role_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ship_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hangar_ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loot_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loot_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE ALL ON FUNCTION public._craft_close(p_uid uuid, p_id bigint, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public._craft_close(p_uid uuid, p_id bigint, p_action text) TO service_role;
REVOKE ALL ON FUNCTION public._craft_create(p_uid uuid, p_blueprint_id bigint, p_qty integer, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public._craft_create(p_uid uuid, p_blueprint_id bigint, p_qty integer, p_note text) TO service_role;
REVOKE ALL ON FUNCTION public._craft_take(p_uid uuid, p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public._craft_take(p_uid uuid, p_id bigint) TO service_role;
GRANT ALL ON FUNCTION public._try(p_id uuid, p_provider text, p_meta jsonb) TO anon;
GRANT ALL ON FUNCTION public._try(p_id uuid, p_provider text, p_meta jsonb) TO authenticated;
GRANT ALL ON FUNCTION public._try(p_id uuid, p_provider text, p_meta jsonb) TO service_role;
GRANT ALL ON FUNCTION public._u(n integer) TO anon;
GRANT ALL ON FUNCTION public._u(n integer) TO authenticated;
GRANT ALL ON FUNCTION public._u(n integer) TO service_role;
REVOKE ALL ON FUNCTION public.add_my_blueprints(p_items jsonb, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_my_blueprints(p_items jsonb, p_source text) TO authenticated;
GRANT ALL ON FUNCTION public.add_my_blueprints(p_items jsonb, p_source text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_create_password_reset(p_user_id uuid, p_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_create_password_reset(p_user_id uuid, p_hash text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_create_password_reset(p_user_id uuid, p_hash text) TO service_role;
REVOKE ALL ON FUNCTION public.apply_inactivity_decay() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_inactivity_decay() TO service_role;
REVOKE ALL ON FUNCTION public.approve_user(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.approve_user(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.approve_user(p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.award_loot(p_item_id bigint, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.award_loot(p_item_id bigint, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.award_loot(p_item_id bigint, p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.block_user(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.block_user(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.block_user(p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_award(p_item_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_award(p_item_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_award(p_item_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.catalog_org_overview() FROM PUBLIC;
GRANT ALL ON FUNCTION public.catalog_org_overview() TO authenticated;
GRANT ALL ON FUNCTION public.catalog_org_overview() TO service_role;
REVOKE ALL ON FUNCTION public.check_invite_code(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_invite_code(p_code text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_due_reminders() FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_due_reminders() TO service_role;
REVOKE ALL ON FUNCTION public.claim_loot(p_item_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_loot(p_item_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.claim_loot(p_item_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.claim_pending_notice() FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_pending_notice() TO authenticated;
GRANT ALL ON FUNCTION public.claim_pending_notice() TO service_role;
REVOKE ALL ON FUNCTION public.close_craft_request(p_id bigint, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.close_craft_request(p_id bigint, p_action text) TO authenticated;
GRANT ALL ON FUNCTION public.close_craft_request(p_id bigint, p_action text) TO service_role;
REVOKE ALL ON FUNCTION public.confirm_payment(p_item_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_payment(p_item_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.confirm_payment(p_item_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.consume_password_reset(p_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_password_reset(p_hash text) TO service_role;
REVOKE ALL ON FUNCTION public.create_craft_request(p_blueprint_id bigint, p_qty integer, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_craft_request(p_blueprint_id bigint, p_qty integer, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.create_craft_request(p_blueprint_id bigint, p_qty integer, p_note text) TO service_role;
REVOKE ALL ON FUNCTION public.create_event(p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_event(p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_event(p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.delete_member(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_member(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_member(p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.discord_close_craft_request(p_discord_id text, p_id bigint, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.discord_close_craft_request(p_discord_id text, p_id bigint, p_action text) TO service_role;
REVOKE ALL ON FUNCTION public.discord_create_craft_request(p_discord_id text, p_blueprint_id bigint, p_qty integer, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.discord_create_craft_request(p_discord_id text, p_blueprint_id bigint, p_qty integer, p_note text) TO service_role;
REVOKE ALL ON FUNCTION public.discord_create_password_reset(p_discord_id text, p_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.discord_create_password_reset(p_discord_id text, p_hash text) TO service_role;
REVOKE ALL ON FUNCTION public.discord_event_signoff(p_discord_id text, p_event_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.discord_event_signoff(p_discord_id text, p_event_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.discord_event_signup(p_discord_id text, p_event_id bigint, p_role_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.discord_event_signup(p_discord_id text, p_event_id bigint, p_role_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.discord_link_account(p_discord_id text, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.discord_link_account(p_discord_id text, p_code text) TO service_role;
REVOKE ALL ON FUNCTION public.discord_loot_claim(p_discord_id text, p_item_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.discord_loot_claim(p_discord_id text, p_item_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.discord_loot_unclaim(p_discord_id text, p_item_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.discord_loot_unclaim(p_discord_id text, p_item_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.discord_take_craft_request(p_discord_id text, p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.discord_take_craft_request(p_discord_id text, p_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.ensure_org_blueprint(p_catalog_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_org_blueprint(p_catalog_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_org_blueprint(p_catalog_uuid uuid) TO service_role;
REVOKE ALL ON FUNCTION public.finish_event(p_event_id bigint, p_attendees uuid[], p_loot jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_event(p_event_id bigint, p_attendees uuid[], p_loot jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.finish_event(p_event_id bigint, p_attendees uuid[], p_loot jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_role() TO service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;
REVOKE ALL ON FUNCTION public.import_blueprints_for_token(p_token_hash text, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_blueprints_for_token(p_token_hash text, p_items jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.is_approved() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_approved() TO authenticated;
GRANT ALL ON FUNCTION public.is_approved() TO service_role;
REVOKE ALL ON FUNCTION public.login_throttle_check(p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_throttle_check(p_key text) TO service_role;
REVOKE ALL ON FUNCTION public.login_throttle_fail(p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_throttle_fail(p_key text) TO service_role;
REVOKE ALL ON FUNCTION public.login_throttle_reset(p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_throttle_reset(p_key text) TO service_role;
REVOKE ALL ON FUNCTION public.move_loot(p_item_id bigint, p_location text, p_holder uuid, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.move_loot(p_item_id bigint, p_location text, p_holder uuid, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.move_loot(p_item_id bigint, p_location text, p_holder uuid, p_note text) TO service_role;
REVOKE ALL ON FUNCTION public.my_import_helper_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_import_helper_status() TO authenticated;
GRANT ALL ON FUNCTION public.my_import_helper_status() TO service_role;
REVOKE ALL ON FUNCTION public.peek_password_reset(p_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.peek_password_reset(p_hash text) TO service_role;
REVOKE ALL ON FUNCTION public.reject_user(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reject_user(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reject_user(p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.release_loot(p_item_id bigint, p_price bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_loot(p_item_id bigint, p_price bigint) TO authenticated;
GRANT ALL ON FUNCTION public.release_loot(p_item_id bigint, p_price bigint) TO service_role;
REVOKE ALL ON FUNCTION public.require_approved_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.require_approved_user() TO service_role;
REVOKE ALL ON FUNCTION public.reset_event_reminders() FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_event_reminders() TO service_role;
REVOKE ALL ON FUNCTION public.revoke_my_import_token() FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_my_import_token() TO authenticated;
GRANT ALL ON FUNCTION public.revoke_my_import_token() TO service_role;
REVOKE ALL ON FUNCTION public.run_daily_maintenance() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_daily_maintenance() TO authenticated;
GRANT ALL ON FUNCTION public.run_daily_maintenance() TO service_role;
REVOKE ALL ON FUNCTION public.run_daily_maintenance_system() FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_daily_maintenance_system() TO service_role;
REVOKE ALL ON FUNCTION public.set_discord_link_code(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_discord_link_code(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.set_discord_link_code(p_code text) TO service_role;
REVOKE ALL ON FUNCTION public.set_display_name(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_display_name(p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.set_display_name(p_name text) TO service_role;
REVOKE ALL ON FUNCTION public.set_import_token(p_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_import_token(p_hash text) TO authenticated;
GRANT ALL ON FUNCTION public.set_import_token(p_hash text) TO service_role;
REVOKE ALL ON FUNCTION public.set_user_role(p_user_id uuid, p_role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_user_role(p_user_id uuid, p_role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.set_user_role(p_user_id uuid, p_role public.app_role) TO service_role;
REVOKE ALL ON FUNCTION public.signup_for_event(p_event_id bigint, p_role_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.signup_for_event(p_event_id bigint, p_role_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.signup_for_event(p_event_id bigint, p_role_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.take_craft_request(p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.take_craft_request(p_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.take_craft_request(p_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.unblock_user(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unblock_user(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unblock_user(p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.update_event(p_event_id bigint, p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_event(p_event_id bigint, p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.update_event(p_event_id bigint, p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.withdraw_claim(p_item_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.withdraw_claim(p_item_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.withdraw_claim(p_item_id bigint) TO service_role;
GRANT ALL ON TABLE public.blueprints TO authenticated;
GRANT ALL ON TABLE public.blueprints TO service_role;
GRANT ALL ON SEQUENCE public.blueprints_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.blueprints_id_seq TO service_role;
GRANT ALL ON TABLE public.cash_ledger TO authenticated;
GRANT ALL ON TABLE public.cash_ledger TO service_role;
GRANT ALL ON SEQUENCE public.cash_ledger_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cash_ledger_id_seq TO service_role;
GRANT ALL ON TABLE public.catalog_blueprints TO authenticated;
GRANT ALL ON TABLE public.catalog_blueprints TO service_role;
GRANT ALL ON TABLE public.catalog_meta TO authenticated;
GRANT ALL ON TABLE public.catalog_meta TO service_role;
GRANT ALL ON TABLE public.craft_requests TO authenticated;
GRANT ALL ON TABLE public.craft_requests TO service_role;
GRANT ALL ON SEQUENCE public.craft_requests_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.craft_requests_id_seq TO service_role;
GRANT ALL ON TABLE public.discord_link_codes TO service_role;
GRANT ALL ON TABLE public.event_role_requirements TO authenticated;
GRANT ALL ON TABLE public.event_role_requirements TO service_role;
GRANT ALL ON SEQUENCE public.event_role_requirements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.event_role_requirements_id_seq TO service_role;
GRANT ALL ON TABLE public.event_ship_requirements TO authenticated;
GRANT ALL ON TABLE public.event_ship_requirements TO service_role;
GRANT ALL ON SEQUENCE public.event_ship_requirements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.event_ship_requirements_id_seq TO service_role;
GRANT ALL ON TABLE public.event_signups TO authenticated;
GRANT ALL ON TABLE public.event_signups TO service_role;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;
GRANT ALL ON SEQUENCE public.events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.events_id_seq TO service_role;
GRANT ALL ON TABLE public.hangar_ships TO authenticated;
GRANT ALL ON TABLE public.hangar_ships TO service_role;
GRANT ALL ON SEQUENCE public.hangar_ships_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.hangar_ships_id_seq TO service_role;
GRANT ALL ON TABLE public.import_tokens TO service_role;
GRANT ALL ON TABLE public.invite_codes TO authenticated;
GRANT ALL ON TABLE public.invite_codes TO service_role;
GRANT ALL ON TABLE public.level_thresholds TO authenticated;
GRANT ALL ON TABLE public.level_thresholds TO service_role;
GRANT ALL ON TABLE public.login_attempts TO service_role;
GRANT ALL ON TABLE public.loot_claims TO authenticated;
GRANT ALL ON TABLE public.loot_claims TO service_role;
GRANT ALL ON SEQUENCE public.loot_claims_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.loot_claims_id_seq TO service_role;
GRANT ALL ON TABLE public.loot_items TO authenticated;
GRANT ALL ON TABLE public.loot_items TO service_role;
GRANT ALL ON SEQUENCE public.loot_items_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.loot_items_id_seq TO service_role;
GRANT ALL ON TABLE public.loot_log TO authenticated;
GRANT ALL ON TABLE public.loot_log TO service_role;
GRANT ALL ON SEQUENCE public.loot_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.loot_log_id_seq TO service_role;
GRANT ALL ON TABLE public.maintenance_runs TO authenticated;
GRANT ALL ON TABLE public.maintenance_runs TO service_role;
GRANT ALL ON TABLE public.password_reset_codes TO service_role;
GRANT ALL ON TABLE public.player_blueprints TO authenticated;
GRANT ALL ON TABLE public.player_blueprints TO service_role;
GRANT ALL ON TABLE public.points_log TO authenticated;
GRANT ALL ON TABLE public.points_log TO service_role;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.player_stats TO authenticated;
GRANT ALL ON TABLE public.player_stats TO service_role;
GRANT ALL ON SEQUENCE public.points_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.points_log_id_seq TO service_role;
GRANT ALL ON TABLE public.ships TO authenticated;
GRANT ALL ON TABLE public.ships TO service_role;
GRANT ALL ON SEQUENCE public.ships_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ships_id_seq TO service_role;
GRANT ALL ON TABLE public.shopping_list TO authenticated;
GRANT ALL ON TABLE public.shopping_list TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
\unrestrict SZtSZHKNNoKjhM7SOxLEw3wo8phXey1EHHtdPKPINwKEw5WzqhOt9fbXBgojooG
