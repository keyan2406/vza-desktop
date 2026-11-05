-- 1) Neuer Status: zugeteilt (Gewinner steht fest, Zahlung offen)
alter type public.loot_status add value if not exists 'awarded';

-- 2) Zusätzliche Felder am Loot
alter table public.loot_items
  add column released_at timestamptz,
  add column released_by uuid references public.profiles(id) on delete set null,
  add column claim_window_ends_at timestamptz,
  add column winner_id uuid references public.profiles(id) on delete set null,
  add column sold_at timestamptz;

-- 3) Claims
create table public.loot_claims (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.loot_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost')),
  created_at timestamptz not null default now(),
  unique (item_id, user_id)
);

create index on public.loot_claims (user_id);

alter table public.loot_claims enable row level security;

create policy "Eingeloggte sehen Claims"
  on public.loot_claims for select to authenticated
  using (true);

-- 4) Kassenbuch (nur Officer und Admin)
create table public.cash_ledger (
  id bigint generated always as identity primary key,
  item_id bigint references public.loot_items(id) on delete set null,
  item_name text not null,
  quantity integer not null,
  buyer_id uuid references public.profiles(id) on delete set null,
  buyer_name text not null,
  amount_auec bigint not null check (amount_auec >= 0),
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.cash_ledger enable row level security;

create policy "Officer und Admin sehen das Kassenbuch"
  on public.cash_ledger for select to authenticated
  using (public.get_my_role() in ('officer', 'admin'));

-- 5) Loot freigeben (Preis setzen)
create or replace function public.release_loot(p_item_id bigint, p_price bigint)
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

-- 6) Abgelaufene Claim-Fenster auswerten
create or replace function public.resolve_loot_claims()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_winner uuid;
  v_level integer;
  v_name text;
  v_count integer := 0;
begin
  for v_item in
    select id from public.loot_items
    where status = 'released'
      and claim_window_ends_at is not null
      and claim_window_ends_at <= now()
    for update skip locked
  loop
    v_winner := null;

    -- Höchstes Level gewinnt, dann mehr Punkte, dann der frühere Claim
    select c.user_id, ps.level into v_winner, v_level
    from public.loot_claims c
    join public.player_stats ps on ps.user_id = c.user_id
    where c.item_id = v_item.id and c.status = 'pending'
    order by ps.level desc, ps.total_points desc, c.created_at asc
    limit 1;

    if v_winner is null then
      update public.loot_items set claim_window_ends_at = null where id = v_item.id;
      continue;
    end if;

    update public.loot_claims
       set status = case when user_id = v_winner then 'won' else 'lost' end
     where item_id = v_item.id and status = 'pending';

    update public.loot_items
       set status = 'awarded', winner_id = v_winner
     where id = v_item.id;

    select username into v_name from public.profiles where id = v_winner;
    insert into public.loot_log (item_id, user_id, action, detail)
    values (v_item.id, null, 'awarded',
            'Claim-Fenster beendet. Zugeteilt an ' || coalesce(v_name, 'Unbekannt')
            || ' (Level ' || v_level || ')');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- 7) Claimen
create or replace function public.claim_loot(p_item_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.loot_items%rowtype;
  v_participant boolean;
  v_name text;
  v_free_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet';
  end if;

  perform public.resolve_loot_claims();

  select * into v_item from public.loot_items where id = p_item_id for update;
  if not found then
    raise exception 'Objekt nicht gefunden';
  end if;
  if v_item.status <> 'released' then
    raise exception 'Dieses Objekt kann nicht geclaimt werden';
  end if;

  select username into v_name from public.profiles where id = v_uid;

  -- Teilnehmer der Operation haben Vorrang
  v_participant := v_item.event_id is null or exists (
    select 1 from public.event_signups s
    where s.event_id = v_item.event_id and s.user_id = v_uid and s.attended
  );
  v_free_at := v_item.released_at + interval '4 days';

  if v_item.claim_window_ends_at is not null then
    -- Claim-Phase läuft: nur Teilnehmer dürfen sich zusätzlich melden
    if not v_participant then
      raise exception 'Claim-Phase: Nur Teilnehmer der Operation können sich melden';
    end if;
    if exists (select 1 from public.loot_claims where item_id = p_item_id and user_id = v_uid) then
      raise exception 'Du hast dieses Objekt bereits geclaimt';
    end if;
    insert into public.loot_claims (item_id, user_id) values (p_item_id, v_uid);
    insert into public.loot_log (item_id, user_id, action, detail)
    values (p_item_id, v_uid, 'claimed', 'Claim von ' || coalesce(v_name, 'Unbekannt'));
    return 'pending';

  elsif now() >= v_free_at then
    -- Länger als 4 Tage im Lager: wer zuerst kommt, mahlt zuerst
    insert into public.loot_claims (item_id, user_id, status) values (p_item_id, v_uid, 'won');
    update public.loot_items set status = 'awarded', winner_id = v_uid where id = p_item_id;
    insert into public.loot_log (item_id, user_id, action, detail)
    values (p_item_id, v_uid, 'awarded',
            'Direkt-Claim von ' || coalesce(v_name, 'Unbekannt'));
    return 'awarded';

  else
    -- Weniger als 4 Tage: nur Teilnehmer, der erste Claim öffnet 24 Stunden
    if not v_participant then
      raise exception 'Noch nicht frei: Bis zum % können nur Teilnehmer der Operation claimen',
        to_char(v_free_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI');
    end if;
    insert into public.loot_claims (item_id, user_id) values (p_item_id, v_uid);
    update public.loot_items
       set claim_window_ends_at = now() + interval '24 hours'
     where id = p_item_id;
    insert into public.loot_log (item_id, user_id, action, detail)
    values (p_item_id, v_uid, 'claimed',
            'Erster Claim von ' || coalesce(v_name, 'Unbekannt') || '. Claim-Fenster 24 Stunden geöffnet');
    return 'pending';
  end if;
end;
$$;

-- 8) Zahlung bestätigen und aus dem Lager ausbuchen
create or replace function public.confirm_payment(p_item_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

-- 9) Zuteilung aufheben (z. B. wenn nicht bezahlt wird)
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

  delete from public.loot_claims where item_id = p_item_id;
  update public.loot_items
     set status = 'released', winner_id = null, claim_window_ends_at = null
   where id = p_item_id;

  insert into public.loot_log (item_id, user_id, action, detail)
  values (p_item_id, (select auth.uid()), 'award_cancelled',
          'Zuteilung aufgehoben, Objekt ist wieder frei');
end;
$$;

-- 10) Standort ändern (mit Protokoll)
create or replace function public.move_loot(
  p_item_id bigint,
  p_location text,
  p_holder uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

-- 11) Rechte: nur eingeloggte Nutzer dürfen die Funktionen aufrufen
revoke all on function public.release_loot(bigint, bigint) from public, anon;
revoke all on function public.resolve_loot_claims() from public, anon;
revoke all on function public.claim_loot(bigint) from public, anon;
revoke all on function public.confirm_payment(bigint) from public, anon;
revoke all on function public.cancel_award(bigint) from public, anon;
revoke all on function public.move_loot(bigint, text, uuid, text) from public, anon;

grant execute on function public.release_loot(bigint, bigint) to authenticated;
grant execute on function public.resolve_loot_claims() to authenticated;
grant execute on function public.claim_loot(bigint) to authenticated;
grant execute on function public.confirm_payment(bigint) to authenticated;
grant execute on function public.cancel_award(bigint) to authenticated;
grant execute on function public.move_loot(bigint, text, uuid, text) to authenticated;
