-- =========================================================
-- 1) Einkaufsliste: pro Mitglied eine Liste von Blaupausen mit Stückzahl
-- =========================================================
create table public.shopping_list (
  user_id uuid not null references public.profiles(id) on delete cascade,
  blueprint_id bigint not null references public.blueprints(id) on delete cascade,
  qty integer not null default 1 check (qty between 1 and 99),
  created_at timestamptz not null default now(),
  primary key (user_id, blueprint_id)
);

alter table public.shopping_list enable row level security;

create policy "Einkaufsliste: eigene lesen" on public.shopping_list
  for select to authenticated using (user_id = (select auth.uid()) and public.is_approved());
create policy "Einkaufsliste: eigene eintragen" on public.shopping_list
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_approved());
create policy "Einkaufsliste: eigene ändern" on public.shopping_list
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_approved())
  with check (user_id = (select auth.uid()) and public.is_approved());
create policy "Einkaufsliste: eigene löschen" on public.shopping_list
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.shopping_list from anon, public;
grant select, insert, update, delete on table public.shopping_list to authenticated;
grant all on table public.shopping_list to service_role;

-- =========================================================
-- 2) Anfragen: "Wer kann mir das herstellen?"
-- =========================================================
create table public.craft_requests (
  id bigint generated always as identity primary key,
  blueprint_id bigint not null references public.blueprints(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  qty integer not null default 1 check (qty between 1 and 99),
  note text check (note is null or char_length(note) <= 200),
  status text not null default 'open' check (status in ('open', 'taken', 'done', 'cancelled')),
  taker_id uuid references public.profiles(id) on delete set null,
  discord_channel_id text,
  discord_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index craft_requests_status_idx on public.craft_requests (status, created_at desc);
create index craft_requests_blueprint_idx on public.craft_requests (blueprint_id);
create index craft_requests_requester_idx on public.craft_requests (requester_id);
create index craft_requests_taker_idx on public.craft_requests (taker_id);

alter table public.craft_requests enable row level security;

-- Alle Freigegebenen sehen die Anfragen. Geschrieben wird nur über die Funktionen unten.
create policy "Anfragen: Freigegebene lesen" on public.craft_requests
  for select to authenticated using (public.is_approved());

revoke all on table public.craft_requests from anon, public;
grant select on table public.craft_requests to authenticated;
grant all on table public.craft_requests to service_role;

-- ---------- Anlegen ----------
create or replace function public._craft_create(p_uid uuid, p_blueprint_id bigint, p_qty integer, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

-- ---------- Übernehmen ----------
create or replace function public._craft_take(p_uid uuid, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

-- ---------- Abschließen: done, cancel, release ----------
create or replace function public._craft_close(p_uid uuid, p_id bigint, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

-- ---------- Aufrufe von der Seite (angemeldetes Mitglied) ----------
create or replace function public.create_craft_request(p_blueprint_id bigint, p_qty integer default 1, p_note text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select public._craft_create((select auth.uid()), p_blueprint_id, p_qty, p_note);
$$;
create or replace function public.take_craft_request(p_id bigint)
returns jsonb language sql security definer set search_path = '' as $$
  select public._craft_take((select auth.uid()), p_id);
$$;
create or replace function public.close_craft_request(p_id bigint, p_action text)
returns jsonb language sql security definer set search_path = '' as $$
  select public._craft_close((select auth.uid()), p_id, p_action);
$$;

-- ---------- Aufrufe aus Discord (nur der Server der Seite) ----------
create or replace function public.discord_create_craft_request(p_discord_id text, p_blueprint_id bigint, p_qty integer default 1, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles where discord_id = p_discord_id limit 1;
  if v_uid is null then return jsonb_build_object('status', 'no_account'); end if;
  return public._craft_create(v_uid, p_blueprint_id, p_qty, p_note);
end;
$$;
create or replace function public.discord_take_craft_request(p_discord_id text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles where discord_id = p_discord_id limit 1;
  if v_uid is null then return jsonb_build_object('status', 'no_account'); end if;
  return public._craft_take(v_uid, p_id);
end;
$$;
create or replace function public.discord_close_craft_request(p_discord_id text, p_id bigint, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles where discord_id = p_discord_id limit 1;
  if v_uid is null then return jsonb_build_object('status', 'no_account'); end if;
  return public._craft_close(v_uid, p_id, p_action);
end;
$$;

-- ---------- Rechte ----------
revoke all on function public._craft_create(uuid, bigint, integer, text) from public, anon, authenticated;
revoke all on function public._craft_take(uuid, bigint) from public, anon, authenticated;
revoke all on function public._craft_close(uuid, bigint, text) from public, anon, authenticated;

revoke all on function public.create_craft_request(bigint, integer, text) from public, anon;
revoke all on function public.take_craft_request(bigint) from public, anon;
revoke all on function public.close_craft_request(bigint, text) from public, anon;
grant execute on function public.create_craft_request(bigint, integer, text) to authenticated;
grant execute on function public.take_craft_request(bigint) to authenticated;
grant execute on function public.close_craft_request(bigint, text) to authenticated;

revoke all on function public.discord_create_craft_request(text, bigint, integer, text) from public, anon, authenticated;
revoke all on function public.discord_take_craft_request(text, bigint) from public, anon, authenticated;
revoke all on function public.discord_close_craft_request(text, bigint, text) from public, anon, authenticated;
grant execute on function public.discord_create_craft_request(text, bigint, integer, text) to service_role;
grant execute on function public.discord_take_craft_request(text, bigint) to service_role;
grant execute on function public.discord_close_craft_request(text, bigint, text) to service_role;

-- =========================================================
-- 3) Rezept-Status: ok, none (gibt es sicher nicht), unknown (konnte nicht geklärt werden)
-- =========================================================
alter table public.blueprints
  add column recipe_state text check (recipe_state is null or recipe_state in ('ok', 'none', 'unknown'));

update public.blueprints set recipe_state = 'ok' where recipe is not null;
-- Alles ohne Rezept wird mit dem verbesserten Abruf noch einmal versucht
update public.blueprints set recipe_checked_at = null where recipe is null;
