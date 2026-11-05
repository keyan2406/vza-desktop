# Die WebApp „VZA Org-Manager“ – Überblick

## Was sie ist
Eine Verwaltungs-Webseite für die Star-Citizen-Org Clan Vizsla (Slogan „This is the way“, Kürzel VZA). Sie läuft produktiv und wird von den Mitgliedern täglich benutzt.
- **Technik:** Next.js 16 (App Router, Cache Components, Tailwind v4), Supabase (Anmeldung, PostgreSQL mit Zeilen-Sicherheit), gehostet bei Vercel (Hobby, Region Frankfurt `fra1`), Discord-Bot über HTTP-Interaktionen.
- **Hinweis:** Dieses Programm soll die WebApp am Ende **ersetzen** (siehe `10-architektur-autonom.md`). Bis dahin läuft sie unverändert weiter. **Repository der WebApp:** privat (`keyan2406/vza-org-manager`), lokal `C:\Users\keyan\Documents\vza-org-manager`. **Nicht Teil dieses Projekts. Nicht verändern.**
- Die Adresse der WebApp (Vercel) nennt dir Keyan. Sie steht in der Umgebungsvariable `SITE_URL` der WebApp.

## Module (Seiten, jeweils hinter Anmeldung)
| Adresse | Inhalt |
|---|---|
| `/dashboard` | Startseite: Level, Punkte, Aufgaben, Kacheln |
| `/operationen`, `/operationen/[id]`, `/operationen/verwalten` | Geplante Operationen, Anmeldung mit Rolle und Schiff, Abschluss mit Punkten und Loot (Officer/Admin) |
| `/kalender` | Monatsansicht der Operationen |
| `/hangar` | Schiffe der Mitglieder (ingame/pledge) |
| `/lager`, `/lager/[id]`, `/lager/verwalten` | Loot der Org: Freigabe, Anspruch (Claims), Verkauf, Zahlung |
| `/kassenbuch` | Kassenbuch der Org |
| `/blueprints` | Reiter: Katalog (alle ~1600 herstellbaren Blaupausen im Spiel), In der Org, Meine Sammlung, Anfragen, Einkaufsliste, Import |
| `/rangliste` | Rangliste nach Punkten |
| `/profil` | Anzeigename, Passwort, Discord verknüpfen, Animationen an/aus |
| `/benutzer` | Verwaltung (Admin): Freigabe, Rollen, Einladungen, Sperren, Datensicherung, Discord-Einstellungen, System |

## Rollen und Freigabe
- Rollen: `member`, `officer`, `admin`. Neue Konten sind **nicht freigegeben** und sehen nur `/wartet`, bis ein Admin sie freigibt.
- Anmeldung: **nur Benutzername und Passwort** (Registrierung nur mit Einladungscode; es gibt bewusst keine E-Mail-Adressen). Die frühere Anmeldung mit Discord wurde entfernt. Discord dient nur noch dem **Bot** (Erwähnungen, Befehle), die Verknüpfung geschieht in Discord mit `/verknuepfen`. Passwort vergessen: in Discord `/passwort` (Bot gibt einen einmaligen Link) oder Admin erzeugt einen Link.
- Die Anmeldung der WebApp erzeugt **Cookies** (Supabase SSR). Das autonome Programm verwaltet seine Sitzung selbst (siehe `02-…`, Abschnitt Anmeldung).

## Discord-Anbindung (läuft in der WebApp, nicht im Programm)
Der Bot meldet neue Operationen, Erinnerungen (1 Stunde und 10 Minuten vorher), Loot, Anfragen und Absagen in Kanäle. Mitglieder nutzen Slash-Befehle (`/operationen`, `/blueprint …`, `/lager`, `/passwort`, `/verknuepfen` u. a.). Das Programm muss das **nicht** nachbauen.

## Wiederkehrende Abläufe der WebApp (gut zu wissen)
- Alle 5 Minuten ruft die Datenbank `/api/cron/reminders` auf: Erinnerungen, und **geplante Operationen werden automatisch abgesagt, wenn ihr Termin mehr als 3 Tage zurückliegt**.
- Blaupausen: Der Katalog stammt aus der Star Citizen Wiki API (api.star-citizen.wiki, inoffiziell, nicht kommerziell). Der Import der eigenen Blaupausen kommt aus dem Spiel-Log (siehe `03-spiel-logs.md`).

## Umgebungsvariablen der WebApp (nur Namen, nie Werte ins Repository)
`SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `DISCORD_*`, `AUTH_EMAIL_DOMAIN`, `WIKI_API_GAP_MS`. Das Programm braucht **keine** davon, nur die öffentliche Adresse der WebApp.

## Kennzeichnung
Die WebApp zeigt: „Inoffizielle Fan-Seite, nicht mit Cloud Imperium verbunden. Star Citizen®, Roberts Space Industries® und Cloud Imperium® sind eingetragene Marken von Cloud Imperium Rights LLC.“ Das Programm übernimmt diesen Hinweis im „Über“-Fenster und in der README.
