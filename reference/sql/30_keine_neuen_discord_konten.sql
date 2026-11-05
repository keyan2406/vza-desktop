-- DATEI 30: Neue Konten gibt es nur noch mit Benutzername und Einladungscode (nicht mehr über Discord).
-- Das verhindert doppelte Konten: Wer schon ein Konto hat und sich "mit Discord" anmeldet, bekäme sonst ein zweites.
-- Bestehende Konten, die sich mit Discord angemeldet haben, sind NICHT betroffen und können sich weiter anmelden.
-- Kann gefahrlos mehrfach ausgeführt werden. Voraussetzung: SQL 26 ist gelaufen.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', '');
  v_code text;
  v_name text;
begin
  if v_provider = 'discord' then
    raise exception 'Neue Konten gibt es nur mit Benutzername und Einladungscode';
  end if;

  v_code := upper(btrim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  update public.invite_codes
     set uses = uses + 1
   where code = v_code
     and not revoked
     and uses < max_uses
     and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'Ungültiger Einladungscode';
  end if;

  v_name := left(btrim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), 40);
  if v_name = '' then
    v_name := 'Neues Mitglied';
  end if;

  -- Die Discord-Kennung wird nur über den Code in Discord (/verknuepfen) gesetzt, nie aus frei wählbaren Nutzerdaten
  insert into public.profiles (id, discord_id, username, avatar_url)
  values (new.id, null, v_name, null);
  return new;
end;
$$;
