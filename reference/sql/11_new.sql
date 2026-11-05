-- 1) Anzeigename selbst ändern
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

revoke all on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;

-- 2) Benötigte Schiffe und Rollen pro Operation
create table public.event_ship_requirements (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  ship_id bigint not null references public.ships(id),
  quantity integer not null default 1 check (quantity between 1 and 100),
  unique (event_id, ship_id)
);

create table public.event_role_requirements (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  quantity integer not null default 1 check (quantity between 1 and 100)
);

create unique index event_role_unique_name
  on public.event_role_requirements (event_id, lower(name));

alter table public.event_ship_requirements enable row level security;
alter table public.event_role_requirements enable row level security;

create policy "Eingeloggte sehen benötigte Schiffe"
  on public.event_ship_requirements for select to authenticated
  using (true);

create policy "Officer und Admin pflegen benötigte Schiffe"
  on public.event_ship_requirements for all to authenticated
  using (public.get_my_role() in ('officer', 'admin'))
  with check (public.get_my_role() in ('officer', 'admin'));

create policy "Eingeloggte sehen benötigte Rollen"
  on public.event_role_requirements for select to authenticated
  using (true);

create policy "Officer und Admin pflegen benötigte Rollen"
  on public.event_role_requirements for all to authenticated
  using (public.get_my_role() in ('officer', 'admin'))
  with check (public.get_my_role() in ('officer', 'admin'));

-- 3) Anmeldung mit optionaler Rolle
alter table public.event_signups
  add column role_id bigint references public.event_role_requirements(id) on delete set null;

drop policy "Selbst anmelden, solange geplant" on public.event_signups;

create or replace function public.signup_for_event(
  p_event_id bigint,
  p_role_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.signup_for_event(bigint, bigint) from public, anon;
grant execute on function public.signup_for_event(bigint, bigint) to authenticated;

-- 4) Loot und Lager
create type public.loot_status as enum ('locked', 'released', 'sold');
create type public.loot_location as enum ('player', 'vizsla_bank');

create table public.loot_items (
  id bigint generated always as identity primary key,
  event_id bigint references public.events(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  quantity integer not null check (quantity >= 1),
  holder_id uuid references public.profiles(id) on delete set null,
  location public.loot_location not null default 'player',
  location_note text,
  status public.loot_status not null default 'locked',
  price_auec bigint check (price_auec is null or price_auec >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.loot_items (event_id);
create index on public.loot_items (holder_id);

create table public.loot_log (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.loot_items(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index on public.loot_log (item_id);

alter table public.loot_items enable row level security;
alter table public.loot_log enable row level security;

create policy "Eingeloggte sehen den Loot"
  on public.loot_items for select to authenticated
  using (true);

create policy "Officer und Admin pflegen den Loot"
  on public.loot_items for all to authenticated
  using (public.get_my_role() in ('officer', 'admin'))
  with check (public.get_my_role() in ('officer', 'admin'));

create policy "Eingeloggte sehen das Lager-Protokoll"
  on public.loot_log for select to authenticated
  using (true);

-- 5) Operation anlegen (mit Schiffen und Rollen in einem Schritt)
create or replace function public.create_event(
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_min_players integer,
  p_points integer,
  p_ships jsonb,
  p_roles jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.create_event(text, text, timestamptz, integer, integer, jsonb, jsonb) from public, anon;
grant execute on function public.create_event(text, text, timestamptz, integer, integer, jsonb, jsonb) to authenticated;

-- 6) Operation abschließen: Teilnehmer, Punkte und Loot in einem Schritt
drop function public.finish_event(bigint, uuid[]);

create or replace function public.finish_event(
  p_event_id bigint,
  p_attendees uuid[],
  p_loot jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.finish_event(bigint, uuid[], jsonb) from public, anon;
grant execute on function public.finish_event(bigint, uuid[], jsonb) to authenticated;
