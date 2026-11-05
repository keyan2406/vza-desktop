-- DATEI 1 von 3: Geschwindigkeit. Voraussetzung: Die früheren SQL-Schritte (bis Anfragen/Einkaufsliste) sind schon gelaufen.
-- Kann gefahrlos mehrfach ausgeführt werden.

-- =========================================================
-- Geschwindigkeit
-- =========================================================

-- 1) Fehlende Indizes auf Fremdschlüsseln (bremsen bei viel Verlauf Verknüpfungen und Löschvorgänge)
create index if not exists cash_ledger_buyer_idx on public.cash_ledger (buyer_id);
create index if not exists cash_ledger_confirmed_by_idx on public.cash_ledger (confirmed_by);
create index if not exists cash_ledger_item_idx on public.cash_ledger (item_id);
create index if not exists event_ship_requirements_ship_idx on public.event_ship_requirements (ship_id);
create index if not exists event_signups_role_idx on public.event_signups (role_id);
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists loot_items_created_by_idx on public.loot_items (created_by);
create index if not exists loot_items_released_by_idx on public.loot_items (released_by);
create index if not exists loot_items_winner_idx on public.loot_items (winner_id);
create index if not exists loot_log_user_idx on public.loot_log (user_id);
create index if not exists points_log_event_idx on public.points_log (event_id);
create index if not exists shopping_list_blueprint_idx on public.shopping_list (blueprint_id);

-- 2) Tägliche Wartung läuft über einen Zeitplan statt bei jedem Seitenaufruf
create or replace function public.run_daily_maintenance_system()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ran boolean;
begin
  insert into public.maintenance_runs (name, last_run)
  values ('inactivity_decay', now() - interval '2 days')
  on conflict (name) do nothing;

  update public.maintenance_runs
     set last_run = now()
   where name = 'inactivity_decay'
     and last_run < now() - interval '20 hours'
  returning true into v_ran;

  if coalesce(v_ran, false) then
    perform public.apply_inactivity_decay();
  end if;
  return coalesce(v_ran, false);
end;
$$;
revoke all on function public.run_daily_maintenance_system() from public, anon, authenticated;

-- 3) Zugriffsregeln: is_approved() und get_my_role() nur noch einmal pro Abfrage auswerten statt je Zeile.
--    Die Bedeutung der Regeln bleibt gleich (Vorher-Nachher-Vergleich: 0 Abweichungen).
alter policy "Eingeloggte sehen den Katalog" on public.blueprints using ((select public.is_approved()));
alter policy "Officer und Admin pflegen den Katalog" on public.blueprints using (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role]))) with check (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role])));
alter policy "Officer und Admin sehen das Kassenbuch" on public.cash_ledger using (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role])));
alter policy "Anfragen: Freigegebene lesen" on public.craft_requests using ((select public.is_approved()));
alter policy "Eingeloggte sehen benötigte Rollen" on public.event_role_requirements using ((select public.is_approved()));
alter policy "Officer und Admin pflegen benötigte Rollen" on public.event_role_requirements using (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role]))) with check (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role])));
alter policy "Eingeloggte sehen benötigte Schiffe" on public.event_ship_requirements using ((select public.is_approved()));
alter policy "Officer und Admin pflegen benötigte Schiffe" on public.event_ship_requirements using (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role]))) with check (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role])));
alter policy "Eingeloggte sehen Anmeldungen" on public.event_signups using ((select public.is_approved()));
alter policy "Eingeloggte sehen Operationen" on public.events using ((select public.is_approved()));
alter policy "Officer und Admin legen Operationen an" on public.events with check ((((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role])) AND (created_by = ( SELECT auth.uid() AS uid))));
alter policy "Officer und Admin löschen Operationen" on public.events using (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role])));
alter policy "Officer und Admin ändern Operationen" on public.events using (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role]))) with check (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role])));
alter policy "Eigene Schiffe eintragen" on public.hangar_ships with check (((user_id = ( SELECT auth.uid() AS uid)) AND (select public.is_approved())));
alter policy "Eigene Schiffe löschen, Admin darf alle" on public.hangar_ships using (((user_id = ( SELECT auth.uid() AS uid)) OR ((select public.get_my_role()) = 'admin'::app_role)));
alter policy "Eigene Schiffe ändern" on public.hangar_ships using (((user_id = ( SELECT auth.uid() AS uid)) AND (select public.is_approved()))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (select public.is_approved())));
alter policy "Eingeloggte sehen alle Hangare" on public.hangar_ships using ((select public.is_approved()));
alter policy "Admin pflegt Level-Schwellen" on public.level_thresholds using (((select public.get_my_role()) = 'admin'::app_role)) with check (((select public.get_my_role()) = 'admin'::app_role));
alter policy "Eingeloggte sehen Level-Schwellen" on public.level_thresholds using ((select public.is_approved()));
alter policy "Eingeloggte sehen Claims" on public.loot_claims using ((select public.is_approved()));
alter policy "Eingeloggte sehen den Loot" on public.loot_items using ((select public.is_approved()));
alter policy "Officer und Admin pflegen den Loot" on public.loot_items using (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role]))) with check (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role])));
alter policy "Eingeloggte sehen das Lager-Protokoll" on public.loot_log using ((select public.is_approved()));
alter policy "Eingeloggte sehen alle Blaupausen-Besitzer" on public.player_blueprints using ((select public.is_approved()));
alter policy "Eingeloggte sehen das Punktebuch" on public.points_log using ((select public.is_approved()));
alter policy "Eingeloggte dürfen Profile lesen" on public.profiles using (((id = ( SELECT auth.uid() AS uid)) OR ((select public.is_approved()) AND (approved OR ((select public.get_my_role()) = 'admin'::app_role)))));
alter policy "Nur Admins ändern Profile" on public.profiles using (((select public.get_my_role()) = 'admin'::app_role)) with check (((select public.get_my_role()) = 'admin'::app_role));
alter policy "Eingeloggte dürfen Schiffe lesen" on public.ships using ((select public.is_approved()));
alter policy "Officer und Admin pflegen Schiffe" on public.ships using (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role]))) with check (((select public.get_my_role()) = ANY (ARRAY['officer'::app_role, 'admin'::app_role])));
alter policy "Einkaufsliste: eigene eintragen" on public.shopping_list with check (((user_id = ( SELECT auth.uid() AS uid)) AND (select public.is_approved())));
alter policy "Einkaufsliste: eigene lesen" on public.shopping_list using (((user_id = ( SELECT auth.uid() AS uid)) AND (select public.is_approved())));
alter policy "Einkaufsliste: eigene ändern" on public.shopping_list using (((user_id = ( SELECT auth.uid() AS uid)) AND (select public.is_approved()))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (select public.is_approved())));
