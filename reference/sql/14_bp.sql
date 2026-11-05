-- 1) Katalog aller bekannten Blaupausen (wächst durch Importe und manuelles Eintragen)
create table public.blueprints (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  name_norm text generated always as (lower(btrim(name))) stored,
  ini_key text,
  created_at timestamptz not null default now()
);

create unique index blueprints_name_norm_key on public.blueprints (name_norm);

-- 2) Wer besitzt welche Blaupause
create table public.player_blueprints (
  user_id uuid not null references public.profiles(id) on delete cascade,
  blueprint_id bigint not null references public.blueprints(id) on delete cascade,
  acquired_at timestamptz,
  source text not null default 'import' check (source in ('manual', 'import')),
  created_at timestamptz not null default now(),
  primary key (user_id, blueprint_id)
);

create index on public.player_blueprints (blueprint_id);

alter table public.blueprints enable row level security;
alter table public.player_blueprints enable row level security;

create policy "Eingeloggte sehen den Katalog"
  on public.blueprints for select to authenticated
  using (true);

create policy "Officer und Admin pflegen den Katalog"
  on public.blueprints for all to authenticated
  using (public.get_my_role() in ('officer', 'admin'))
  with check (public.get_my_role() in ('officer', 'admin'));

create policy "Eingeloggte sehen alle Blaupausen-Besitzer"
  on public.player_blueprints for select to authenticated
  using (true);

create policy "Eigene Blaupausen entfernen"
  on public.player_blueprints for delete to authenticated
  using (user_id = (select auth.uid()));

-- 3) Blaupausen für mich eintragen (Import oder manuell), ergänzt nur, überschreibt nichts
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
             case when (x.value->>'at') ~ '^\d{4}-\d{2}-\d{2}T' then (x.value->>'at')::timestamptz end nulls last
  ) c;

  v_clean_count := jsonb_array_length(v_clean);

  insert into public.blueprints (name, ini_key)
  select t.name, left(t.ini, 150)
  from jsonb_to_recordset(v_clean) as t(name text, ini text, at timestamptz)
  on conflict (name_norm) do nothing;
  get diagnostics v_new_catalog = row_count;

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

revoke all on function public.add_my_blueprints(jsonb, text) from public, anon;
grant execute on function public.add_my_blueprints(jsonb, text) to authenticated;
