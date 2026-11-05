# Star-Citizen-Logs lesen

Das Spiel schreibt Textprotokolle. Die WebApp nutzt sie, um zu erkennen, welche **Blaupausen** jemand erhalten hat. Es gibt dafür bereits **zwei getestete Umsetzungen**, die als Vorlage dienen:
- `reference/spiel-logs/log-scan.ts` – Erkennung im Browser (TypeScript, ohne Abhängigkeiten) und `log-scan.test.mjs` (22 Prüfungen).
- `reference/spiel-logs/helper.ps1` – PowerShell-Programm: Ordnersuche, Mitlesen, Senden (31 Ende-zu-Ende-Prüfungen in `end-to-end-test-beispiel.mjs`).
Beide liefern für dieselben Dateien **dasselbe Ergebnis** (Vergleich mit `beispiel-logs/`). Das muss so bleiben.

## Orte
- Spielordner (üblich): `C:\Program Files\Roberts Space Industries\StarCitizen\LIVE`, bei anderen Laufwerken z. B. `D:\Games\StarCitizen\LIVE`. Auch `PTU`, `EPTU`, `HOTFIX` kommen vor.
- Aktuelle Sitzung: `LIVE\Game.log`. Ältere Sitzungen: `LIVE\logbackups\Game Build(…) … .log`.
- **Wichtig:** `C:\Program Files` ist für Browser gesperrt (Chrome/Edge blockieren die Ordner-Auswahl). Ein Desktop-Programm hat dieses Problem nicht. Das ist ein Hauptgrund für das Programm.
- Suche: alle festen Laufwerke × typische Unterordner (siehe `Find-Folder` im PowerShell-Beispiel), gemerkter Ordner, sonst den Nutzer fragen (Ordner-Dialog). Der Nutzer muss den Ordner jederzeit ändern können.

## Format der gesuchten Zeilen
Beispiel (eine Zeile, englischer Client):
```
<2026-03-26T17:15:41.684Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Defiance Helmet Tactical: " [23] to queue.
```
Deutscher Client: `Bauplan erhalten:` statt `Received Blueprint:`.
Regeln (siehe `log-scan.ts`, nicht neu erfinden):
- Marker: `Received Blueprint` oder `Bauplan erhalten`.
- Zeilen mit `UpdateNotificationItem` sind Wiederholungen und werden **ignoriert**.
- Name: Text zwischen `Received Blueprint: ` und `: "`, Fallback ohne den zweiten Doppelpunkt. Leerraum zusammenfassen, Doppelpunkt/Leerzeichen am Ende entfernen, Länge 1–120.
- Zeitpunkt: `<…Z>` am Zeilenanfang, sonst `null`.
- Zeilen über 3000 Zeichen ignorieren. Doppelte Namen: **frühester** Zeitpunkt zählt.
- Namen mit Umlauten, Anführungszeichen (`Parallax "Sunstone" Rifle`), Emojis und Rückstrichen müssen unverändert ankommen.

## Fallstricke (alle schon im PowerShell-Beispiel gelöst)
1. **Datei wird vom Spiel beschrieben.** Immer mit „teilen erlaubt“ öffnen (in Node ist das der Standard, `fs.open` mit Lese-Flag). Nie sperren, nie ändern.
2. **Halbe Zeilen:** Nur vollständige Zeilen (bis zum Zeilenumbruch) verarbeiten, den Rest beim nächsten Durchlauf mitnehmen, sonst geht eine Blaupause verloren. Bei **abgeschlossenen** Sicherungen darf auch eine letzte Zeile ohne Umbruch gelesen werden.
3. **Neue Spielsitzung:** `Game.log` wird dann kleiner (die alte Datei wandert nach `logbackups`). Position zurücksetzen, die neue Datei von vorn lesen und zusätzlich die neueste Sicherung noch einmal prüfen (Schlusszeile).
4. **Große Dateien** (mehrere hundert MB): in Stücken lesen (Beispiel: 8 MB), nicht komplett in den Speicher. Messwert des Beispiels: 323 MB in 1,8 s.
5. **UTF-8**, gelegentlich mit BOM am Dateianfang → entfernen. CRLF und LF kommen vor.
6. **Senden:** Das autonome Programm ist angemeldet und ruft die Datenbankfunktion `add_my_blueprints(p_items jsonb, p_source text)` direkt auf (Format der Einträge wie in `reference/webapp-source/utils/import-api.ts`: `{name, at}`; Regeln: Doppelte zusammenführen, frühester Zeitpunkt, Vorhandenes nie überschreiben, wiederholbar). Pakete zu höchstens 500, bei Netzfehlern merken und **später wiederholen**. Eine Warteschlange muss einen Neustart des Programms überleben. (Die Schlüssel-Schnittstelle `/api/import/blueprints` der WebApp ist nur für den alten PC-Helfer und wird nicht gebraucht.)
7. Das Spiel beendet sich oft nicht sauber, Dateien können kurz nicht lesbar sein → still erneut versuchen.

## Testdaten
`reference/spiel-logs/beispiel-logs/a/` (Game.log + 2 Sicherungen, mit BOM, CRLF, Umlauten, Anführungszeichen, Wiederholungszeile, langer Zeile, doppelten Namen mit verschiedenen Zeiten) und `b/` (keine Blaupausen). Erwartetes Ergebnis für `a/`: 9 Blaupausen, darunter `Antium Core Storm` mit frühestem Zeitpunkt `2026-03-20T08:00:00.000Z`.
Eigene Tests sollen diese Dateien benutzen und mit `log-scan.ts` vergleichen (Gleichheit der Ergebnisse).

## Was zusätzlich aus den Logs möglich wäre (nur lokal, nur mit Zustimmung, siehe Phase 3)
Spielzeit-Sitzungen (Start/Ende des Spiels), erkannte Spielversion. **Nichts davon ohne Zustimmung des Nutzers an die WebApp senden.**
