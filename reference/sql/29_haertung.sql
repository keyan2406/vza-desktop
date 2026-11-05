-- DATEI 29: Zusätzliche Absicherung der Datenbank. Kann gefahrlos mehrfach ausgeführt werden.
-- Voraussetzung: Die SQL-Dateien bis 28 sind gelaufen.

-- 1) Nicht angemeldete Besucher haben gar keinen Tabellenzugriff mehr (zusätzlich zur Zeilen-Sicherheit)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- 2) Einladungscodes prüft nur noch der Server der Seite (Mitglieder können keine Codes durchprobieren)
revoke execute on function public.check_invite_code(text) from authenticated;

-- 3) Längenbegrenzungen als zweite Sicherung neben den Prüfungen in der Seite.
--    Bestehende Daten werden geprüft. Passt etwas nicht, gilt die Regel nur für neue Einträge.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('events',                'events_title_len',        'char_length(title) <= 100'),
      ('events',                'events_description_len',  'description is null or char_length(description) <= 4000'),
      ('event_role_requirements','event_role_name_len',    'char_length(name) <= 60'),
      ('ships',                 'ships_name_len',          'char_length(name) <= 100'),
      ('loot_items',            'loot_items_name_len',     'char_length(name) <= 100'),
      ('loot_items',            'loot_items_note_len',     'location_note is null or char_length(location_note) <= 200'),
      ('craft_requests',        'craft_requests_note_len', 'note is null or char_length(note) <= 200'),
      ('profiles',              'profiles_username_len',   'char_length(username) <= 40'),
      ('blueprints',            'blueprints_name_len',     'char_length(name) <= 120')
    ) as t(tbl, cname, cond)
  loop
    if not exists (select 1 from pg_constraint where conname = r.cname and conrelid = ('public.' || r.tbl)::regclass) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', r.tbl, r.cname, r.cond);
    end if;
    begin
      execute format('alter table public.%I validate constraint %I', r.tbl, r.cname);
    exception when check_violation then
      raise notice 'Regel % bleibt nur für neue Einträge aktiv: Es gibt bestehende Einträge, die zu lang sind.', r.cname;
    end;
  end loop;
end $$;
