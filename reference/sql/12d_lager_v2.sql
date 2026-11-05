-- 1) Alte Zeit- und Level-Regeln entfernen
drop function if exists public.resolve_loot_claims();
alter table public.loot_items drop column if exists claim_window_ends_at;

-- 2) Claim setzen: jeder darf, solange das Objekt freigegeben ist
create or replace function public.claim_loot(p_item_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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

-- 3) Eigenen Claim zurückziehen
create or replace function public.withdraw_claim(p_item_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

-- 4) Ein Officer entscheidet, wer das Objekt bekommt
create or replace function public.award_loot(p_item_id bigint, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

-- 5) Zuteilung aufheben: die anderen Claims gelten wieder
create or replace function public.cancel_award(p_item_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

-- 6) Rechte
revoke all on function public.withdraw_claim(bigint) from public, anon;
revoke all on function public.award_loot(bigint, uuid) from public, anon;
grant execute on function public.withdraw_claim(bigint) to authenticated;
grant execute on function public.award_loot(bigint, uuid) to authenticated;
