# Datenmodell (Auszug aus der echten Datenbank, Stand SQL 29)

Die Datenbank liegt bei Supabase (PostgreSQL). **Das Desktop-Programm greift NICHT direkt auf die Datenbank zu**, sondern nur über die Schnittstellen der WebApp (siehe `02-api-vertrag.md`). Diese Übersicht dient dem Verständnis. Alle Tabellen haben Zeilen-Sicherheit (RLS).

Aufzählungen: app_role = member, officer, admin · event_status = planned, running, finished, cancelled · ship_source = ingame, pledge · loot_status = locked, released, sold, awarded · loot_location = player, vizsla_bank


## blueprints

Blaupausen der Org (Name, ini_key, Rezept, Beschreibung). Wird beim Import angelegt.

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| name | text | nein |
| name_norm | text | ja |
| ini_key | text | ja |
| created_at | timestamptz | nein |
| category | text | ja |
| details | jsonb | ja |
| details_checked_at | timestamptz | ja |
| recipe | jsonb | ja |
| recipe_checked_at | timestamptz | ja |
| recipe_state | text | ja |

## cash_ledger

Kassenbuch der Org.

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| item_id | bigint | ja |
| item_name | text | nein |
| quantity | integer | nein |
| buyer_id | uuid | ja |
| buyer_name | text | nein |
| amount_auec | bigint | nein |
| confirmed_by | uuid | ja |
| created_at | timestamptz | nein |

## catalog_blueprints

Alle herstellbaren Blaupausen im Spiel (aus der Star Citizen Wiki API), mit Zutaten und Missionsgebern.

| Spalte | Typ | leer erlaubt |
|---|---|---|
| uuid | uuid | nein |
| name | text | nein |
| name_norm | text | ja |
| class_name | text | ja |
| type | text | ja |
| type_label | text | ja |
| grade | text | ja |
| craft_secs | integer | ja |
| free | boolean | nein |
| ingredient_count | integer | nein |
| ingredients | jsonb | nein |
| missions_count | integer | nein |
| sources | jsonb | nein |
| detail | jsonb | ja |
| detail_checked_at | timestamptz | ja |
| game_version | text | ja |
| synced_at | timestamptz | nein |

## catalog_meta

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | integer | nein |
| synced_at | timestamptz | ja |
| blueprint_count | integer | ja |
| mission_count | integer | ja |
| giver_count | integer | ja |
| game_version | text | ja |

## craft_requests

Anfragen: Mitglied bittet Besitzer einer Blaupause um Herstellung.

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| blueprint_id | bigint | nein |
| requester_id | uuid | nein |
| qty | integer | nein |
| note | text | ja |
| status | text | nein |
| taker_id | uuid | ja |
| discord_channel_id | text | ja |
| discord_message_id | text | ja |
| created_at | timestamptz | nein |
| updated_at | timestamptz | nein |

## discord_link_codes

| Spalte | Typ | leer erlaubt |
|---|---|---|
| user_id | uuid | nein |
| code | text | nein |
| expires_at | timestamptz | nein |

## event_role_requirements

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| event_id | bigint | nein |
| name | text | nein |
| quantity | integer | nein |

## event_ship_requirements

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| event_id | bigint | nein |
| ship_id | bigint | nein |
| quantity | integer | nein |

## event_signups

Anmeldungen zu Operationen (event_id, user_id, Rolle, Schiff).

| Spalte | Typ | leer erlaubt |
|---|---|---|
| event_id | bigint | nein |
| user_id | uuid | nein |
| attended | boolean | nein |
| signed_up_at | timestamptz | nein |
| role_id | bigint | ja |

## events

Operationen. status: planned/running/finished/cancelled. starts_at: Beginn. Geplante Operationen, die 3 Tage nach dem Termin nicht gestartet wurden, sagt die WebApp automatisch ab.

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| title | text | nein |
| description | text | ja |
| starts_at | timestamptz | nein |
| min_players | integer | nein |
| required_roles | text | ja |
| points | integer | nein |
| status | enum | nein |
| created_by | uuid | nein |
| created_at | timestamptz | nein |
| finished_at | timestamptz | ja |
| discord_channel_id | text | ja |
| discord_message_id | text | ja |
| reminder_60_sent_at | timestamptz | ja |
| reminder_10_sent_at | timestamptz | ja |
| time_set_at | timestamptz | nein |
| discord_event_id | text | ja |

## hangar_ships

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| user_id | uuid | nein |
| ship_id | bigint | nein |
| source | enum | nein |
| pledge_value_eur | numeric | ja |
| created_at | timestamptz | nein |

## import_tokens

Persönlicher Schlüssel für den PC-Helfer (nur der SHA-256-Fingerabdruck wird gespeichert). Nur der Server liest die Tabelle.

| Spalte | Typ | leer erlaubt |
|---|---|---|
| user_id | uuid | nein |
| token_hash | text | nein |
| created_at | timestamptz | nein |
| last_used_at | timestamptz | ja |
| use_count | integer | nein |

## invite_codes

| Spalte | Typ | leer erlaubt |
|---|---|---|
| code | text | nein |
| note | text | ja |
| max_uses | integer | nein |
| uses | integer | nein |
| expires_at | timestamptz | ja |
| revoked | boolean | nein |
| created_by | uuid | ja |
| created_at | timestamptz | nein |

## level_thresholds

| Spalte | Typ | leer erlaubt |
|---|---|---|
| level | integer | nein |
| min_points | integer | nein |

## login_attempts

| Spalte | Typ | leer erlaubt |
|---|---|---|
| key | text | nein |
| fails | integer | nein |
| window_start | timestamptz | nein |

## loot_claims

Ansprüche auf Loot.

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| item_id | bigint | nein |
| user_id | uuid | nein |
| status | text | nein |
| created_at | timestamptz | nein |

## loot_items

Loot der Org (Status locked/released/sold/awarded, Ort player/vizsla_bank).

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| event_id | bigint | ja |
| name | text | nein |
| quantity | integer | nein |
| holder_id | uuid | ja |
| location | enum | nein |
| location_note | text | ja |
| status | enum | nein |
| price_auec | bigint | ja |
| created_by | uuid | ja |
| created_at | timestamptz | nein |
| released_at | timestamptz | ja |
| released_by | uuid | ja |
| winner_id | uuid | ja |
| sold_at | timestamptz | ja |
| discord_channel_id | text | ja |
| discord_message_id | text | ja |

## loot_log

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| item_id | bigint | nein |
| user_id | uuid | ja |
| action | text | nein |
| detail | text | ja |
| created_at | timestamptz | nein |

## maintenance_runs

| Spalte | Typ | leer erlaubt |
|---|---|---|
| name | text | nein |
| last_run | timestamptz | nein |

## password_reset_codes

| Spalte | Typ | leer erlaubt |
|---|---|---|
| user_id | uuid | nein |
| code_hash | text | nein |
| source | text | nein |
| created_at | timestamptz | nein |
| expires_at | timestamptz | nein |

## player_blueprints

Wer besitzt welche Blaupause (user_id, blueprint_id, acquired_at, source).

| Spalte | Typ | leer erlaubt |
|---|---|---|
| user_id | uuid | nein |
| blueprint_id | bigint | nein |
| acquired_at | timestamptz | ja |
| source | text | nein |
| created_at | timestamptz | nein |

## player_stats

| Spalte | Typ | leer erlaubt |
|---|---|---|
| user_id | uuid | ja |
| username | text | ja |
| total_points | integer | ja |
| ops_count | integer | ja |
| level | integer | ja |

## points_log

Punkteverlauf; daraus ergeben sich Level.

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| user_id | uuid | nein |
| event_id | bigint | ja |
| points | integer | nein |
| reason | text | nein |
| created_at | timestamptz | nein |

## profiles

Mitglieder. id = Supabase-Auth-ID. role: member/officer/admin. approved: erst nach Freigabe durch einen Admin darf man etwas sehen. blocked: gesperrt. discord_id: Discord-Kennung (nur wenn verknüpft). login_name: Benutzername für die Anmeldung ohne Discord.

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | uuid | nein |
| discord_id | text | ja |
| username | text | ja |
| avatar_url | text | ja |
| role | enum | nein |
| created_at | timestamptz | nein |
| approved | boolean | nein |
| pending_notified | boolean | nein |
| blocked | boolean | nein |
| login_name | text | ja |

## ships

| Spalte | Typ | leer erlaubt |
|---|---|---|
| id | bigint | nein |
| name | text | nein |
| manufacturer | text | nein |
| created_at | timestamptz | nein |

## shopping_list

Einkaufsliste je Mitglied (user_id, blueprint_id, qty).

| Spalte | Typ | leer erlaubt |
|---|---|---|
| user_id | uuid | nein |
| blueprint_id | bigint | nein |
| qty | integer | nein |
| created_at | timestamptz | nein |
