-- DATEI 3 von 3: Katalog aller Blaupausen im Spiel. Nur EINMAL ausführen.

-- =========================================================
-- Katalog aller herstellbaren Blaupausen im Spiel
-- =========================================================
create table public.catalog_blueprints (
  uuid uuid primary key,
  name text not null,
  name_norm text generated always as (lower(btrim(name))) stored,
  class_name text,
  type text,
  type_label text,
  grade text,
  craft_secs integer,
  free boolean not null default false,
  ingredient_count integer not null default 0,
  ingredients jsonb not null default '[]'::jsonb,
  missions_count integer not null default 0,
  sources jsonb not null default '[]'::jsonb,
  detail jsonb,
  detail_checked_at timestamptz,
  game_version text,
  synced_at timestamptz not null default now()
);
create index catalog_blueprints_name_norm_idx on public.catalog_blueprints (name_norm);
create index catalog_blueprints_synced_idx on public.catalog_blueprints (synced_at);

-- Wann zuletzt abgeglichen wurde (immer genau eine Zeile)
create table public.catalog_meta (
  id integer primary key default 1 check (id = 1),
  synced_at timestamptz,
  blueprint_count integer,
  mission_count integer,
  giver_count integer,
  game_version text
);

alter table public.catalog_blueprints enable row level security;
alter table public.catalog_meta enable row level security;
create policy "Katalog: Freigegebene lesen" on public.catalog_blueprints
  for select to authenticated using ((select public.is_approved()));
create policy "Katalog-Stand: Freigegebene lesen" on public.catalog_meta
  for select to authenticated using ((select public.is_approved()));
-- Geschrieben wird nur vom Server der Seite (Dienst-Schlüssel), nie direkt von Mitgliedern.
revoke all on table public.catalog_blueprints from anon, public;
revoke all on table public.catalog_meta from anon, public;
grant select on table public.catalog_blueprints to authenticated;
grant select on table public.catalog_meta to authenticated;
grant all on table public.catalog_blueprints to service_role;
grant all on table public.catalog_meta to service_role;

-- Wer in der Org besitzt welche Blaupause? Eine kurze Liste statt vieler Einzelabfragen.
create or replace function public.catalog_org_overview()
returns table (blueprint_id bigint, name_norm text, owners integer, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
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
revoke all on function public.catalog_org_overview() from public, anon;
grant execute on function public.catalog_org_overview() to authenticated;

-- Legt zu einer Katalog-Blaupause den Org-Eintrag an (falls es ihn noch nicht gibt). Gebraucht für Einkaufsliste und Anfragen.
create or replace function public.ensure_org_blueprint(p_catalog_uuid uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
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
revoke all on function public.ensure_org_blueprint(uuid) from public, anon;
grant execute on function public.ensure_org_blueprint(uuid) to authenticated;
