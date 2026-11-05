# Datenbank-Schnittstellen (Supabase)

Das Programm spricht **direkt mit Supabase** (Datenbank und Anmeldung), nicht mit den Routen der WebApp. Zugriff im Programm: nur die **öffentliche** Adresse und der **öffentliche** Schlüssel (`publishable key`) des Supabase-Projekts. Was jemand sehen oder ändern darf, bestimmen allein die **Zeilen-Sicherheitsregeln (RLS)** und die Prüfungen *in* den Datenbankfunktionen. Der **Dienst-Schlüssel (`service_role`) darf nie ins Programm.**

Maßgebliche Quelle: `../reference/db/schema-public.sql` (Tabellen, Regeln, Funktionen). Die alten Routen der WebApp stehen in `02b-alte-webapp-routen-nur-lesen.md` (werden im autonomen Programm nicht gebraucht).

## 1. Funktionen, die angemeldete Mitglieder direkt aufrufen dürfen (supabase-js `rpc`)
Die Berechtigung (Rolle, Freigabe, Besitz) prüft die Funktion selbst (`definer` = läuft mit erhöhten Rechten, prüft intern). Das Programm ruft sie 1:1 so auf wie die WebApp.

| Funktion | Parameter | Ergebnis | Art |
|---|---|---|---|
| `add_my_blueprints` | p_items jsonb, p_source text DEFAULT 'import'::text | jsonb | definer |
| `admin_create_password_reset` | p_user_id uuid, p_hash text | jsonb | definer |
| `approve_user` | p_user_id uuid | void | definer |
| `award_loot` | p_item_id bigint, p_user_id uuid | void | definer |
| `block_user` | p_user_id uuid | void | definer |
| `cancel_award` | p_item_id bigint | void | definer |
| `catalog_org_overview` | – | TABLE(blueprint_id bigint, name_norm text, owners integer, mine boolean) | definer |
| `claim_loot` | p_item_id bigint | text | definer |
| `claim_pending_notice` | – | boolean | definer |
| `close_craft_request` | p_id bigint, p_action text | jsonb | definer |
| `confirm_payment` | p_item_id bigint | void | definer |
| `create_craft_request` | p_blueprint_id bigint, p_qty integer DEFAULT 1, p_note text DEFAULT NULL::text | jsonb | definer |
| `create_event` | p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb | bigint | definer |
| `delete_member` | p_user_id uuid | void | definer |
| `ensure_org_blueprint` | p_catalog_uuid uuid | bigint | definer |
| `finish_event` | p_event_id bigint, p_attendees uuid[], p_loot jsonb DEFAULT '[]'::jsonb | integer | definer |
| `get_my_role` | – | app_role | definer |
| `is_approved` | – | boolean | definer |
| `move_loot` | p_item_id bigint, p_location text, p_holder uuid, p_note text | void | definer |
| `my_import_helper_status` | – | jsonb | definer |
| `reject_user` | p_user_id uuid | void | definer |
| `release_loot` | p_item_id bigint, p_price bigint | void | definer |
| `revoke_my_import_token` | – | void | definer |
| `run_daily_maintenance` | – | boolean | definer |
| `set_discord_link_code` | p_code text | jsonb | definer |
| `set_display_name` | p_name text | void | definer |
| `set_import_token` | p_hash text | jsonb | definer |
| `set_user_role` | p_user_id uuid, p_role app_role | void | definer |
| `signup_for_event` | p_event_id bigint, p_role_id bigint DEFAULT NULL::bigint | void | definer |
| `take_craft_request` | p_id bigint | jsonb | definer |
| `unblock_user` | p_user_id uuid | void | definer |
| `update_event` | p_event_id bigint, p_title text, p_description text, p_starts_at timestamp with time zone, p_min_players integer, p_points integer, p_ships jsonb, p_roles jsonb | jsonb | definer |
| `withdraw_claim` | p_item_id bigint | void | definer |

## 2. Funktionen nur für den Server (`service_role`) – das Programm kann sie NICHT aufrufen
Das sind die Teile, die Geheimnisse brauchen oder ohne Anmeldung laufen (Discord, Anmelde-Auflösung, Passwort-Codes, PC-Helfer, Wartung). Für ein Programm **ohne WebApp** brauchen sie einen neuen Ort: **Supabase Edge Functions** (siehe `10-architektur-autonom.md`).

| Funktion | Parameter | Ergebnis | Art |
|---|---|---|---|
| `apply_inactivity_decay` | – | integer | definer |
| `check_invite_code` | p_code text | boolean | definer |
| `claim_due_reminders` | – | TABLE(event_id bigint, kind text) | definer |
| `consume_password_reset` | p_hash text | jsonb | definer |
| `discord_close_craft_request` | p_discord_id text, p_id bigint, p_action text | jsonb | definer |
| `discord_create_craft_request` | p_discord_id text, p_blueprint_id bigint, p_qty integer DEFAULT 1, p_note text DEFAULT NULL::text | jsonb | definer |
| `discord_create_password_reset` | p_discord_id text, p_hash text | jsonb | definer |
| `discord_event_signoff` | p_discord_id text, p_event_id bigint | jsonb | definer |
| `discord_event_signup` | p_discord_id text, p_event_id bigint, p_role_id bigint DEFAULT NULL::bigint | jsonb | definer |
| `discord_link_account` | p_discord_id text, p_code text | jsonb | definer |
| `discord_loot_claim` | p_discord_id text, p_item_id bigint | jsonb | definer |
| `discord_loot_unclaim` | p_discord_id text, p_item_id bigint | jsonb | definer |
| `discord_take_craft_request` | p_discord_id text, p_id bigint | jsonb | definer |
| `handle_new_user` | – | trigger | definer |
| `import_blueprints_for_token` | p_token_hash text, p_items jsonb | jsonb | definer |
| `login_throttle_check` | p_key text | boolean | definer |
| `login_throttle_fail` | p_key text | void | definer |
| `login_throttle_reset` | p_key text | void | definer |
| `peek_password_reset` | p_hash text | jsonb | definer |
| `require_approved_user` | – | trigger | definer |
| `reset_event_reminders` | – | trigger | invoker |
| `run_daily_maintenance_system` | – | boolean | definer |

## 3. Direkter Tabellenzugriff
Mitglieder lesen viele Tabellen direkt (nur freigegebene Konten, siehe RLS). Schreibrechte direkt auf Tabellen haben nur Officer/Admin (z. B. Operationen, Schiffe-Katalog, Loot) beziehungsweise jedes Mitglied für **eigene** Zeilen (Hangar, Einkaufsliste). Vor der Umsetzung jeder Seite: Regeln der benutzten Tabellen in `schema-public.sql` lesen (`CREATE POLICY`).

## 4. Anmeldung (Supabase Auth)
- Benutzername + Passwort. Jedes Konto hat intern eine Anmelde-Adresse `name@vza.invalid` (wird nie benutzt, nie angeschrieben). Die Zuordnung **Benutzername → Adresse** steht in `profiles.login_name` und darf nur der Server auflösen (sonst wüsste jeder alle Adressen). Das braucht eine Edge Function `login` (siehe Architektur).
- Registrierung nur mit Einladungscode: Prüfung `check_invite_code` (nur Server), Anlegen mit dem Dienst-Schlüssel (`auth.admin.createUser`), Datenbank-Auslöser `handle_new_user` verbraucht den Code. Ebenfalls Edge Function.
- Eine Anmeldung mit Discord gibt es **nicht mehr** (aus der WebApp entfernt, neue Konten per Discord lehnt die Datenbank ab, SQL 30). Das Programm bietet **nur Benutzername + Passwort** an. Discord bleibt für den Bot: Verknüpfung mit `/verknuepfen` (Code aus dem Profil).
- Rollen: `profiles.role` (member/officer/admin), `profiles.approved`, `profiles.blocked`.
- Sitzung: Zugriffs-Token (kurzlebig) + Erneuerungs-Token. Speichern mit Electron `safeStorage`, nie im Klartext auf der Festplatte.

## 5. Discord
Der Bot (Anwendung bei Discord) ruft bisher die Route `/api/discord/interactions` der WebApp auf. Die Adresse ist in Discord eingetragen (Developer Portal → Interactions Endpoint URL). Beim Umzug (Cutover) wird sie auf die neue Edge Function umgestellt. **Davor** auf einem Test-Bot und Test-Server prüfen, nie auf dem echten Server experimentieren.

