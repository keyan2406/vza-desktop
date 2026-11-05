-- Rezept zur Blaupause: Zutaten, Herstellzeit, Verfügbarkeit (aus der Star Citizen Wiki API)
alter table public.blueprints
  add column recipe jsonb,
  add column recipe_checked_at timestamptz;
