-- Merken, welches Discord-Event zu welcher Operation gehört
alter table public.events add column discord_event_id text;
