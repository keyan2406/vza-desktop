-- Beschreibung der Blaupause (Klasse, Grade, Größe, Typ, Hersteller) aus der Star Citizen Wiki API
alter table public.blueprints
  add column details jsonb,
  add column details_checked_at timestamptz;
