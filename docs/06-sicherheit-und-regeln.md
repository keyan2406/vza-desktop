# Sicherheit, Spielregeln und Änderungen an der WebApp

## Spiel und Nutzungsbedingungen
- Das Programm **liest nur Textdateien** des Spiels (`Game.log`, `logbackups`). Das tun auch andere verbreitete Hilfsprogramme.
- **Verboten in diesem Projekt:** Speicher des Spiels lesen/schreiben, DLL-Einschleusung, Overlays, die sich ins Spiel einklinken, Eingaben simulieren, Makros, Veränderung von Spieldateien, Umgehung von Easy Anti-Cheat. Ein Hinweis auf solche Wünsche → ablehnen und Keyan erklären.
- Hinweis „Inoffizielles Fan-Programm, nicht mit Cloud Imperium verbunden“ im Programm und in der README.
- Die Wiki-API (`api.star-citizen.wiki`) ist inoffiziell und nicht kommerziell zu benutzen, mit Quellenangabe. Das Programm braucht sie nicht, die WebApp übernimmt das.

## Daten und Datenschutz
- Es werden nur gesendet: Namen erhaltener Blaupausen und ihr Zeitpunkt, an die eigene WebApp, mit dem persönlichen Schlüssel. Log-Dateien verlassen den Rechner nie.
- Alles Weitere (Spielzeit, Version, Rechnerdaten): **lokal**, nur mit ausdrücklicher Zustimmung und nur auf Wunsch senden.
- Keine Werbung, keine Zähler, keine Nutzer-Nachverfolgung. Absturzberichte nur lokal als Datei, die der Nutzer selbst weitergibt.
- Schlüssel: nie in Protokolle, nie in Fehlermeldungen, nie in Bildschirmfotos. Im Programm nur als „Gekoppelt als …“ anzeigen.

## Programm selbst (Electron)
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, kein `webSecurity: false`, kein `allowRunningInsecureContent`.
- Erlaubnisliste für Navigation und neue Fenster, Rest im Standardbrowser (`shell.openExternal` nur für `https:`).
- Zwischen Fenster und Programm nur eine kleine, gezielte Brücke (`contextBridge`) mit festen Funktionen, keine allgemeine Datei- oder Befehlsausführung.
- Content-Security-Policy für eigene Seiten des Programms (Offline-Seite, Einstellungen).
- Abhängigkeiten sparsam, Versionen festlegen, `npm audit` vor Veröffentlichung ansehen.

## Änderungen an Datenbank und WebApp (nur zusätzlich, nur mit Freigabe)
WebApp und Datenbank sind **produktiv**. Das autonome Programm braucht an der WebApp **nichts** zu ändern (sie läuft bis zur Umstellung unverändert weiter). Änderungen an der **Datenbank** (neue Funktionen, Regeln, Edge-Function-Zeitpläne) sind nötig und gelten diese Regeln:
1. Dieses Projekt ändert die WebApp **nicht**. Es hat kein Schreibrecht und keinen Zugang zu ihren Schlüsseln.
2. Braucht Phase 2 neue Schnittstellen, dann schreibt Claude Code zuerst einen **Vorschlag** (Routen, Daten, SQL, Risiken) und wartet auf Keyans Ja.
3. Umsetzung nur im **Branch** des WebApp-Repositorys (Keyan gibt den Ordner `C:\Users\keyan\Documents\vza-org-manager` frei) und über eine **Vercel-Vorschau**, nie direkt in `main`.
4. **Nur additiv:** neue Dateien/Routen, neue SQL-Dateien mit höherer Nummer (ab `30_…`, ausführbar mehrfach ohne Schaden, mit Test). Bestehende Routen (`/api/import/*`) und Tabellen behalten ihr Verhalten, auch für den alten PC-Helfer.
5. Die WebApp hat 600 automatische Tests (`npm test`) und eine Code-Prüfung (`npm run lint`), beide müssen grün bleiben. Neue Routen bekommen eigene Tests nach dem Muster von `tests/*.test.mjs` der WebApp.
6. SQL führt **Keyan** selbst im Supabase-SQL-Editor aus (Schritt-für-Schritt-Anleitung liefern). Erst danach darf die Vorschau getestet werden.
7. Merge in `main` erst, wenn Keyan das Programm mit der Vorschau erfolgreich ausprobiert hat. Rückweg erklären (Revert).
