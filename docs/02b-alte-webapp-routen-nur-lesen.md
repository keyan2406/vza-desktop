# Schnittstellen der WebApp, die das Programm benutzen darf

**Wichtig:** Diese Schnittstellen sind **in Betrieb** und werden vom bestehenden PC-Helfer (PowerShell-Datei) benutzt. Sie dürfen nicht verändert werden, solange nicht beide Seiten angepasst sind. Quelltext zum Nachlesen: `reference/webapp/`.

Alle Adressen beginnen mit der Adresse der WebApp (`https://…vercel.app`, im Folgenden `SITE`).

## 1. Blaupausen eintragen (Schlüssel, kein Cookie)
`POST SITE/api/import/blueprints`

Kopfzeilen:
- `Authorization: Bearer vzh_XXXXXXXX…` (Schlüssel, siehe unten; Format `^vzh_[A-HJ-NP-Z2-9]{32}$`)
- `Content-Type: application/json; charset=utf-8`

Körper:
```json
{ "items": [ { "name": "Antium Core Storm", "at": "2026-03-26T17:15:41.684Z" }, { "name": "Spectre", "at": null } ] }
```
- `name`: 1 bis 120 Zeichen (längere werden gekürzt, leere ignoriert). `at`: ISO-Zeitpunkt aus dem Log oder `null`.
- Grenzen: höchstens **2000 Einträge** und **400 000 Zeichen** je Anfrage. Der Helfer sendet **höchstens 500 je Anfrage**.
- Die Anfrage ist **wiederholbar**: Doppelte (Groß-/Kleinschreibung egal) werden zusammengeführt, bei gleichem Namen zählt der **früheste** Zeitpunkt, **bereits vorhandene Besitz-Einträge werden nie überschrieben**.

Antworten (JSON, nie zwischengespeichert):
| Status | Inhalt | Bedeutung |
|---|---|---|
| 200 | `{"ok":true,"received":n,"added":n,"already_owned":n,"new_in_catalog":n,"skipped":n}` | Erfolg. `added` = neu in der Sammlung der Person. |
| 401 | `{"ok":false,"error":"invalid_token","message":"…"}` | Schlüssel falsch, ersetzt oder widerrufen → neu koppeln |
| 403 | `error: "not_allowed"` | Konto nicht freigegeben oder gesperrt |
| 400 | `error: "bad_data"` | JSON kaputt |
| 413 | `error: "too_large"` / `"too_many"` | zu viel auf einmal |
| 502 | `error: "server_error"` | Problem der Seite → später erneut |
| 503 | `error: "not_configured"` | WebApp falsch eingerichtet |
Das Feld `message` ist ein fertiger deutscher Text für die Anzeige.

## 2. Schlüssel holen (Cookie, angemeldete Person)
`POST SITE/api/import/helper` mit den Anmelde-Cookies der Person.
- Erlaubt nur ohne `Origin`-Kopfzeile oder wenn `Origin` genau die Adresse der WebApp ist.
- Antwort 200: **Text einer `.cmd`-Datei** (der bisherige PC-Helfer) mit den Zeilen `$Site = 'https://…'` und `$Token = 'vzh_…'`. Der Schlüssel lässt sich mit `/\$Token = '(vzh_[A-HJ-NP-Z2-9]{32})'/` herauslesen. Das ist ein **Behelf** für Phase 1.
- Fehler: 401 (nicht angemeldet), 403 (nicht freigegeben/fremde Herkunft), 500 (SQL 28 fehlt o. ä.), alles als Klartext.
- **Jeder Aufruf ersetzt den bisherigen Schlüssel dieser Person** (es gibt genau einen je Person). Der alte PC-Helfer (`.cmd`) und das Programm würden sich also gegenseitig ungültig machen. Das Programm muss den Nutzer dazu **vorher warnen**.
- Der Schlüssel darf **nur** Blaupausen in die **eigene** Sammlung eintragen.

## 3. Weitere bestehende Routen (für das Programm nicht gedacht)
- `GET SITE/api/export` – JSON-Datensicherung, nur Admin (Cookie).
- `POST SITE/api/cron/reminders` – nur Datenbank-Zeitplan (geheimer Schlüssel).
- `POST SITE/api/discord/interactions` – nur Discord (Signatur).
- Seiten und Server-Aktionen der WebApp sind **keine** stabile Schnittstelle, nicht aufrufen.

## 4. Was es (noch) NICHT gibt (Vorschläge für Phase 2, nur nach Freigabe, siehe `04-…` und `06-…`)
- `POST SITE/api/app/pair` → JSON statt Skript-Text, mehrere Schlüssel je Person (ein Gerät = ein Schlüssel, damit PC-Helfer und Programm sich nicht stören).
- `GET SITE/api/app/summary` (Schlüssel, nur lesen) → nächste Operationen, meine Anmeldungen, offene Anfragen an mich, Zahl auf meiner Einkaufsliste. Grundlage für Benachrichtigungen.
- Ein Schlüssel mit **Bereichen** (`import`, `read`), damit ein gestohlener Schlüssel nur wenig kann.
Alles davon wäre **neu und zusätzlich** (neue Routen, neue SQL-Datei ab Nummer 30), das bestehende Verhalten bleibt unverändert.

## 5. Anmeldung im Programmfenster
Die WebApp lässt sich in einem Fenster des Programms laden und anmelden (Discord-OAuth leitet über Discord und zurück zu `SITE/auth/callback`; Benutzername/Passwort geht direkt). Das Fenster braucht ein **dauerhaftes** Cookie-Speicherteil (`persist:` Partition), damit man angemeldet bleibt. Nicht freigegebene Konten landen auf `/wartet`.
