-- DATEI 2 von 3: Anmeldung mit Benutzername und Passwort (ohne E-Mail), Einladungscodes, Discord verknüpfen,
-- Passwort über den Discord-Bot zurücksetzen. Nur EINMAL ausführen.
-- VORHER einzeln ausführen und prüfen, dass KEINE Zeile erscheint (sonst melde dich bei mir):
--   select discord_id, count(*) from public.profiles where discord_id is not null group by 1 having count(*) > 1;

-- =========================================================
-- Anmeldung mit Benutzername und Passwort (ohne E-Mail), Einladungscodes,
-- Discord verknüpfen, Passwort über den Discord-Bot zurücksetzen
-- =========================================================

-- 1) Eine Discord-Kennung gehört höchstens einem Konto
create unique index profiles_discord_id_key on public.profiles (discord_id) where discord_id is not null;

-- 2) Anmeldename (klein geschrieben, 3 bis 24 Zeichen), eindeutig
alter table public.profiles add column login_name text;
alter table public.profiles
  add constraint profiles_login_name_format check (login_name is null or login_name ~ '^[a-z0-9][a-z0-9._-]{2,23}$');
create unique index profiles_login_name_key on public.profiles (login_name) where login_name is not null;

-- 3) Einladungscodes: ohne gültigen Code lässt sich kein Konto mit Benutzername anlegen
create table public.invite_codes (
  code text primary key check (code ~ '^[A-Z0-9-]{6,32}$'),
  note text check (note is null or char_length(note) <= 80),
  max_uses integer not null default 1 check (max_uses between 1 and 500),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index invite_codes_created_by_idx on public.invite_codes (created_by);

alter table public.invite_codes enable row level security;
create policy "Einladungscodes: nur Admins" on public.invite_codes
  for all to authenticated
  using ((select public.get_my_role()) = 'admin')
  with check ((select public.get_my_role()) = 'admin');
revoke all on table public.invite_codes from anon, public;
grant select, insert, update, delete on table public.invite_codes to authenticated;
grant all on table public.invite_codes to service_role;

create or replace function public.check_invite_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.invite_codes
    where code = upper(btrim(coalesce(p_code, '')))
      and not revoked
      and uses < max_uses
      and (expires_at is null or expires_at > now())
  );
$$;
revoke all on function public.check_invite_code(text) from public, anon;
grant execute on function public.check_invite_code(text) to authenticated, service_role;

-- 4) Neue Konten: Discord wie bisher. Alles andere (Benutzername und Passwort) nur mit gültigem Einladungscode.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', '');
  v_code text;
  v_name text;
  v_discord text;
begin
  if v_provider <> 'discord' then
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
  end if;

  v_name := left(btrim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), 40);
  if v_name = '' then
    v_name := case when v_provider = 'discord' then 'Unbekannt' else 'Neues Mitglied' end;
  end if;

  -- Die Discord-Kennung kommt nur bei der Anmeldung über Discord, nie aus frei wählbaren Nutzerdaten
  v_discord := case when v_provider = 'discord' then new.raw_user_meta_data->>'provider_id' end;
  if v_discord is not null and exists (select 1 from public.profiles where discord_id = v_discord) then
    raise exception 'Dieses Discord-Konto ist schon mit einem Konto verknüpft';
  end if;

  insert into public.profiles (id, discord_id, username, avatar_url)
  values (new.id, v_discord, v_name, case when v_provider = 'discord' then new.raw_user_meta_data->>'avatar_url' end);
  return new;
end;
$$;

-- 5) Discord später verknüpfen: Die Seite zeigt einen kurzen Code, in Discord gibt man /verknuepfen ein
create table public.discord_link_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  expires_at timestamptz not null
);
alter table public.discord_link_codes enable row level security;
revoke all on table public.discord_link_codes from anon, authenticated, public;
grant all on table public.discord_link_codes to service_role;

create or replace function public.set_discord_link_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.discord_link_account(p_discord_id text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.set_discord_link_code(text) from public, anon;
grant execute on function public.set_discord_link_code(text) to authenticated;
revoke all on function public.discord_link_account(text, text) from public, anon, authenticated;
grant execute on function public.discord_link_account(text, text) to service_role;

-- 6) Passwort zurücksetzen ohne E-Mail: Der Bot (oder ein Admin) erzeugt einen einmaligen Link, 15 Minuten gültig.
--    Gespeichert wird nur der Fingerabdruck (SHA-256) des Codes, nie der Code selbst.
create table public.password_reset_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  source text not null check (source in ('discord', 'admin')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.password_reset_codes enable row level security;
revoke all on table public.password_reset_codes from anon, authenticated, public;
grant all on table public.password_reset_codes to service_role;

-- Aus Discord: Wer in Discord schreibt, ist durch Discord bestätigt
create or replace function public.discord_create_password_reset(p_discord_id text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Von einem Admin für ein Mitglied (zum Beispiel, wenn Discord nicht verknüpft ist)
create or replace function public.admin_create_password_reset(p_user_id uuid, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Ansehen ohne zu verbrauchen (für die Seite, die das Formular zeigt)
create or replace function public.peek_password_reset(p_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('status', 'ok', 'login_name', p.login_name, 'username', p.username)
       from public.password_reset_codes c
       join public.profiles p on p.id = c.user_id
      where c.code_hash = p_hash and c.expires_at > now() and not p.blocked),
    jsonb_build_object('status', 'invalid')
  );
$$;

-- Einlösen: genau einmal
create or replace function public.consume_password_reset(p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.discord_create_password_reset(text, text) from public, anon, authenticated;
revoke all on function public.admin_create_password_reset(uuid, text) from public, anon;
revoke all on function public.peek_password_reset(text) from public, anon, authenticated;
revoke all on function public.consume_password_reset(text) from public, anon, authenticated;
grant execute on function public.discord_create_password_reset(text, text) to service_role;
grant execute on function public.admin_create_password_reset(uuid, text) to authenticated;
grant execute on function public.peek_password_reset(text) to service_role;
grant execute on function public.consume_password_reset(text) to service_role;

-- 7) Schutz vor Raten: höchstens 10 falsche Anmeldungen je Benutzername in 10 Minuten
create table public.login_attempts (
  key text primary key check (char_length(key) between 1 and 64),
  fails integer not null default 0,
  window_start timestamptz not null default now()
);
alter table public.login_attempts enable row level security;
revoke all on table public.login_attempts from anon, authenticated, public;
grant all on table public.login_attempts to service_role;

create or replace function public.login_throttle_check(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.login_attempts
     where key = lower(left(coalesce(p_key, ''), 64)) and fails >= 10 and window_start > now() - interval '10 minutes'
  );
$$;

create or replace function public.login_throttle_fail(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.login_throttle_reset(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.login_attempts where key = lower(left(coalesce(p_key, ''), 64));
$$;

revoke all on function public.login_throttle_check(text) from public, anon, authenticated;
revoke all on function public.login_throttle_fail(text) from public, anon, authenticated;
revoke all on function public.login_throttle_reset(text) from public, anon, authenticated;
grant execute on function public.login_throttle_check(text) to service_role;
grant execute on function public.login_throttle_fail(text) to service_role;
grant execute on function public.login_throttle_reset(text) to service_role;
