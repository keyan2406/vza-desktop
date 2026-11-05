-- 1) Kategorie von Hand überschreiben (leer = automatisch erkennen)
alter table public.blueprints
  add column category text
  check (category is null or category in ('ruestung', 'waffen', 'schiffswaffen', 'munition', 'komponenten', 'sonstiges'));

-- 2) Eintragen: fehlt einem bekannten Eintrag noch der interne Schlüssel, wird er jetzt ergänzt
create or replace function public.add_my_blueprints(p_items jsonb, p_source text default 'import')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
