-- DATEI 28: PC-Helfer für den Import (persönlicher Schlüssel). Nur EINMAL ausführen.
-- Voraussetzung: Die SQL-Dateien 25 bis 27 sind schon gelaufen.

-- =========================================================
-- PC-Helfer für den Import: Ein kleines Programm auf dem PC darf mit einem persönlichen Schlüssel
-- Blaupausen für dich eintragen (ohne Browser, auch aus gesperrten Ordnern wie Program Files).
-- Gespeichert wird nur der Fingerabdruck (SHA-256) des Schlüssels.
-- =========================================================
create table public.import_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0
);
alter table public.import_tokens enable row level security;
revoke all on table public.import_tokens from anon, authenticated, public;
grant all on table public.import_tokens to service_role;

-- Neuen Schlüssel für mich festlegen (ersetzt den alten, der danach nicht mehr geht)
create or replace function public.set_import_token(p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Schlüssel widerrufen
create or replace function public.revoke_my_import_token()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.import_tokens where user_id = (select auth.uid());
$$;

-- Wann wurde der Helfer zuletzt benutzt? (ohne den Schlüssel selbst)
create or replace function public.my_import_helper_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('created_at', created_at, 'last_used_at', last_used_at, 'use_count', use_count)
       from public.import_tokens where user_id = (select auth.uid())),
    'null'::jsonb
  );
$$;

revoke all on function public.set_import_token(text) from public, anon;
revoke all on function public.revoke_my_import_token() from public, anon;
revoke all on function public.my_import_helper_status() from public, anon;
grant execute on function public.set_import_token(text) to authenticated;
grant execute on function public.revoke_my_import_token() to authenticated;
grant execute on function public.my_import_helper_status() to authenticated;

-- Eintragen über den Schlüssel (nur der Server der Seite ruft das auf). Gleiche Regeln wie beim Import auf der Seite.
create or replace function public.import_blueprints_for_token(p_token_hash text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
revoke all on function public.import_blueprints_for_token(text, jsonb) from public, anon, authenticated;
grant execute on function public.import_blueprints_for_token(text, jsonb) to service_role;
