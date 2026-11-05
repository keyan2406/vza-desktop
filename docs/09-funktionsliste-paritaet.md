# Funktionsliste der WebApp (Grundlage für 1:1-Gleichheit)

Automatisch aus dem Quelltext erzeugt (Server-Aktionen = alles, was Nutzer in der WebApp **auslösen** können). Spalten: **RPC** = Datenbankfunktion, **Tabellen** = direkter Zugriff, **Server-Geheimnis** = braucht Dienst-Schlüssel (kann nicht im Programm laufen, siehe `10-architektur-autonom.md`), **Discord** = löst Discord-Meldungen aus (Bot-Token nötig).

Jede Zeile muss im Programm eine Entsprechung haben (oder ausdrücklich gestrichen werden, mit Keyans Zustimmung). Die Reihenfolge entspricht dem Menü der WebApp.


## benutzer

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `setUserRole` | set_user_role | – | nein | nein |
| `approveUser` | approve_user | – | nein | nein |
| `rejectUser` | reject_user | – | nein | nein |
| `blockUser` | block_user | – | nein | nein |
| `unblockUser` | unblock_user | – | nein | nein |
| `deleteMember` | delete_member | – | nein | nein |

## benutzer / Discord-Einstellungen

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `sendDiscordTest` | – | profiles | nein | **ja** |
| `registerDiscordCommands` | get_my_role | – | nein | **ja** |

## benutzer / Einladungscodes

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `createInviteCode` | – | invite_codes | nein | nein |
| `revokeInviteCode` | – | invite_codes | nein | nein |
| `deleteInviteCode` | – | invite_codes | nein | nein |

## benutzer / Passwort-Links

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `createPasswordLink` | admin_create_password_reset | – | nein | nein |

## benutzer / System-Prüfungen

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `measureSpeed` | get_my_role | level_thresholds | nein | nein |
| `testAccountSetup` | get_my_role | invite_codes, profiles | **ja** | **ja** |

## blueprints

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `importBlueprints` | – | – | nein | nein |
| `addBlueprintByName` | – | – | nein | nein |
| `removeBlueprint` | – | player_blueprints | nein | nein |
| `renameBlueprint` | – | blueprints | nein | nein |
| `deleteBlueprint` | – | blueprints | nein | nein |
| `setBlueprintCategory` | – | blueprints | nein | nein |
| `enrichBlueprints` | get_my_role | – | nein | nein |

## blueprints / Katalog

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `syncCatalogAction` | – | – | **ja** | nein |
| `catalogDetail` | – | blueprints, catalog_blueprints | **ja** | nein |
| `catalogAddToShopping` | ensure_org_blueprint | shopping_list | nein | nein |

## blueprints / Anfragen und Einkaufsliste

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `setShoppingQty` | – | shopping_list | nein | nein |
| `removeShopping` | – | shopping_list | nein | nein |
| `clearShopping` | – | shopping_list | nein | nein |
| `createCraftRequest` | create_craft_request | – | nein | **ja** |
| `takeCraftRequest` | take_craft_request | – | nein | nein |
| `closeCraftRequest` | close_craft_request, get_my_role | – | nein | nein |
| `diagnoseBlueprint` | – | blueprints | nein | nein |
| `retryRecipes` | – | – | nein | nein |

## blueprints / PC-Helfer

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `revokeImportHelper` | revoke_my_import_token | – | nein | nein |

## hangar

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `addShip` | – | hangar_ships | nein | nein |
| `removeShip` | – | hangar_ships | nein | nein |

## lager

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `claimLoot` | claim_loot | – | nein | **ja** |
| `withdrawClaim` | withdraw_claim | – | nein | nein |

## lager/verwalten

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `releaseLoot` | release_loot | – | nein | nein |
| `awardLoot` | award_loot | – | nein | **ja** |
| `confirmPayment` | confirm_payment | – | nein | **ja** |
| `cancelAward` | cancel_award | – | nein | **ja** |
| `moveLoot` | move_loot | – | nein | nein |

## operationen

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `signUp` | signup_for_event | – | nein | nein |
| `signOff` | – | event_signups | nein | nein |

## operationen/verwalten

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `createEvent` | create_event | – | nein | **ja** |
| `startEvent` | – | events | nein | **ja** |
| `cancelEvent` | – | events | nein | **ja** |
| `deleteEvent` | – | events | nein | nein |
| `finishEvent` | finish_event | – | nein | **ja** |
| `updateEvent` | update_event | – | nein | nein |

## profil

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `updateDisplayName` | set_display_name | – | nein | nein |

## auth

| Aktion | RPC | Tabellen | Server-Geheimnis | Discord |
|---|---|---|---|---|
| `startDiscordLink` | set_discord_link_code | – | nein | **ja** |
| `signInWithUsername` | – | – | nein | nein |
| `registerWithUsername` | – | – | nein | nein |
| `saveCredentials` | – | – | nein | nein |
| `resetPasswordWithCode` | – | – | nein | nein |
| `startDiscordLink` | set_discord_link_code | – | nein | **ja** |
| `signInWithUsername` | – | – | nein | nein |
| `registerWithUsername` | – | – | nein | nein |
| `saveCredentials` | – | – | nein | nein |
| `resetPasswordWithCode` | – | – | nein | nein |


# Seiten (Lesen): welche Daten jede Seite lädt

| Seite | RPC | Tabellen/Ansichten |
|---|---|---|
| `/benutzer` | – | invite_codes, player_stats, profiles |
| `/blueprints` | catalog_org_overview, my_import_helper_status | blueprints, craft_requests, player_blueprints, shopping_list |
| `/blueprints/suche` | – | – |
| `/dashboard` | run_daily_maintenance | profiles |
| `/hangar` | – | hangar_ships, ships |
| `/kalender` | – | events |
| `/kassenbuch` | – | cash_ledger |
| `/lager/[id]` | – | loot_items, loot_log |
| `/lager` | – | loot_items |
| `/lager/verwalten` | – | loot_items, profiles |
| `/operationen/[id]` | – | events |
| `/operationen` | – | events |
| `/operationen/verwalten/[id]/bearbeiten` | – | event_role_requirements, events, ships |
| `/operationen/verwalten/[id]` | – | events, loot_items, profiles |
| `/operationen/verwalten` | – | event_role_requirements, events, ships |
| `/profil` | – | – |
| `/rangliste` | run_daily_maintenance | player_stats |
| `/` | – | – |
| `/passwort-neu` | – | – |
| `/passwort-vergessen` | – | – |
| `/registrieren` | – | – |
| `/wartet` | – | profiles |


# Server-Teile ohne Oberfläche (müssen im autonomen Programm einen neuen Platz bekommen)
| Teil | Heute | Wofür |
|---|---|---|
| Discord-Bot (HTTP-Interaktionen) | `app/api/discord/interactions/route.ts`, `utils/discord-*.ts` | Slash-Befehle, Knöpfe an Nachrichten, Autovervollständigung |
| Erinnerungen und automatische Absage | `app/api/cron/reminders/route.ts`, `utils/discord-reminders.ts`, `utils/auto-cancel.ts`, Datenbank-Zeitplan (pg_cron) | Erinnerung 1 Stunde und 10 Minuten vorher; Absage 3 Tage nach dem Termin |
| Discord-Meldungen und -Events | `utils/discord-publish.ts`, `utils/notifications.ts`, `utils/discord-messages.ts`, `utils/discord-events.ts` | Operationen, Loot, Anfragen, Kasse, Admin-Meldungen, Server-Termine |
| Anmeldung mit Benutzername | `app/auth/actions.ts`, `utils/auth-*.ts` | Name → interne Anmelde-Adresse auflösen, Registrierung mit Einladungscode, Passwort-Links |
| Import-Schnittstelle für den PC-Helfer | `app/api/import/*`, `utils/import-api.ts` | im Programm nicht mehr nötig (das Programm trägt direkt ein) |
| Katalog-Abgleich | `app/(app)/blueprints/catalog-actions.ts`, `utils/catalog-sync.ts` | Wiki-API → `catalog_blueprints` (Dienst-Schlüssel zum Schreiben) |
| Datensicherung | `app/api/export/route.ts`, `utils/export-data.ts` | JSON-Export aller Tabellen |
| Beschreibungen/Rezepte aus der Wiki-API | `utils/item-info.ts`, `utils/item-enrich.ts` | Nachladen und Zwischenspeichern |

