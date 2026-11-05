-- Merken, welche Discord-Nachricht zu welcher Operation / welchem Loot gehört
alter table public.events
  add column discord_channel_id text,
  add column discord_message_id text;

alter table public.loot_items
  add column discord_channel_id text,
  add column discord_message_id text;

-- Anmelden per Discord-Knopf. Läuft nur mit dem Service-Schlüssel der Seite, nie im Browser.
create or replace function public.discord_event_signup(
  p_discord_id text,
  p_event_id bigint,
  p_role_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.discord_event_signoff(p_discord_id text, p_event_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

-- Claim setzen und zurückziehen per Discord-Knopf
create or replace function public.discord_loot_claim(p_discord_id text, p_item_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.discord_loot_unclaim(p_discord_id text, p_item_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

-- Nur der Service-Schlüssel der Seite darf diese Funktionen aufrufen
revoke all on function public.discord_event_signup(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.discord_event_signoff(text, bigint) from public, anon, authenticated;
revoke all on function public.discord_loot_claim(text, bigint) from public, anon, authenticated;
revoke all on function public.discord_loot_unclaim(text, bigint) from public, anon, authenticated;

grant execute on function public.discord_event_signup(text, bigint, bigint) to service_role;
grant execute on function public.discord_event_signoff(text, bigint) to service_role;
grant execute on function public.discord_loot_claim(text, bigint) to service_role;
grant execute on function public.discord_loot_unclaim(text, bigint) to service_role;
