# Prüfungen

`npm test` führt alle Dateien `*.test.mjs` in diesem Ordner aus (rund 600 Einzelprüfungen für Erkennung der Blaupausen, Discord-Befehle und -Nachrichten,
Katalog, Anmelde-Regeln, automatische Absage, Sicherheits-Kopfzeilen und mehr). Sie brauchen weder Internet noch Datenbank.

Einmalig einrichten:

1. `npm install -D tsx`
2. In `package.json` unter `"scripts"` die Zeile ergänzen: `"test": "node tests/run.mjs"`

Eine einzelne Datei: `node --import tsx tests/log.test.mjs`

Ändert sich das Aussehen einer Meldung oder eine Regel absichtlich, passt man die betroffene Prüfung an. Schlägt eine Prüfung unerwartet fehl,
hat die letzte Änderung vermutlich etwas kaputt gemacht.
